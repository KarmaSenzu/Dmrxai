export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — single LLM turn per request; client drives the loop

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

const log = createLogger("api/builder-agent");

// ---- POST handler ----
//
// Stateless single-turn agent for the StackBlitz-backed App Builder.
//
// The server makes ONE LLM call per request: it streams the assistant's
// reasoning (as `thinking_delta`), emits any `tool_call`s, then ends with a
// `done` event. The client executes the tool calls against an in-memory file
// map (there is no server-side sandbox — StackBlitz runs the project in the
// browser) and re-POSTs the extended history to continue the loop. The loop
// ends when the model stops calling tools (or calls `done`), signalled by
// `continuation: null`.

export async function POST(req: NextRequest) {
  log.info("POST", "Request received");

  // Auth gate — builder agent is a protected route.
  let _user;
  try {
    _user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  // Rate limit: builder agent is the most expensive endpoint (LLM call).
  {
    const limited = enforceRateLimit(
      req,
      { limit: 60, windowMs: 60_000, prefix: "builder-agent" },
      _user.id,
    );
    if (limited) return limited;
  }

  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await readJsonWithLimit<Record<string, unknown>>(req, LARGE_MAX_BODY);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model =
    typeof body.model === "string" ? body.model : "kr/claude-haiku-4.5";

  // Continuation flag: the client round-trips the full LLM-shaped message
  // history back to the server after each client-side tool exec. In that mode
  // `prompt` is empty and `history` already carries the assistant turn + tool
  // results from the previous round.
  const continuation = body.continuation === true;

  if (!continuation && !prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  // Parse client-provided files, history, and planMarkdown.
  const existingFiles = typeof body.existingFiles === "object" && body.existingFiles
    ? body.existingFiles as Record<string, string>
    : undefined;

  // Per-file size cap. Combined with LARGE_MAX_BODY this prevents a
  // pathological single-file payload from blowing past memory.
  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB per file
  if (existingFiles && typeof existingFiles === "object") {
    for (const [path, content] of Object.entries(existingFiles)) {
      if (typeof content === "string" && content.length > MAX_FILE_SIZE) {
        return Response.json(
          { error: `File ${path} too large (max ${MAX_FILE_SIZE} bytes per file)` },
          { status: 413 },
        );
      }
    }
  }

  const history = Array.isArray(body.history)
    ? (body.history as Array<{
        role: string;
        content: string | null;
        tool_calls?: ToolCall[];
        tool_call_id?: string;
      }>).slice(-60) // larger window for continuation: 1 round = up to N tool msgs
    : [];
  const planMarkdown = typeof body.planMarkdown === "string" ? body.planMarkdown : null;

  // Parse explicit mode from request body (or auto-detect later)
  const requestedMode = typeof body.mode === "string" && ["architect", "code", "debug"].includes(body.mode as string)
    ? (body.mode as AgentMode)
    : null;

  // 2. Resolve AI config
  let apiKey: string;
  let baseUrl: string;
  try {
    const cfg = resolveAIConfig({
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    });
    apiKey = cfg.apiKey;
    baseUrl = cfg.baseUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid AI config";
    return Response.json({ error: message }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json(
      { error: "AI provider not configured" },
      { status: 400 },
    );
  }

  // SSRF guard: validate baseUrl before any upstream fetch.
  try {
    validateUrl(baseUrl, {
      allowedHosts: getAllowedHostsFromEnv("ALLOWED_AI_HOSTS"),
    });
  } catch (e) {
    if (e instanceof UrlGuardError) {
      return Response.json(
        { error: "Invalid baseUrl: " + e.code },
        { status: 400 },
      );
    }
    throw e;
  }

  // 3. SSE Response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          /* stream closed */
        }
      };

      try {
        log.debug("POST", "Starting agent turn", { projectId, promptLength: prompt.length, continuation });

        const existingFilesMap: Record<string, string> = {};
        if (existingFiles && Object.keys(existingFiles).length > 0) {
          for (const [path, content] of Object.entries(existingFiles)) {
            existingFilesMap[path] = content;
          }
        }
        const hasFiles = Object.keys(existingFilesMap).length > 0;

        // Resolve mode. Continuation calls carry an empty prompt so detectMode
        // would always pick "architect"; the client sends mode explicitly on
        // continuation, but fall back to "code" if it didn't.
        let mode: AgentMode =
          requestedMode ??
          (continuation
            ? "code"
            : detectMode({
                hasFiles,
                prompt,
                hasPlan: !!(planMarkdown && planMarkdown.trim().length > 0),
              }));

        if (!requestedMode && hasFiles && mode === "architect") {
          log.warn("POST", "hasFiles=true but auto-detected architect — forcing code mode");
          mode = "code";
        }

        log.debug("POST", "Agent mode resolved", { mode, fileCount: Object.keys(existingFilesMap).length });
        emit("status", { phase: "mode", message: mode });

        // 4. Build messages.
        const messages: Array<{
          role: "system" | "user" | "assistant" | "tool";
          content: string | null;
          tool_calls?: ToolCall[];
          tool_call_id?: string;
        }> = [];

        if (continuation) {
          // Use buildAgentMessages with empty prompt to get the system
          // block(s), then append the client-provided LLM-shaped history.
          const systemBlocks = buildAgentMessages({
            userPrompt: "",
            mode,
            projectPlan: planMarkdown ?? undefined,
            existingFiles: hasFiles ? existingFilesMap : undefined,
            history: [],
          }).filter((m) => m.role === "system");
          messages.push(...systemBlocks.map((m) => ({ ...m, content: m.content })));

          for (const m of history) {
            if (
              m.role === "user" ||
              m.role === "assistant" ||
              m.role === "tool" ||
              m.role === "system"
            ) {
              messages.push({
                role: m.role as "system" | "user" | "assistant" | "tool",
                content: m.content,
                tool_calls: m.tool_calls,
                tool_call_id: m.tool_call_id,
              });
            }
          }
          log.debug("POST", "Continuation call", { systemBlocks: systemBlocks.length, historyEntries: history.length });
        } else {
          const recentHistory = history
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: (m.content ?? "").slice(0, 4000),
            }));

          const built = buildAgentMessages({
            userPrompt: prompt,
            mode,
            projectPlan: planMarkdown ?? undefined,
            existingFiles: hasFiles ? existingFilesMap : undefined,
            history: recentHistory,
          });
          for (const m of built) {
            messages.push({ ...m, content: m.content });
          }
          log.debug("POST", "Built messages", { historyEntries: recentHistory.length });
        }

        emit("status", { phase: "thinking", message: "AI sedang berpikir..." });

        // 5. Single LLM call (streaming) with retry on transient errors.
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
          log.warn("POST", "LLM HTTP retryable error", { status: llmResponse.status, attempt: attempt + 1, maxRetries: MAX_RETRIES });
          emit("status", {
            phase: "retrying",
            message: `AI provider error ${llmResponse.status}, mencoba lagi (${attempt + 1}/${MAX_RETRIES})...`,
          });
          await new Promise((r) => setTimeout(r, delay));
        }

        if (!llmResponse || !llmResponse.ok) {
          log.error("POST", "LLM HTTP error after retries", { status: lastErrStatus, error: lastErrText.slice(0, 200) });
          const errMsg = `AI provider error ${lastErrStatus}${lastErrText ? ": " + lastErrText.slice(0, 300) : ""}. Coba lagi nanti.`;
          emit("error", { error: errMsg });
          return;
        }
        if (!llmResponse.body) {
          log.error("POST", "LLM empty response body");
          emit("error", { error: "Empty AI response stream" });
          return;
        }

        // 6. Stream + aggregate. Content tokens stream to the client as
        // `thinking_delta`; tool_calls accumulate (arguments arrive as JSON
        // fragments) and are only acted on once [DONE] is observed.
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

        const toolCalls = aggToolCalls.filter(Boolean);
        const hasToolCalls = toolCalls.length > 0;
        log.debug("POST", "LLM turn complete", { contentLen: aggContent.length, toolCalls: toolCalls.length });

        // 7. Emit each tool_call so the client UI mirrors the activity feed.
        if (hasToolCalls) {
          for (const toolCall of toolCalls) {
            const parsed = parseToolCall(toolCall);
            emit("tool_call", {
              id: toolCall.id,
              name: parsed?.name ?? toolCall.function.name,
              args:
                parsed?.args ??
                ({ _raw: toolCall.function.arguments } as Record<string, unknown>),
            });
          }
        }

        // 8. Echo the assistant turn so the client can append it to history
        // before executing tools (assistant(tool_calls) → tool result(s)).
        const assistantEcho = {
          role: "assistant" as const,
          content: aggContent || null,
          tool_calls: hasToolCalls ? toolCalls : undefined,
        };

        emit("done", {
          summary: aggContent || "",
          iterations: 1,
          mode,
          // "client-execute" — client must run tool_calls locally and re-POST
          // the extended history. null — true completion (no more tools).
          continuation: hasToolCalls ? "client-execute" : null,
          assistant_message: assistantEcho,
        });
        log.debug("POST", "Turn done", { toolCalls: toolCalls.length, continuation: hasToolCalls ? "client-execute" : "null" });
      } catch (e) {
        log.error("POST", "Fatal error caught at top level", { error: String(e) });
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        emit("error", { error: errorMessage });
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
