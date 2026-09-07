export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — full server-driven agent loop

import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";
import { requireUser } from "@/lib/auth-server";
import {
  BUILDER_TOOLS,
  buildAgentMessages,
  parseToolCall,
  detectMode,
  type ToolCall,
  type AgentMode,
} from "@/lib/agent-tools";
import { createLogger } from "@/lib/logger";
import { validateUrl, UrlGuardError, getAllowedHostsFromEnv } from "@/lib/url-guard";
import { readJsonWithLimit, LARGE_MAX_BODY } from "@/lib/body-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { executeToolOnSandbox } from "@/lib/sandbox-tool-executor";
import { getSandboxForBuilder } from "@/lib/sandbox-provider";
import type { E2BSandbox } from "@/lib/e2b-sandbox";

const log = createLogger("api/builder-agent");

// Max number of server-side rounds per request (LLM → tools → LLM → ...).
// Mirrors the old client-side MAX_ROUNDS cap to prevent a buggy model from
// spinning forever in a single request.
const MAX_ROUNDS = 25;

// ---------------------------------------------------------------------------
// LLM call helper (streaming) — one "turn" of the agent.
// Returns the aggregated content + tool_calls, streaming content to `emit`.
// ---------------------------------------------------------------------------

interface LlmTurn {
  content: string;
  toolCalls: ToolCall[];
}

async function callLlm(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }>,
  emit: (event: string, data: unknown) => void,
  emitTerminal: (line: string) => void,
): Promise<LlmTurn> {
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_RETRIES = 3;
  let llmResponse: Response | null = null;
  let lastErrStatus = 0;
  let lastErrText = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    llmResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        tools: BUILDER_TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 8192,
        stream: true,
      }),
    });

    if (llmResponse.ok) break;

    lastErrStatus = llmResponse.status;
    lastErrText = await llmResponse.text().catch(() => "Unknown error");

    if (!RETRYABLE.has(llmResponse.status) || attempt === MAX_RETRIES) break;

    const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
    log.warn("callLlm", "LLM HTTP retryable error", { status: llmResponse.status, attempt: attempt + 1, maxRetries: MAX_RETRIES });
    emit("status", {
      phase: "retrying",
      message: `AI provider error ${llmResponse.status}, mencoba lagi (${attempt + 1}/${MAX_RETRIES})...`,
    });
    emitTerminal(`[retry] AI provider error ${llmResponse.status}, mencoba lagi (${attempt + 1}/${MAX_RETRIES})...`);
    await new Promise((r) => setTimeout(r, delay));
  }

  if (!llmResponse || !llmResponse.ok) {
    throw new Error(
      `AI provider error ${lastErrStatus}${lastErrText ? ": " + lastErrText.slice(0, 300) : ""}. Coba lagi nanti.`,
    );
  }
  if (!llmResponse.body) {
    throw new Error("Empty AI response stream");
  }

  // Stream + aggregate.
  const reader = llmResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let aggContent = "";
  const aggToolCalls: ToolCall[] = [];

  readerLoop: while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });

    let eventEnd: number;
    while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);

      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;

      const payload = dataLine.slice(6).trim();
      if (payload === "[DONE]") break readerLoop;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string;
          }>;
        };

        const choice = parsed.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) {
          const chunk = choice.delta.content;
          aggContent += chunk;
          emit("thinking_delta", { text: chunk });
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!aggToolCalls[idx]) {
              aggToolCalls[idx] = {
                id: tc.id ?? `tc-${Date.now()}-${idx}`,
                type: "function",
                function: { name: "", arguments: "" },
              };
            }
            if (tc.id) aggToolCalls[idx].id = tc.id;
            if (tc.function?.name) aggToolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) aggToolCalls[idx].function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // skip malformed event
      }
    }
  }

  return {
    content: aggContent,
    toolCalls: aggToolCalls.filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// POST handler — full server-driven agent loop.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  log.info("POST", "Request received");

  // Auth gate.
  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  // Rate limit.
  {
    const limited = enforceRateLimit(
      req,
      { limit: 60, windowMs: 60_000, prefix: "builder-agent" },
      user.id,
    );
    if (limited) return limited;
  }

  // 1. Parse body.
  let body: Record<string, unknown>;
  try {
    body = await readJsonWithLimit<Record<string, unknown>>(req, LARGE_MAX_BODY);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model = typeof body.model === "string" ? body.model : "kr/claude-haiku-4.5";

  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  const planMarkdown = typeof body.planMarkdown === "string" ? body.planMarkdown : null;

  const requestedMode =
    typeof body.mode === "string" &&
    ["architect", "code", "debug"].includes(body.mode as string)
      ? (body.mode as AgentMode)
      : null;

  // 2. Resolve AI config (server-only; no client override).
  let apiKey: string;
  let baseUrl: string;
  try {
    const cfg = resolveAIConfig({});
    apiKey = cfg.apiKey;
    baseUrl = cfg.baseUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid AI config";
    return Response.json({ error: message }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json({ error: "AI provider not configured" }, { status: 400 });
  }

  // SSRF guard.
  try {
    validateUrl(baseUrl, {
      allowedHosts: getAllowedHostsFromEnv("ALLOWED_AI_HOSTS"),
    });
  } catch (e) {
    if (e instanceof UrlGuardError) {
      return Response.json({ error: "Invalid baseUrl: " + e.code }, { status: 400 });
    }
    throw e;
  }

  // 3. SSE Response.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* stream closed */
        }
      };

      const emitTerminal = (line: string) => {
        emit("terminal", { text: line });
      };

      // NOTE: sandbox is obtained lazily from the shared manager. If Docker is
      // unavailable/unconfigured, getOrCreate will throw — we surface that as
      // a terminal error so the client sees a clear message instead of hanging.
      let sandbox: E2BSandbox | null = null;

      try {
        log.debug("POST", "Starting server-driven agent loop", { projectId, promptLength: prompt.length });

        // Acquire the sandbox for this project/user up-front. Fail fast with a
        // clear terminal error if the backend is unavailable.
        try {
          sandbox = await getSandboxForBuilder().getOrCreate(projectId, user.id);
        } catch (e) {
          log.error("POST", "Failed to acquire sandbox", { error: String(e) });
          emit("error", {
            error: `Sandbox tidak tersedia: ${e instanceof Error ? e.message : "unknown error"}`,
          });
          return;
        }

        // Resolve mode.
        const hasFiles = false; // sandbox will provide file tree once wired in
        let mode: AgentMode =
          requestedMode ??
          detectMode({ hasFiles, prompt, hasPlan: !!(planMarkdown && planMarkdown.trim().length > 0) });

        log.debug("POST", "Agent mode resolved", { mode });
        emit("status", { phase: "mode", message: mode });

        // Build the LLM-shaped message history (system + user + assistant/tool).
        const messages: Array<{
          role: string;
          content: string | null;
          tool_calls?: ToolCall[];
          tool_call_id?: string;
        }> = [];

        const built = buildAgentMessages({
          userPrompt: prompt,
          mode,
          projectPlan: planMarkdown ?? undefined,
          existingFiles: undefined,
          history: [],
        });
        for (const m of built) {
          messages.push({ role: m.role, content: m.content });
        }

        let round = 0;
        let finalSummary = "";
        let sawDone = false;

        while (!sawDone && round < MAX_ROUNDS) {
          round++;
          emit("status", { phase: "thinking", message: "AI sedang berpikir..." });

          const turn = await callLlm(baseUrl, apiKey, model, messages, emit, emitTerminal);
          log.debug("POST", "LLM turn complete", { round, contentLen: turn.content.length, toolCalls: turn.toolCalls.length });

          // Emit tool_call events for the UI activity feed.
          for (const tc of turn.toolCalls) {
            const parsed = parseToolCall(tc);
            emit("tool_call", {
              id: tc.id,
              name: parsed?.name ?? tc.function.name,
              args: parsed?.args ?? ({ _raw: tc.function.arguments } as Record<string, unknown>),
            });
          }

          // Append assistant turn to history.
          messages.push({
            role: "assistant",
            content: turn.content || null,
            tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
          });

          // No tool calls → final turn (architect plan or plain text reply).
          if (turn.toolCalls.length === 0) {
            finalSummary = turn.content || "Done";
            sawDone = true;
            break;
          }

          // Execute each tool call against the sandbox.
          for (const tc of turn.toolCalls) {
            emit("status", { phase: "executing", message: tc.function.name });
            const res = await executeToolOnSandbox(sandbox, tc, {
              onStdout: (c) => emitTerminal(c),
              onStderr: (c) => emitTerminal(c),
            });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: res.result,
            });
            if (res.isDone) {
              sawDone = true;
              finalSummary = res.doneSummary ?? (turn.content || "Done");
            }
          }
        }

        if (round >= MAX_ROUNDS && !sawDone) {
          emitTerminal(`\n⚠ Max ${MAX_ROUNDS} rounds reached`);
        }

        emit("done", {
          summary: finalSummary || "Done",
          iterations: round,
          mode,
          continuation: null,
        });
        log.debug("POST", "Loop done", { rounds: round, summaryLen: finalSummary.length });
      } catch (e) {
        log.error("POST", "Fatal error caught at top level", { error: String(e) });
        emit("error", { error: e instanceof Error ? e.message : "Unknown error" });
      } finally {
        controller.close();
        log.debug("POST", "Stream controller closed");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
