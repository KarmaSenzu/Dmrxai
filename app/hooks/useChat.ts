"use client";

import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { Message, Conversation, Settings, ChatMode, Attachment, ToolCall } from "@/lib/types";
import { saveConversation, getConversations, deleteConversation as deleteConv, saveConversations } from "@/lib/storage";
import { executeTool } from "@/lib/tools";
import { detectIntent } from "@/lib/auto-mode";

export interface UseChatOptions {
  // When true, the server has baked-in AI_API_KEY + AI_BASE_URL via env, so
  // we no longer require the user to have supplied them via Settings/Login.
  serverManaged?: boolean;
}

// Extract http(s) URLs from a user message. Trailing prose punctuation that
// commonly hangs off a URL in chat ("see https://example.com.") is stripped
// so we don't end up requesting bogus paths. Deduped and capped to 3 to
// avoid users (or pasted nonsense) triggering a fan-out of fetches.
function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(https?:\/\/[^\s<>"'\)]+)/gi) || [];
  const trailing = /[.,);:!?'"\]]+$/;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(trailing, "");
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 3) break;
  }
  return out;
}

// Build a clean search query from the user's prompt. Strips common conversational
// fillers and caps length so SearXNG gets a focused query string.
function buildSearchQuery(text: string): string {
  let q = text
    .replace(/^(please|tolong|bisa(?:kah)?|coba|mohon)[\s,]+/i, "")
    .replace(/^(cari(?:kan)?|search|find|look up|google)[\s:,]+/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
  // Cap to 200 chars — SearXNG handles longer fine but anything past this
  // is almost always context, not query terms.
  if (q.length > 200) q = q.slice(0, 200);
  return q;
}


// Identity sanitizer: upstream kr/* model variants are fine-tuned with a
// "Kiro" persona that bleeds through despite system prompts. We rewrite
// the streamed content to keep the dmrxai identity consistent for users.
//
// Patterns are conservative: only replace clearly-identity-establishing
// phrases, not random mentions of the word in code/comments/etc.
function sanitizeIdentity(text: string): string {
  if (!text) return text;
  let out = text;
  // Common identity intros (English + Indonesian, case-insensitive).
  const identityPhrases: Array<[RegExp, string]> = [
    // "I'm Kiro" / "Saya Kiro" with various follow-ups
    [/\bI'?m Kiro\b[^.\n]*/gi, "Saya asisten AI di platform dmrxai"],
    [/\bI am Kiro\b[^.\n]*/gi, "Saya asisten AI di platform dmrxai"],
    [/\bSaya Kiro\b[^.\n]*/gi, "Saya asisten AI di platform dmrxai"],
    [/\bSaya adalah Kiro\b[^.\n]*/gi, "Saya asisten AI di platform dmrxai"],
    [/\bYes,?\s+I'?m Kiro\b[^.\n]*/gi, "Saya asisten AI di platform dmrxai"],
    [/\bYa,?\s+saya Kiro\b[^.\n]*/gi, "Saya asisten AI di platform dmrxai"],
    // "Kiro is" / "Kiro adalah" descriptions
    [/\bKiro is an? [a-z\-\s]+/gi, "dmrxai adalah platform chat AI"],
    [/\bKiro adalah [a-z\-\s]+/gi, "dmrxai adalah platform chat AI"],
    // Bare "Kiro" mentions as identity
    [/\bAI development environment\b/gi, "platform AI"],
    [/\bAI-powered development environment\b/gi, "platform AI"],
    // Last-resort: bare "Kiro" word ? only when context suggests identity
    // (preceded by capital letter or sentence start). Less aggressive on
    // mid-sentence "Kiro" to avoid breaking unrelated content.
    [/(^|[.!?\n]\s+)Kiro\b/g, "$1dmrxai"],
  ];
  for (const [pattern, replacement] of identityPhrases) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// Hard ceiling per outgoing user message for inlined attachment text.
// Belt-and-suspenders: ChatInput.tsx already caps each attachment, but if
// multiple attachments stack we still need a per-message ceiling so the
// server-side guard in /api/chat does not have to reject the request.
const MAX_INLINED_ATTACHMENT_CHARS_PER_MESSAGE = 120_000;

export function useChat(settings: Settings, options: UseChatOptions = {}) {
  const { serverManaged = false } = options;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load conversations from localStorage
  const loadConversations = useCallback(() => {
    const saved = getConversations();
    setConversations(saved);
    return saved;
  }, []);

  // Get active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // Create new conversation
  const createConversation = useCallback(() => {
    const newConv: Conversation = {
      id: uuidv4(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => {
      const updated = [newConv, ...prev];
      saveConversations(updated);
      return updated;
    });
    setActiveConversationId(newConv.id);
    setError(null);
    return newConv;
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(
    (id: string) => {
      deleteConv(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [activeConversationId]
  );

  // Select conversation
  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setError(null);
  }, []);

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (content: string, chatMode: ChatMode = "normal", attachments?: Attachment[]) => {
      if ((!content.trim() && (!attachments || attachments.length === 0)) || isLoading) return;
      // In server-managed mode the API key/baseUrl come from server env, so
      // we only require the user to have picked a model. In legacy mode we
      // still require all three locally.
      const haveCreds = serverManaged
        ? Boolean(settings.model)
        : Boolean(settings.apiKey && settings.baseUrl && settings.model);
      if (!haveCreds) {
        setError("Please configure your API Key and Model in Settings.");
        return;
      }

      setError(null);

      // Get or create conversation
      let convId = activeConversationId;
      let currentConversations = [...conversations];

      if (!convId) {
        const newConv: Conversation = {
          id: uuidv4(),
          title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        convId = newConv.id;
        currentConversations = [newConv, ...currentConversations];
        setActiveConversationId(convId);
      }

      // Add user message
      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: content.trim(),
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
        timestamp: Date.now(),
      };

      // Update conversation with user message
      currentConversations = currentConversations.map((c) => {
        if (c.id === convId) {
          const updated = {
            ...c,
            messages: [...c.messages, userMessage],
            updatedAt: Date.now(),
            title: c.messages.length === 0 ? content.slice(0, 50) + (content.length > 50 ? "..." : "") : c.title,
          };
          return updated;
        }
        return c;
      });

      setConversations(currentConversations);

      // Auto-mode detection: when the user is in "normal" mode, infer the
      // effective runtime mode from their message + attachments. The UI
      // state `chatMode` stays "normal" (silent — no banner, no toggle
      // change), but every downstream decision (search pre-processing,
      // API request body, tool injection) uses `effectiveMode` instead.
      let effectiveMode: ChatMode = chatMode;
      if (chatMode === "normal") {
        const intent = detectIntent({
          content,
          attachments: attachments,
        });
        if (intent.effectiveMode !== "normal") {
          effectiveMode = intent.effectiveMode;
          if (typeof console !== "undefined") {
            console.debug("[auto-mode]", intent.reason, intent.signals);
          }
        }
      }

      // URL pre-processing: if the user's text contains http(s) URLs, fetch
      // each one server-side via /api/fetch-url and stash the extracted text
      // so we can inline it into the apiMessages payload below. We do NOT
      // persist this into conversation.messages — the user's UI bubble
      // should keep showing exactly what they typed.
      const detectedUrls = extractUrls(content);
      const urlBlocks: string[] = [];
      if (detectedUrls.length > 0) {
        try {
          const results = await Promise.all(
            detectedUrls.map(async (u) => {
              try {
                const res = await fetch("/api/fetch-url", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url: u }),
                });
                if (!res.ok) {
                  let msg = `HTTP ${res.status}`;
                  try {
                    const j = await res.json();
                    if (j?.error) msg = String(j.error);
                  } catch {
                    // ignore
                  }
                  return { url: u, error: msg };
                }
                const data = await res.json();
                return {
                  url: u,
                  title: typeof data?.title === "string" ? data.title : undefined,
                  text: typeof data?.text === "string" ? data.text : "",
                };
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "fetch failed";
                return { url: u, error: msg };
              }
            })
          );
          for (const r of results) {
            if ("error" in r && r.error) {
              urlBlocks.push(`[URL: ${r.url}] (failed to fetch: ${r.error})`);
            } else if ("text" in r) {
              const header = `[URL: ${r.url}${r.title ? ` — ${r.title}` : ""}]`;
              urlBlocks.push(`${header}\nContent:\n${r.text}`);
            }
          }
        } catch {
          // Defensive: if Promise.all itself somehow throws, keep going
          // without URL context rather than failing the whole message.
        }
      }

      // Web search pre-processing. Triggered when the effective runtime mode
      // is "web-search" — either because the user explicitly picked the mode,
      // or because auto-mode detection promoted a "normal" message to it.
      // Runs after URL fetch so users can still mix pasted URLs with a
      // web-search intent. Search results are inlined into the API payload
      // only — never persisted into conversation.messages — same convention
      // as urlBlocks.
      const searchBlocks: string[] = [];
      const shouldSearch = effectiveMode === "web-search";

      if (shouldSearch) {
        try {
          const query = buildSearchQuery(content);
          const searchResp = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, count: 8 }),
            signal: abortControllerRef.current?.signal,
          });
          if (searchResp.ok) {
            const data = await searchResp.json();
            const results = Array.isArray(data?.results) ? data.results : [];
            if (results.length > 0) {
              const lines = results
                .map(
                  (r: any, i: number) =>
                    `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
                )
                .join("\n\n");
              searchBlocks.push(
                `[SEARCH: ${query}]\nResults:\n${lines}`
              );

              // Deep-fetch top 2 URLs in parallel for richer context.
              // /api/fetch-url has its own SSRF guard, timeout, and size cap,
              // so we can fan out cheaply. Failures are non-fatal — model
              // still gets the search summary above.
              // We use the [URL: ...] prefix (not [FETCHED:]) so the chat
              // route's existing token-bump detector picks these up alongside
              // user-typed URL fetches.
              const topUrls = results
                .slice(0, 2)
                .map((r: any) => r.url)
                .filter(Boolean);
              if (topUrls.length > 0) {
                const fetchPromises = topUrls.map(async (url: string) => {
                  try {
                    const fetchResp = await fetch("/api/fetch-url", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url }),
                      signal: abortControllerRef.current?.signal,
                    });
                    if (!fetchResp.ok) return null;
                    const fetchData = await fetchResp.json();
                    if (!fetchData?.text) return null;
                    const titleSuffix = fetchData.title ? ` — ${fetchData.title}` : "";
                    const truncMark = fetchData.truncated ? " [truncated]" : "";
                    return `[URL: ${url}${titleSuffix}] (auto-fetched from search)${truncMark}\nContent:\n${fetchData.text}`;
                  } catch (err: unknown) {
                    if (err instanceof Error && err.name === "AbortError") throw err;
                    return null;
                  }
                });

                try {
                  const fetchedBlocks = (await Promise.all(fetchPromises)).filter(
                    (b): b is string => b !== null
                  );
                  for (const fb of fetchedBlocks) {
                    searchBlocks.push(fb);
                  }
                } catch (err: unknown) {
                  if (err instanceof Error && err.name === "AbortError") throw err;
                  // Other errors — silently skip deep-fetch, search summary still in context.
                }
              }
            } else {
              searchBlocks.push(
                `[SEARCH: ${query}]\nNo results returned.`
              );
            }
          } else {
            const errData = await searchResp.json().catch(() => ({}));
            searchBlocks.push(
              `[SEARCH: ${content.slice(0, 80)}] (failed: ${errData?.error || searchResp.status})`
            );
          }
        } catch (err: unknown) {
          // Don't kill the message flow if search fails — just note it.
          if (err instanceof Error && err.name === "AbortError") {
            // User aborted; let the abort propagate naturally below.
            throw err;
          }
          const msg = err instanceof Error ? err.message : "search error";
          searchBlocks.push(`[SEARCH] (failed: ${msg})`);
        }
      }

      // Prepare messages for API
      const conv = currentConversations.find((c) => c.id === convId)!;
      const apiMessages = [];

      // Build system prompt based on mode. The actual prepending now happens
      // in /api/chat/route.ts (the single source of truth) — we only forward
      // the assembled text via the `systemPrompt` body field below.
      let systemContent = settings.systemPrompt || "";
      if (effectiveMode === "thinking") {
        systemContent += "\n\nIMPORTANT: Show your reasoning process step by step. Wrap your thinking in <think>...</think> tags before giving your final answer. Think carefully and thoroughly.";
      } else if (effectiveMode === "deep-research") {
        systemContent += "\n\nIMPORTANT: You are in Deep Research mode. Conduct thorough, in-depth analysis. Wrap your research reasoning in <think>...</think> tags. Consider multiple perspectives, cite sources when possible, analyze pros and cons, and provide a comprehensive, well-structured response. Be extremely detailed and thorough.";
      }
      systemContent = systemContent.trim();

      apiMessages.push(
        ...conv.messages.map((m) => {
          // Decide if this is the message we just sent — if so we may need
          // to inject URL-extracted text parts and/or search results.
          const isCurrentUserMessage = m.id === userMessage.id && m.role === "user";
          const injectUrls = isCurrentUserMessage && urlBlocks.length > 0;
          const injectSearch = isCurrentUserMessage && searchBlocks.length > 0;

          // If message has attachments, format as multimodal content
          if (m.attachments && m.attachments.length > 0 && m.role === "user") {
            const contentParts: any[] = [];
            // Add text content first
            if (m.content) {
              contentParts.push({ type: "text", text: m.content });
            }
            // Add attachments. Image parts pass through untouched. For
            // non-image attachments we first resolve each file's content
            // string, then enforce a per-message character budget so the
            // server's /api/chat guard does not have to reject overflows.
            type FileAttPart = { att: Attachment; content: string };
            const fileParts: FileAttPart[] = [];
            for (const att of m.attachments) {
              if (att.type === "image") {
                contentParts.push({
                  type: "image_url",
                  image_url: { url: `data:${att.mimeType};base64,${att.base64}` },
                });
              } else {
                // For files, resolve to a text payload (extracted or decoded).
                let fileContent: string;
                if (att.extractedText) {
                  // Use extracted text for PDF/DOCX files
                  fileContent = att.extractedText;
                } else {
                  // For plain text files, decode base64
                  try {
                    fileContent = atob(att.base64);
                  } catch {
                    fileContent = "[Error: Gagal membaca konten file]";
                  }
                }
                fileParts.push({ att, content: fileContent });
              }
            }

            // Distribute the per-message budget across non-image attachments.
            // When the combined length stays under the cap nothing is sliced.
            const totalChars = fileParts.reduce((s, p) => s + p.content.length, 0);
            const slicedContents: string[] = fileParts.map((p) => p.content);
            if (
              totalChars > MAX_INLINED_ATTACHMENT_CHARS_PER_MESSAGE &&
              fileParts.length > 0
            ) {
              const MIN_PER_ATT = 2_000;
              const budget = MAX_INLINED_ATTACHMENT_CHARS_PER_MESSAGE;
              for (let i = 0; i < fileParts.length; i++) {
                const original = fileParts[i].content;
                // Proportional share, floored so each attachment keeps a
                // usable head even when one giant file dominates totalChars.
                const share = Math.max(
                  MIN_PER_ATT,
                  Math.floor((original.length / totalChars) * budget)
                );
                if (original.length <= share) {
                  slicedContents[i] = original;
                  continue;
                }
                let cut = original.slice(0, share);
                const lastNl = cut.lastIndexOf("\n");
                // Only honor the newline boundary if it leaves a reasonable
                // chunk (>=80% of the slice) — otherwise we'd waste budget.
                if (lastNl >= Math.floor(share * 0.8)) {
                  cut = cut.slice(0, lastNl);
                }
                slicedContents[i] =
                  cut +
                  "\n\n[...lampiran dipangkas otomatis untuk menjaga budget konteks AI.]";
              }
            }

            for (let i = 0; i < fileParts.length; i++) {
              const { att } = fileParts[i];
              const fileContent = slicedContents[i];
              contentParts.push({
                type: "text",
                text: `[File: ${att.name} (${att.mimeType}, ${(att.size / 1024).toFixed(1)}KB)]\n\nContent:\n${fileContent}`,
              });
            }
            if (injectUrls) {
              for (const block of urlBlocks) {
                contentParts.push({ type: "text", text: block });
              }
            }
            if (injectSearch) {
              for (const block of searchBlocks) {
                contentParts.push({ type: "text", text: block });
              }
            }
            return { role: m.role, content: contentParts };
          }

          // No attachments. If we need to inject URL or search blocks, switch
          // this user message to a multimodal content-parts array; otherwise
          // keep the simple string form.
          if (injectUrls || injectSearch) {
            const contentParts: any[] = [];
            if (m.content) {
              contentParts.push({ type: "text", text: m.content });
            }
            for (const block of urlBlocks) {
              contentParts.push({ type: "text", text: block });
            }
            for (const block of searchBlocks) {
              contentParts.push({ type: "text", text: block });
            }
            return { role: m.role, content: contentParts };
          }

          return { role: m.role, content: m.content };
        })
      );

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        // Capture the model that's about to generate this response so the
        // bubble can show a per-message badge. Falling back to "unknown"
        // keeps rendering safe if settings.model is somehow blank.
        model: settings.model || "unknown",
      };

      currentConversations = currentConversations.map((c) => {
        if (c.id === convId) {
          return { ...c, messages: [...c.messages, assistantMessage], updatedAt: Date.now() };
        }
        return c;
      });
      setConversations(currentConversations);

      // Send request
      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Track which assistant placeholder is currently "live" — it shifts
      // each multi-turn iteration when we append a fresh placeholder for
      // the next streaming pass. The catch-block fallback uses this to
      // know which bubble to overwrite with the error.
      let currentAssistantId = assistantMessage.id;

      // Helper: patch a single tool call's status fields on whichever
      // assistant message currently owns it.
      const updateToolCallStatus = (
        toolCallId: string,
        status: "pending" | "running" | "success" | "error",
        result?: string,
        error?: string
      ) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = c.messages.map((m) => {
              if (!m.tool_calls) return m;
              let touched = false;
              const updated = m.tool_calls.map((tc) => {
                if (tc.id !== toolCallId) return tc;
                touched = true;
                return {
                  ...tc,
                  status,
                  result: result !== undefined ? result : tc.result,
                  error: error !== undefined ? error : tc.error,
                  ...(status === "running" ? { startedAt: Date.now() } : {}),
                  ...(status === "success" || status === "error"
                    ? { finishedAt: Date.now() }
                    : {}),
                };
              });
              return touched ? { ...m, tool_calls: updated } : m;
            });
            return { ...c, messages: msgs };
          })
        );
      };

      // Streaming pass — one fetch + SSE parse + accumulator update cycle.
      // Returns whatever finish_reason came back plus the accumulated tool
      // calls so the outer loop can decide whether to dispatch tools and
      // re-call. Throws on network/HTTP errors and AbortError.
      const streamOnce = async (
        msgsForApi: any[]
      ): Promise<{
        finishReason: string | null;
        toolCalls: ToolCall[];
        content: string;
      }> => {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
            model: settings.model,
            messages: msgsForApi,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            chatMode: effectiveMode,
            systemPrompt: systemContent || undefined,
            stream: true,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage: string;
          let errBody: any = null;
          try {
            errBody = JSON.parse(errorText);
            errorMessage =
              errBody.error?.message || errBody.error || errBody.message || errorText;
          } catch {
            errorMessage = errorText;
          }
          // Translate common upstream errors to user-friendly Indonesian.
          // The chat route already retries 429/503/504 up to 3 times, so
          // if the user still sees these statuses, the system was genuinely
          // overloaded for several seconds.
          let friendly: string;
          if (response.status === 429) {
            friendly = "Server AI sedang sibuk (banyak yang pakai sekaligus). Coba lagi dalam beberapa detik.";
          } else if (response.status === 400 && errBody?.code === "INPUT_TOO_LONG") {
            friendly =
              (typeof errBody.error === "string" ? errBody.error : "") ||
              "Input terlalu panjang. File + riwayat chat melebihi kapasitas model. Coba hapus salah satu lampiran, pecah file jadi bagian lebih kecil, atau mulai chat baru.";
          } else if (response.status === 503 || response.status === 504) {
            friendly = "Server AI sedang overload. Coba lagi sebentar lagi.";
          } else if (response.status >= 500) {
            friendly = `Terjadi gangguan di server AI (${response.status}). Coba lagi atau hubungi admin.`;
          } else if (response.status === 401 || response.status === 403) {
            friendly = "Sesi Anda bermasalah. Mohon refresh halaman.";
          } else {
            friendly = errorMessage || `Error ${response.status}`;
          }
          throw new Error(friendly);
        }
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        // 9router emits Claude Opus 4.7 thinking-mode reasoning as
        // `delta.reasoning_content` (DeepSeek/Qwen-style) ahead of any
        // `delta.content` chunks. Accumulate it separately so we can
        // persist it on the message under `reasoning`.
        let fullReasoning = "";
        // tool_calls deltas are keyed by `index` (the only stable
        // identifier across chunks — `id` only appears on the first one).
        const toolCallsByIndex = new Map<number, ToolCall>();
        let finishReason: string | null = null;

        const emitOrderedToolCalls = (): ToolCall[] =>
          Array.from(toolCallsByIndex.entries())
            .sort(([a], [b]) => a - b)
            .map(([, v]) => v);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Last partial line stays in the buffer until the next chunk
          // brings its newline — prevents truncated JSON when a chunk
          // boundary lands mid-token.
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;

              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
              }

              const reasoningDelta = delta?.reasoning_content;
              if (reasoningDelta) {
                fullReasoning += reasoningDelta;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const msgs = [...c.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.role === "assistant") {
                      msgs[msgs.length - 1] = { ...lastMsg, reasoning: fullReasoning };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              }

              const contentDelta = delta?.content;
              if (contentDelta) {
                fullContent += contentDelta;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const msgs = [...c.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.role === "assistant") {
                      msgs[msgs.length - 1] = { ...lastMsg, content: sanitizeIdentity(fullContent) };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              }

              const toolCallDeltas = delta?.tool_calls;
              if (Array.isArray(toolCallDeltas) && toolCallDeltas.length > 0) {
                for (const tcd of toolCallDeltas) {
                  const idx = typeof tcd?.index === "number" ? tcd.index : null;
                  if (idx === null) continue;
                  let existing = toolCallsByIndex.get(idx);
                  if (!existing) {
                    existing = {
                      id: tcd.id || "",
                      type: "function",
                      function: { name: "", arguments: "" },
                      status: "pending",
                    };
                    toolCallsByIndex.set(idx, existing);
                  }
                  if (tcd.id) existing.id = tcd.id;
                  if (tcd.function?.name) {
                    existing.function.name += tcd.function.name;
                  }
                  if (tcd.function?.arguments) {
                    existing.function.arguments += tcd.function.arguments;
                  }
                }

                const ordered = emitOrderedToolCalls();
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const msgs = [...c.messages];
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg && lastMsg.role === "assistant") {
                      msgs[msgs.length - 1] = {
                        ...lastMsg,
                        // Clone each tool call so React sees a new ref
                        tool_calls: ordered.map((tc) => ({ ...tc, function: { ...tc.function } })),
                      };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }

        const orderedToolCalls = emitOrderedToolCalls();

        // Persist final state of THIS assistant message to localStorage.
        setConversations((prev) => {
          const final = prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = [...c.messages];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...lastMsg,
                content: sanitizeIdentity(fullContent),
                reasoning: fullReasoning || undefined,
                tool_calls:
                  orderedToolCalls.length > 0
                    ? orderedToolCalls.map((tc) => ({ ...tc, function: { ...tc.function } }))
                    : undefined,
              };
            }
            const updated = { ...c, messages: msgs, updatedAt: Date.now() };
            saveConversation(updated);
            return updated;
          });
          return final;
        });

        return { finishReason, toolCalls: orderedToolCalls, content: sanitizeIdentity(fullContent) };
      };

      try {
        // Multi-turn tool-calling loop. For non-agentic modes the model
        // never emits tool_calls, so iteration 1 ends with finish_reason
        // "stop" and we fall straight out — same wire shape as before.
        const MAX_TOOL_ITERATIONS = 5;
        let iteration = 0;
        let currentApiMessages: any[] = apiMessages;
        let lastIterationExecutedTools = false;

        while (iteration < MAX_TOOL_ITERATIONS) {
          iteration++;
          lastIterationExecutedTools = false;

          const { finishReason, toolCalls, content: assistantContent } =
            await streamOnce(currentApiMessages);

          // Done if model finished cleanly or didn't actually call any
          // tools (some providers return "tool_calls" with an empty list
          // on the boundary chunk — treat as terminal).
          if (finishReason !== "tool_calls" || toolCalls.length === 0) {
            break;
          }

          // Execute each tool sequentially. Parallel execution would be
          // faster, but tools sometimes share rate-limited backends
          // (search, fetch-url) and sequential is simpler to reason about.
          const toolResults: { tool_call_id: string; content: string }[] = [];
          for (const tc of toolCalls) {
            updateToolCallStatus(tc.id, "running");
            let resultText: string;
            try {
              resultText = await executeTool(tc.function.name, tc.function.arguments, {
                signal: abortController.signal,
              });
              updateToolCallStatus(tc.id, "success", resultText);
            } catch (err: unknown) {
              if (err instanceof Error && err.name === "AbortError") throw err;
              const execErr = err instanceof Error ? err.message : String(err);
              resultText = JSON.stringify({ error: execErr });
              updateToolCallStatus(tc.id, "error", undefined, execErr);
            }
            toolResults.push({ tool_call_id: tc.id, content: resultText });
          }
          lastIterationExecutedTools = true;

          // If we just finished the last allowed iteration, don't append a
          // fresh assistant placeholder or build apiMessages for a stream
          // call that won't happen — the cap-notice branch below uses the
          // *current* assistant bubble (still showing the tool_calls) to
          // surface the cap message.
          if (iteration >= MAX_TOOL_ITERATIONS) break;

          // Append tool-result messages + a fresh assistant placeholder
          // to the conversation state (so UI renders results inline and
          // the next streamOnce can write into the new placeholder).
          const nextAssistantId = uuidv4();
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              const newMsgs = [...c.messages];
              for (const tr of toolResults) {
                newMsgs.push({
                  id: uuidv4(),
                  role: "tool",
                  content: tr.content,
                  tool_call_id: tr.tool_call_id,
                  timestamp: Date.now(),
                });
              }
              newMsgs.push({
                id: nextAssistantId,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
                model: settings.model || "unknown",
              });
              const updated = { ...c, messages: newMsgs, updatedAt: Date.now() };
              saveConversation(updated);
              return updated;
            })
          );
          currentAssistantId = nextAssistantId;

          // Build next iteration's API payload. Strip client-only tool
          // metadata (status/startedAt/etc.) — provider only wants the
          // OpenAI-shaped {id, type, function} triplet. Content is null
          // when the assistant emitted tool_calls only; some providers
          // require it when content is empty.
          const assistantApiMsg = {
            role: "assistant" as const,
            content: assistantContent || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          };
          const toolApiMsgs = toolResults.map((tr) => ({
            role: "tool" as const,
            tool_call_id: tr.tool_call_id,
            content: tr.content,
          }));
          currentApiMessages = [...currentApiMessages, assistantApiMsg, ...toolApiMsgs];
        }

        if (iteration >= MAX_TOOL_ITERATIONS && lastIterationExecutedTools) {
          // We executed tools on the last allowed iteration but couldn't
          // give the model another turn to summarize — append a notice to
          // the live assistant bubble so the user knows we stopped on
          // purpose, and persist tool results inline for transcript.
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              const msgs = [...c.messages];
              const lastIdx = msgs.length - 1;
              const last = msgs[lastIdx];
              if (last && last.role === "assistant") {
                msgs[lastIdx] = {
                  ...last,
                  content:
                    (last.content || "") +
                    "\n\n_(Mencapai batas maksimum 5 tool calls. Silakan tanya ulang jika perlu.)_",
                };
              }
              const updated = { ...c, messages: msgs, updatedAt: Date.now() };
              saveConversation(updated);
              return updated;
            })
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled - save what we have
          setConversations((prev) => {
            const final = prev.map((c) => {
              if (c.id === convId) {
                saveConversation(c);
              }
              return c;
            });
            return final;
          });
        } else {
          const errorMsg = err instanceof Error ? err.message : "An error occurred";

          // Template response when model is unavailable or returns an error
          const fallbackContent = `> **Model tidak dapat digunakan**\n\nMaaf, model **\`${settings.model}\`** saat ini tidak dapat memproses permintaan Anda.\n\n**Kemungkinan penyebab:**\n- Model tidak tersedia atau sedang maintenance\n- API Key tidak memiliki akses ke model ini\n- Base URL tidak mendukung model yang dipilih\n- Kuota atau rate limit telah tercapai\n\n**Solusi:**\nSilakan pilih model lain dari daftar model yang tersedia di atas kolom chat.\n\n---\n*Error detail: ${errorMsg}*`;

          // Show the fallback in whichever assistant bubble is currently
          // live (could be the original placeholder, or a follow-up
          // placeholder created mid-tool-loop).
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id === convId) {
                const msgs = [...c.messages];
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === currentAssistantId) {
                  msgs[msgs.length - 1] = { ...lastMsg, content: fallbackContent };
                }
                const updated = { ...c, messages: msgs, updatedAt: Date.now() };
                saveConversation(updated);
                return updated;
              }
              return c;
            })
          );
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, conversations, isLoading, settings, serverManaged]
  );

  // Clear all conversations
  const clearAllConversations = useCallback(() => {
    saveConversations([]);
    setConversations([]);
    setActiveConversationId(null);
  }, []);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    isLoading,
    error,
    loadConversations,
    createConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
    stopGeneration,
    clearAllConversations,
    setError,
  };
}
