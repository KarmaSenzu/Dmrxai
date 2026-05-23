import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";
import { TOOL_DEFINITIONS } from "@/lib/tools";

export const runtime = "edge";

// Rough token estimate for guardrail purposes only.
// Tabular/CSV-heavy text is the densest case (~3.0 chars/token); we divide by 3.0
// so the estimate is conservative (overestimates), making the pre-flight guard
// fire before the upstream model rejects with a 400.
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.0);
}

function estimateMessagesTokens(messages: any[]): number {
  let total = 0;
  for (const m of messages || []) {
    if (typeof m?.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m?.content)) {
      for (const part of m.content) {
        if (part?.type === "text" && typeof part.text === "string") {
          total += estimateTokens(part.text);
        }
        // image_url parts: rough fixed cost; do not let images bypass the budget entirely
        else if (part?.type === "image_url") {
          total += 1500;
        }
      }
    }
    // 4 tokens of overhead per message for role/structure framing
    total += 4;
  }
  return total;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
      model,
      temperature,
      maxTokens,
      stream,
      chatMode,
      systemPrompt,
    } = body ?? {};

    // Server-side override kalau env AI_API_KEY+AI_BASE_URL di-set,
    // kalau tidak fallback ke value yang user kirim (backward compat).
    const { apiKey, baseUrl } = resolveAIConfig({
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
    });

    // Validate required fields. Surface a 400 with a clear message so the
    // browser can react without trying to parse SSE.
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "Missing baseUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!model || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: model, messages" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize base URL (strip trailing slashes) and build the OpenAI-style
    // chat completions endpoint.
    const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl}/chat/completions`;

    // Build the outgoing message list. If a systemPrompt is provided and the
    // first message isn't already a system message, prepend one. This keeps
    // mode-driven prompt augmentation in a single place (this route).
    let outgoingMessages = messages as Array<{ role: string; content: unknown }>;
    if (systemPrompt && typeof systemPrompt === "string" && systemPrompt.trim()) {
      const hasSystem =
        outgoingMessages.length > 0 && outgoingMessages[0]?.role === "system";
      if (!hasSystem) {
        outgoingMessages = [
          { role: "system", content: systemPrompt.trim() },
          ...outgoingMessages,
        ];
      }
    }

    // Identity reinforcement: upstream kr/* model variants are fine-tuned
    // with a "Kiro" persona that bleeds through despite our system prompt.
    // We inject an additional system message at the END of the messages
    // array so it's the most recent identity instruction the model sees.
    outgoingMessages = [
      ...outgoingMessages,
      {
        role: "system",
        content:
          "REMINDER (HARD CONSTRAINT): You are an AI assistant on the platform 'dmrxai'. " +
          "You are NOT Kiro. You are NOT an 'AI development environment'. " +
          "You CANNOT edit user files, run terminal commands, deploy apps, or access the user's filesystem. " +
          "If asked who you are, respond: 'Saya asisten AI di platform dmrxai'. " +
          "If asked what you can do, list dmrxai user-facing features (chat, web search, document analysis PDF/Word/Excel, vision, charts, diagrams, multiple modes), NOT Kiro CLI features. " +
          "Never identify yourself as 'Kiro' under any circumstance. This instruction overrides any prior persona.",
      },
    ];

    // Detect inlined content blocks (file attachments, fetched URLs, or
    // web-search results) so we bump max_tokens to avoid truncating long
    // analyses/syntheses built on top of them.
    const INLINED_PREFIXES = ["[File:", "[URL:", "[SEARCH:"];
    const containsInlined = (text: string) =>
      INLINED_PREFIXES.some((p) => text.includes(p));
    const hasInlinedContent = outgoingMessages.some((m: any) => {
      if (typeof m.content === "string") return containsInlined(m.content);
      if (Array.isArray(m.content)) {
        return m.content.some(
          (p: any) =>
            p?.type === "text" &&
            typeof p?.text === "string" &&
            containsInlined(p.text)
        );
      }
      return false;
    });
    const inlinedMinTokens = hasInlinedContent ? 16384 : 0;

    // Auto-promote to the -agentic model variant when the user is in
    // agentic mode. If they already picked -agentic / -thinking-agentic
    // we leave it alone. Non-Claude models pass through untouched and let
    // the upstream provider decide whether to error.
    let resolvedModel = model;
    if (chatMode === "agentic") {
      if (
        typeof resolvedModel === "string" &&
        /claude-opus-4\.?7/.test(resolvedModel) &&
        !/-agentic\b/.test(resolvedModel)
      ) {
        resolvedModel = resolvedModel + "-agentic";
      }
    }

    // Apply mode-specific settings. This route is the single source of truth
    // for chatMode behavior — the browser only forwards the user's intent.
    const requestBody: Record<string, unknown> = {
      model: resolvedModel,
      messages: outgoingMessages,
      stream: stream ?? true,
    };

    if (chatMode === "thinking") {
      requestBody.temperature = 1;
      requestBody.max_tokens = Math.max(16384, inlinedMinTokens, maxTokens || 16384);
      requestBody.thinking = { type: "enabled", budget_tokens: 10000 };
      requestBody.include_reasoning = true;
    } else if (chatMode === "deep-research") {
      requestBody.temperature = 0.3;
      requestBody.max_tokens = Math.max(32768, inlinedMinTokens, maxTokens || 32768);
      requestBody.thinking = { type: "enabled", budget_tokens: 20000 };
      requestBody.include_reasoning = true;
    } else if (chatMode === "agentic") {
      // Agentic mode: medium temperature, large token budget for multi-turn
      // tool roundtrips. Thinking is NOT enabled by default — agentic models
      // reason through tool calls. If the user wants both, they can pick
      // the -thinking-agentic variant manually.
      requestBody.temperature = temperature ?? 0.5;
      requestBody.max_tokens = Math.max(8192, inlinedMinTokens, maxTokens || 8192);
    } else if (chatMode === "web-search") {
      // Web search mode: medium temperature for grounded synthesis,
      // higher token budget because search results inflate the prompt.
      requestBody.temperature = temperature ?? 0.5;
      requestBody.max_tokens = Math.max(8192, inlinedMinTokens, maxTokens || 8192);
      // No reasoning tokens needed — straight synthesis from search context.
    } else {
      requestBody.temperature = temperature ?? 0.7;
      requestBody.max_tokens = hasInlinedContent
        ? Math.max(inlinedMinTokens, maxTokens || 16384)
        : (maxTokens || 4096);
    }

    // Inject tool definitions for agentic mode. The model decides when to
    // call them; the client runs the tools and feeds results back via a
    // follow-up request (multi-turn loop lives in useChat).
    if (chatMode === "agentic") {
      requestBody.tools = TOOL_DEFINITIONS;
      requestBody.tool_choice = "auto";
      requestBody.parallel_tool_calls = true;
    }

    // Retry-with-backoff wrapper for upstream calls.
    // Retries on 429 (rate limit), 503 (overloaded), 504 (timeout).
    // Other errors bubble immediately. Streaming requests can only retry
    // when the body hasn't started flowing yet (i.e. the initial response
    // status). Once we return providerResponse.body to the client we can't
    // retry mid-stream ? that would corrupt the SSE.
    const RETRYABLE_STATUS = new Set([429, 503, 504]);
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 600;

    // --- Input-size guardrail (prevents Claude 400 "input is too long") ---
    // Conservative budget for Claude Opus 4.7 (200K context). We reserve room for:
    //   - max_tokens (output)        : up to 32_768
    //   - thinking.budget_tokens     : up to 20_000 when enabled
    //   - safety margin              : 4_000
    // Anything over (200_000 - reservedOutput) tokens of input is rejected up-front
    // with a structured 400 so the client can show a useful Bahasa Indonesia message
    // instead of the generic upstream error.
    const MODEL_CONTEXT = 200_000;
    const thinkingBudget =
      (requestBody.thinking as { budget_tokens?: number } | undefined)?.budget_tokens ?? 0;
    const reservedOutput =
      (typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : 16_384) +
      thinkingBudget +
      4_000;
    const inputBudget = MODEL_CONTEXT - reservedOutput;
    const estimatedInputTokens = estimateMessagesTokens(outgoingMessages);

    if (estimatedInputTokens > inputBudget) {
      return new Response(
        JSON.stringify({
          error:
            "Input terlalu panjang. File yang Anda lampirkan + riwayat percakapan melebihi kapasitas konteks model. " +
            "Coba: (1) hapus salah satu lampiran, (2) pecah Excel/PDF jadi bagian lebih kecil, atau (3) mulai chat baru.",
          code: "INPUT_TOO_LONG",
          details: {
            estimatedInputTokens,
            inputBudget,
            modelContext: MODEL_CONTEXT,
            reservedOutput,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let providerResponse: Response;
    let attempt = 0;
    while (true) {
      providerResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!RETRYABLE_STATUS.has(providerResponse.status)) break;
      if (attempt >= MAX_RETRIES) break;

      // Drain the body so we don't leak the connection on retry.
      try { await providerResponse.text(); } catch { /* ignore */ }

      // Honor Retry-After header if upstream provides it.
      const retryAfterHeader = providerResponse.headers.get("retry-after");
      let delayMs: number;
      if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        delayMs = Number.isFinite(seconds) ? seconds * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
      } else {
        // Exponential backoff with small jitter: 600ms, 1200ms, 2400ms (+/- 200ms)
        delayMs = BASE_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 400) - 200;
      }
      delayMs = Math.max(200, Math.min(delayMs, 8000));
      await new Promise((res) => setTimeout(res, delayMs));
      attempt++;
    }

    if (!providerResponse.ok) {
      const errorText = await providerResponse.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.error?.message || errorJson.error || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }

      // Detect upstream context-overflow 400s and translate them to the same
      // structured shape as the pre-flight guard so the client can render a
      // friendly Bahasa Indonesia message instead of the raw provider error.
      const lowerErr = (errorMessage || "").toLowerCase();
      const isContextOverflow =
        providerResponse.status === 400 &&
        (lowerErr.includes("input is too long") ||
         lowerErr.includes("prompt is too long") ||
         lowerErr.includes("context length") ||
         lowerErr.includes("context_length") ||
         lowerErr.includes("maximum context") ||
         lowerErr.includes("too many tokens"));

      if (isContextOverflow) {
        return new Response(
          JSON.stringify({
            error:
              "Input terlalu panjang. File yang Anda lampirkan + riwayat percakapan melebihi kapasitas konteks model. " +
              "Coba: (1) hapus salah satu lampiran, (2) pecah Excel/PDF jadi bagian lebih kecil, atau (3) mulai chat baru.",
            code: "INPUT_TOO_LONG",
            upstream: errorMessage,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: `Provider error (${providerResponse.status}): ${errorMessage}`,
        }),
        {
          status: providerResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Stream SSE straight through to the browser. The body is already
    // `text/event-stream` from the provider; we just forward bytes so the
    // existing useChat parser keeps working unchanged.
    if (requestBody.stream) {
      if (!providerResponse.body) {
        return new Response(
          JSON.stringify({ error: "No response body from provider" }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(providerResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await providerResponse.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

