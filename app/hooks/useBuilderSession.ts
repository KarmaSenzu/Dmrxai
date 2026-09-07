"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "./useSettings";
import {
  addMessage as addLocalMessage,
  syncFiles as syncLocalFiles,
  updateProject as updateLocalProject,
  getFiles as getLocalFiles,
  getMessages as getLocalMessages,
  setMessages as setLocalMessages,
  getProjectData as getLocalProjectData,
  syncProjectToDB,
  type BuilderProject,
  type BuilderProjectMessage,
} from "@/lib/builder-storage";
import type { ToolCall, AgentMode } from "@/lib/agent-tools";
import { executeToolOnFileMap } from "@/lib/stackblitz-tool-dispatch";
import { createLogger } from "@/lib/logger";

const log = createLogger("useBuilderSession");

// ---- Types ----

export type AgentPhase =
  | "idle"
  | "loading"
  | "thinking"
  | "executing"
  | "saving"
  | "done"
  | "error";

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  success?: boolean;
  timestamp: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCalls?: AgentToolCall[];
  isThinking?: boolean;
}

export interface BuilderSessionState {
  projectId: string | null;
  phase: AgentPhase;
  messages: AgentMessage[];
  toolCalls: AgentToolCall[]; // Current run's tool calls (for activity feed)
  /** Bumps every time the project's file map changes so the UI can re-embed. */
  filesVersion: number;
  terminalLogs: string[];
  error: string | null;
  isRunning: boolean;
}

export interface UseBuilderSessionResult extends BuilderSessionState {
  /** Send a prompt to the agent. Requires a projectId. */
  send: (
    prompt: string,
    projectId?: string,
    overrideMode?: AgentMode,
    modelOverride?: string,
  ) => Promise<void>;
  /** Abort the current agent run. */
  abort: () => void;
  /** Reset session state (new project). */
  reset: () => void;
  /** Set project ID (for loading existing project). */
  setProjectId: (id: string) => void;
  /** Hydrate session state from server data (messages, files). */
  loadHistory: (args: {
    messages: Array<{
      id?: string;
      role: string;
      content: string;
      created_at?: string;
      metadata?: Record<string, unknown>;
    }>;
    files: Array<{ path: string; content: string }>;
  }) => void;
  /** Current agent mode (architect/code/debug) as reported by server. */
  agentMode: AgentMode | null;
}

// ---- Constants ----

const MAX_TERMINAL_LINES = 300;
// Hard cap on client-driven continuation rounds so a buggy LLM can't loop.
const MAX_ROUNDS = 25;

// Max chars of a single carried tool-call argument (create_file content /
// apply_diff diff) or tool result kept in the continuation history copy.
// Anything larger is elided/truncated before sending.
const MAX_CARRIED_ARG_CHARS = 600;

// ---- History compaction ----
//
// WHY: every continuation round already re-POSTs the full in-memory file map
// as `existingFiles`, which the server rebuilds into a (30K-capped) [RELEVANT
// FILES] system block each round. The model therefore always sees current file
// state, and can call `read_file` on demand for exact contents. That makes the
// large file content carried *inside* historical assistant `tool_calls`
// arguments (create_file `content`, apply_diff `diff`) and inside accumulated
// `tool` results redundant — yet `llmHistory` is never pruned, so the request
// grows unboundedly with project size (content rides the payload twice per
// round).
//
// `compactLlmHistory` returns a COMPACTED COPY for sending while leaving the
// real `llmHistory` accumulator untouched, so compaction is applied only to
// the outgoing copy and stays idempotent across rounds.
type LlmHistoryMessage = {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

function compactLlmHistory(
  history: LlmHistoryMessage[],
): LlmHistoryMessage[] {
  return history.map((msg) => {
    // Assistant turns: elide large create_file/apply_diff arguments. Preserve
    // each tool call's `id` and `function.name` exactly — the LLM API contract
    // requires assistant tool_calls to keep their ids so the following `tool`
    // result messages match by `tool_call_id`.
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length) {
      const compactedCalls = msg.tool_calls.map((tc) => {
        const name = tc.function?.name;
        if (name !== "create_file" && name !== "apply_diff") return tc;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // Unparseable arguments — leave this tool call unchanged.
          return tc;
        }

        const field = name === "create_file" ? "content" : "diff";
        const value = parsed[field];
        if (typeof value === "string" && value.length > MAX_CARRIED_ARG_CHARS) {
          parsed[field] = `[elided ${value.length} chars — current file state is provided in RELEVANT FILES; call read_file for exact contents]`;
          return {
            ...tc,
            function: {
              ...tc.function,
              arguments: JSON.stringify(parsed),
            },
          };
        }
        return tc;
      });
      return { ...msg, tool_calls: compactedCalls };
    }

    // Tool results: truncate anything over the threshold (read_file results
    // can be up to 10K chars and otherwise accumulate forever).
    if (
      msg.role === "tool" &&
      typeof msg.content === "string" &&
      msg.content.length > MAX_CARRIED_ARG_CHARS
    ) {
      const removed = msg.content.length - MAX_CARRIED_ARG_CHARS;
      return {
        ...msg,
        content:
          msg.content.slice(0, MAX_CARRIED_ARG_CHARS) +
          `\n[truncated ${removed} chars]`,
      };
    }

    // Everything else passes through unchanged.
    return msg;
  });
}

// ---- Hook ----

export interface UseBuilderSessionOptions {
  /** Authed user id; when present, runs are mirrored to Supabase. */
  userId?: string | null;
}

export function useBuilderSession(
  options: UseBuilderSessionOptions = {},
): UseBuilderSessionResult {
  const { userId = null } = options;
  const { settings } = useSettings();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [filesVersion, setFilesVersion] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  // Mirror of toolCalls so SSE/loop code (whose `send` closure is stale by the
  // time later events arrive) can read the live tool-call array.
  const toolCallsRef = useRef<AgentToolCall[]>([]);
  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  // Keep userId/settings in refs so the long-lived `send` closure can read the
  // current values without listing them as deps (which would recreate `send`
  // and abort any in-flight stream on every settings tweak).
  const userIdRef = useRef<string | null>(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Keep the active projectId in a ref so handlers can persist to the right
  // project even after the user switches workspaces mid-run.
  const projectIdRef = useRef<string | null>(null);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Track whether the current run already saw a fatal error so a late `done`
  // can't overwrite the partial-state persistence.
  const runHadFatalErrorRef = useRef(false);

  // ---- Per-round capture state (single-turn server, client drives loop) ----
  // Each server turn ends with a `done` event echoing the assistant turn +
  // tool_calls. The SSE handler stashes them here so the outer loop can pick
  // them up after the stream finishes.
  const pendingAssistantTurnRef = useRef<{
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
  } | null>(null);
  const pendingToolCallsRef = useRef<ToolCall[]>([]);
  const gotFinalDoneRef = useRef(false);
  const finalSummaryRef = useRef("");
  // Latest mode reported by the server (`status` mode event) so continuation
  // calls can echo it back instead of letting the server re-detect architect.
  const currentModeRef = useRef<AgentMode | null>(null);

  // Streaming persistence (Gap B): upsert the in-flight assistant message into
  // localStorage every ~500ms so a tab close mid-run keeps partial state.
  const streamPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const streamingAssistantIdRef = useRef<string | null>(null);
  const streamingContentRef = useRef<string>("");
  const streamingTimestampRef = useRef<number>(0);

  const persistStreamingMessage = useCallback((pid: string) => {
    if (!pid) return;
    if (!streamingAssistantIdRef.current) return;
    if (streamPersistTimerRef.current) {
      clearTimeout(streamPersistTimerRef.current);
    }

    streamPersistTimerRef.current = setTimeout(() => {
      const msgId = streamingAssistantIdRef.current;
      if (!msgId) return;

      const allMessages = getLocalMessages(pid);
      const draftMsg: BuilderProjectMessage = {
        id: msgId,
        role: "assistant",
        content: streamingContentRef.current,
        timestamp: streamingTimestampRef.current || Date.now(),
        toolCalls: toolCallsRef.current.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          result: tc.result,
          success: tc.success,
        })),
      };

      const existingIdx = allMessages.findIndex((m) => m.id === msgId);
      if (existingIdx >= 0) {
        allMessages[existingIdx] = draftMsg;
      } else {
        allMessages.push(draftMsg);
      }
      setLocalMessages(pid, allMessages);
    }, 500);
  }, []);

  const finalizeAssistantPersistence = useCallback(
    (pid: string, content: string, toolCallsArg: AgentToolCall[]) => {
      if (streamPersistTimerRef.current) {
        clearTimeout(streamPersistTimerRef.current);
        streamPersistTimerRef.current = null;
      }

      const msgId = streamingAssistantIdRef.current ?? `${Date.now()}-a`;
      const allMessages = getLocalMessages(pid);
      const finalMsg: BuilderProjectMessage = {
        id: msgId,
        role: "assistant",
        content,
        timestamp: streamingTimestampRef.current || Date.now(),
        toolCalls: toolCallsArg.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          result: tc.result,
          success: tc.success,
        })),
      };

      const idx = allMessages.findIndex((m) => m.id === msgId);
      if (idx >= 0) {
        allMessages[idx] = finalMsg;
      } else {
        allMessages.push(finalMsg);
      }
      setLocalMessages(pid, allMessages);

      streamingAssistantIdRef.current = null;
      streamingContentRef.current = "";
      streamingTimestampRef.current = 0;
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (streamPersistTimerRef.current) {
        clearTimeout(streamPersistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const appendLog = useCallback((line: string) => {
    if (!isMountedRef.current) return;
    setTerminalLogs((prev) => {
      const next = [...prev, line];
      return next.length > MAX_TERMINAL_LINES
        ? next.slice(-MAX_TERMINAL_LINES)
        : next;
    });
  }, []);

  const send = useCallback(
    async (
      prompt: string,
      overrideProjectId?: string,
      overrideMode?: AgentMode,
      modelOverride?: string,
    ) => {
      if (!isMountedRef.current) return;
      const pid = overrideProjectId ?? projectId;

      if (!pid) {
        setError("No project selected. Create a project first.");
        return;
      }

      // Capture pid for handlers — survives projectId switches mid-run.
      const runPid = pid;

      // Reset state for new run
      setError(null);
      setPhase("thinking");
      setIsRunning(true);
      setToolCalls([]);
      setAgentMode(null);
      runHadFatalErrorRef.current = false;
      gotFinalDoneRef.current = false;
      finalSummaryRef.current = "";
      currentModeRef.current = overrideMode ?? null;

      // Add user message
      const userMsg: AgentMessage = {
        id: `${Date.now()}-u`,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      addLocalMessage(pid, {
        id: userMsg.id,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      });

      // Add placeholder assistant message
      const assistantMsg: AgentMessage = {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isThinking: true,
        toolCalls: [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      streamingAssistantIdRef.current = assistantMsg.id;
      streamingContentRef.current = "";
      streamingTimestampRef.current = assistantMsg.timestamp;

      const controller = new AbortController();
      abortRef.current = controller;

      // In-memory file map for this run — the source of truth tools operate
      // on. Seeded from localStorage and persisted back after every mutation.
      let fileMap: Record<string, string> = { ...getLocalFiles(pid) };

      // LLM-shaped history sent on each continuation round.
      const llmHistory: LlmHistoryMessage[] = [];

      try {
        const liveSettings = settingsRef.current;
        const baseBody: Record<string, unknown> = {
          projectId: pid,
          prompt,
          model: modelOverride || liveSettings.model || "kr/claude-haiku-4.5",
        };
        if (liveSettings.apiKey?.trim()) baseBody.apiKey = liveSettings.apiKey;
        if (liveSettings.baseUrl?.trim()) baseBody.baseUrl = liveSettings.baseUrl;
        if (overrideMode) baseBody.mode = overrideMode;

        if (Object.keys(fileMap).length > 0) {
          baseBody.existingFiles = fileMap;
        }

        const recentMsgs = getLocalMessages(pid);
        if (recentMsgs.length > 0) {
          baseBody.history = recentMsgs
            .filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-20)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
        }

        let currentBody: Record<string, unknown> = baseBody;
        let round = 0;
        // Code/debug mode must produce tool calls. If the model replies with
        // text only (e.g. "Oke, aku setup project dulu...") without calling a
        // tool, the build makes zero progress — and every "lanjutkan" just
        // restarts the same empty promise. Mirror the old server guard: inject
        // a corrective reminder and retry, capped so a stubborn model can't
        // spin forever.
        let textOnlyRetries = 0;
        const MAX_TEXT_ONLY_RETRIES = 3;

        outerLoop: while (true) {
          round++;

          const res = await fetch("/api/builder/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentBody),
            signal: controller.signal,
          });

          if (!res.ok) {
            const errData = await res
              .json()
              .catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(
              (errData as { error?: string }).error || `HTTP ${res.status}`,
            );
          }
          if (!res.body) throw new Error("No response body");

          // Reset per-round capture; this round's `done` repopulates it.
          pendingAssistantTurnRef.current = null;
          pendingToolCallsRef.current = [];

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const raw = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              if (!raw.trim()) continue;

              let eventName = "message";
              let dataStr = "";
              for (const line of raw.split("\n")) {
                if (line.startsWith("event: ")) eventName = line.slice(7).trim();
                else if (line.startsWith("data: ")) dataStr += line.slice(6);
              }
              if (!dataStr) continue;

              let data: Record<string, unknown>;
              try {
                data = JSON.parse(dataStr);
              } catch {
                continue;
              }

              if (!isMountedRef.current) break;

              switch (eventName) {
                case "status": {
                  const p = data.phase as string;
                  const msg = data.message as string;
                  if (p === "terminal") {
                    appendLog(msg);
                  } else if (p === "mode") {
                    const m = msg as AgentMode;
                    setAgentMode(m);
                    currentModeRef.current = m;
                  } else {
                    setPhase(p as AgentPhase);
                    if (msg) appendLog(`[${p}] ${msg}`);
                  }
                  break;
                }
                case "tool_call": {
                  const tc: AgentToolCall = {
                    id: data.id as string,
                    name: data.name as string,
                    args: data.args as Record<string, unknown>,
                    timestamp: Date.now(),
                  };
                  setToolCalls((prev) => [...prev, tc]);
                  setPhase("executing");
                  const pathArg =
                    typeof tc.args.path === "string"
                      ? (tc.args.path as string)
                      : "...";
                  appendLog(`→ ${tc.name}(${pathArg})`);
                  persistStreamingMessage(runPid);
                  break;
                }
                case "thinking_delta": {
                  const text = data.text as string;
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === "assistant") {
                      const nextContent = last.content + text;
                      streamingContentRef.current = nextContent;
                      return [
                        ...prev.slice(0, -1),
                        { ...last, content: nextContent },
                      ];
                    }
                    return prev;
                  });
                  persistStreamingMessage(runPid);
                  break;
                }
                case "done": {
                  if (runHadFatalErrorRef.current) break;
                  const echo = data.assistant_message as
                    | {
                        role: "assistant";
                        content: string | null;
                        tool_calls?: ToolCall[];
                      }
                    | undefined;
                  pendingAssistantTurnRef.current = echo ?? null;
                  pendingToolCallsRef.current = echo?.tool_calls ?? [];

                  const continuation = data.continuation as
                    | string
                    | null
                    | undefined;
                  if (continuation !== "client-execute") {
                    gotFinalDoneRef.current = true;
                    finalSummaryRef.current =
                      (data.summary as string | undefined) ||
                      (echo?.content ?? "") ||
                      "Done";
                  }
                  break;
                }
                case "error": {
                  const errMsg = data.error as string;
                  setError(errMsg);
                  setPhase("error");
                  setIsRunning(false);
                  runHadFatalErrorRef.current = true;
                  appendLog(`\n❌ ${errMsg}`);

                  const finalToolCalls = toolCallsRef.current;
                  const fileCount = finalToolCalls.filter(
                    (tc) =>
                      tc.success &&
                      (tc.name === "create_file" || tc.name === "apply_diff"),
                  ).length;
                  const interruptedMsg =
                    fileCount > 0
                      ? `[Build terhenti — ${fileCount} file tersimpan, ketik "lanjutkan" untuk meneruskan]`
                      : `[Build error: ${errMsg}]`;

                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === "assistant") {
                      return [
                        ...prev.slice(0, -1),
                        {
                          ...last,
                          content: interruptedMsg,
                          isThinking: false,
                          toolCalls:
                            finalToolCalls.length > 0
                              ? [...finalToolCalls]
                              : last.toolCalls,
                        },
                      ];
                    }
                    return prev;
                  });

                  if (runPid) {
                    finalizeAssistantPersistence(
                      runPid,
                      interruptedMsg,
                      finalToolCalls,
                    );
                    updateLocalProject(runPid, {
                      lastRunStatus: "error",
                      lastRunAt: Date.now(),
                    } as Partial<BuilderProject>);
                  }
                  break;
                }
              }
            }
          }
          // ---- End of SSE stream for this round ----

          if (runHadFatalErrorRef.current) break outerLoop;
          if (gotFinalDoneRef.current) break outerLoop;
          if (round >= MAX_ROUNDS) {
            appendLog(`\n⚠ Max ${MAX_ROUNDS} rounds reached`);
            break outerLoop;
          }

          const echo = pendingAssistantTurnRef.current;
          const collected = pendingToolCallsRef.current;
          if (!echo || collected.length === 0) {
            // Effective mode for this run. Architect mode legitimately ends on
            // a text-only turn (it produces a plan, not files), so the guard
            // below only applies to code/debug.
            const effMode = currentModeRef.current ?? overrideMode ?? null;
            const isBuildMode = effMode === "code" || effMode === "debug";
            const hasText = !!(echo?.content && echo.content.trim().length > 0);

            if (
              isBuildMode &&
              hasText &&
              textOnlyRetries < MAX_TEXT_ONLY_RETRIES
            ) {
              // Text-only reply in build mode = no progress. Push the
              // assistant turn + a system nudge and loop again to force tool
              // use, instead of ending the run with zero files.
              textOnlyRetries++;
              log.warn("send", "text-only guard fired in build mode", {
                round,
                attempt: textOnlyRetries,
                max: MAX_TEXT_ONLY_RETRIES,
                mode: effMode,
              });
              appendLog(
                `\n⚠ AI hanya membalas teks tanpa membuat file — mengingatkan (${textOnlyRetries}/${MAX_TEXT_ONLY_RETRIES})...`,
              );
              if (round === 1 && prompt) {
                llmHistory.push({ role: "user", content: prompt });
              }
              llmHistory.push({
                role: "assistant",
                content: echo?.content ?? null,
              });
              llmHistory.push({
                role: "system",
                content:
                  'STOP. Kamu di MODE CODE — JANGAN cuma membalas teks. WAJIB langsung panggil tool (create_file / apply_diff / list_files) untuk benar-benar membuat file. Mulai dari package.json, index.html, src/main.tsx, src/App.tsx. Jangan menjelaskan rencana lagi — eksekusi sekarang, lalu panggil done() saat selesai.',
              });
              currentBody = {
                ...baseBody,
                prompt: "",
                history: compactLlmHistory(llmHistory),
                continuation: true,
                mode: effMode ?? "code",
                existingFiles: fileMap,
              };
              setPhase("thinking");
              continue outerLoop;
            }

            // No tools (and either architect mode, or out of retries) — final.
            // Distinguish the build-mode exhausted-cap case (gave up forcing
            // tool use) from the legitimate architect-mode text-only ending,
            // which is expected and must stay silent.
            if (
              isBuildMode &&
              hasText &&
              textOnlyRetries >= MAX_TEXT_ONLY_RETRIES
            ) {
              log.warn(
                "send",
                `giving up after ${textOnlyRetries} text-only retries; finalizing run with no tool execution`,
                {
                  round,
                  retries: textOnlyRetries,
                  max: MAX_TEXT_ONLY_RETRIES,
                  mode: effMode,
                },
              );
            }
            gotFinalDoneRef.current = true;
            finalSummaryRef.current = echo?.content ?? "";
            break outerLoop;
          }

          // Append assistant turn before its tool results (LLM contract:
          // assistant(tool_calls) → tool result(s) → next turn).
          if (round === 1 && prompt) {
            llmHistory.push({ role: "user", content: prompt });
          }
          llmHistory.push({
            role: "assistant",
            content: echo.content,
            tool_calls: echo.tool_calls,
          });

          // Execute each tool call against the in-memory file map.
          let sawDone = false;
          for (const tc of collected) {
            if (!isMountedRef.current) break outerLoop;
            if (controller.signal.aborted) break outerLoop;

            setPhase("executing");
            const exec = executeToolOnFileMap(fileMap, tc);

            // Apply file changes to the map + localStorage immediately.
            if (exec.filesChanged.length > 0) {
              const next = { ...fileMap };
              for (const fc of exec.filesChanged) {
                if (fc.deleted) delete next[fc.path];
                else next[fc.path] = fc.content;
              }
              fileMap = next;
              syncLocalFiles(runPid, fileMap);
              if (isMountedRef.current) setFilesVersion((v) => v + 1);
            }

            setToolCalls((prev) =>
              prev.map((t) =>
                t.id === tc.id
                  ? {
                      ...t,
                      result: exec.result.slice(0, 2000),
                      success: exec.success,
                    }
                  : t,
              ),
            );
            appendLog(
              exec.success
                ? `✓ ${tc.function.name}`
                : `✗ ${tc.function.name}: ${exec.result.slice(0, 200)}`,
            );

            llmHistory.push({
              role: "tool",
              tool_call_id: tc.id,
              content: exec.result,
            });

            if (exec.isDone) {
              gotFinalDoneRef.current = true;
              finalSummaryRef.current =
                exec.doneSummary || echo.content || "Done";
              sawDone = true;
              break;
            }
          }

          if (sawDone) break outerLoop;

          // The model made real progress (executed tools), so reset the
          // text-only guard — the cap should only fire on *consecutive*
          // empty turns, not alternating tool/text rounds.
          textOnlyRetries = 0;

          // Build continuation request for the next round.
          currentBody = {
            ...baseBody,
            prompt: "",
            history: compactLlmHistory(llmHistory),
            continuation: true,
            mode: currentModeRef.current ?? overrideMode ?? "code",
            existingFiles: fileMap,
          };
          setPhase("thinking");
        }
        // ---- End outer loop ----

        // Finalize (success path; error/abort handled elsewhere).
        if (
          !runHadFatalErrorRef.current &&
          isMountedRef.current &&
          !controller.signal.aborted
        ) {
          const summary = finalSummaryRef.current || "Done";
          setPhase("done");
          setIsRunning(false);
          setFilesVersion((v) => v + 1);

          const finalToolCalls = toolCallsRef.current;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: summary || last.content || "Done",
                  isThinking: false,
                  toolCalls:
                    finalToolCalls.length > 0
                      ? [...finalToolCalls]
                      : last.toolCalls,
                },
              ];
            }
            return prev;
          });

          if (runPid) {
            finalizeAssistantPersistence(
              runPid,
              summary || "(build complete)",
              finalToolCalls,
            );
            updateLocalProject(runPid, {
              lastRunStatus: "ok",
              lastRunAt: Date.now(),
            } as Partial<BuilderProject>);

            // Mirror final state to Supabase when authed (fire-and-forget).
            const uid = userIdRef.current;
            if (uid) {
              const projData = getLocalProjectData(runPid);
              if (projData) {
                void syncProjectToDB(
                  uid,
                  projData.project,
                  projData.messages,
                  projData.files,
                ).catch(() => {});
              }
            }
          }

          appendLog(`\n✅ ${summary}`);
        }
      } catch (e) {
        if (!isMountedRef.current) return;
        if ((e as Error).name === "AbortError") {
          setPhase("idle");
          setIsRunning(false);
          appendLog("[Dibatalkan]");

          const fileCount = toolCallsRef.current.filter(
            (tc) =>
              tc.success &&
              (tc.name === "create_file" || tc.name === "apply_diff"),
          ).length;
          const cancelMsg =
            fileCount > 0
              ? `[Dibatalkan — ${fileCount} file tersimpan, ketik "lanjutkan" untuk meneruskan]`
              : `[Dibatalkan]`;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isThinking) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: cancelMsg,
                  isThinking: false,
                  toolCalls: [...toolCallsRef.current],
                },
              ];
            }
            return prev;
          });

          if (runPid) {
            finalizeAssistantPersistence(
              runPid,
              cancelMsg,
              toolCallsRef.current,
            );
            updateLocalProject(runPid, {
              lastRunStatus: "interrupted",
              lastRunAt: Date.now(),
            });
          }
        } else if (!runHadFatalErrorRef.current) {
          setError((e as Error).message);
          setPhase("error");
          setIsRunning(false);
          appendLog(`❌ ${(e as Error).message}`);

          const fileCount = toolCallsRef.current.filter(
            (tc) =>
              tc.success &&
              (tc.name === "create_file" || tc.name === "apply_diff"),
          ).length;
          const errorMsg =
            fileCount > 0
              ? `[Build terhenti — ${fileCount} file tersimpan, ketik "lanjutkan" untuk meneruskan]`
              : `[Network error: ${(e as Error).message}]`;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isThinking) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: errorMsg,
                  isThinking: false,
                  toolCalls: [...toolCallsRef.current],
                },
              ];
            }
            return prev;
          });

          if (runPid) {
            finalizeAssistantPersistence(runPid, errorMsg, toolCallsRef.current);
            updateLocalProject(runPid, {
              lastRunStatus: "error",
              lastRunAt: Date.now(),
            });
          }
        }
      } finally {
        abortRef.current = null;
      }
    },
    [projectId, appendLog, persistStreamingMessage, finalizeAssistantPersistence],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        /* ignore */
      }
      abortRef.current = null;
    }
    setProjectId(null);
    setPhase("idle");
    setMessages([]);
    setToolCalls([]);
    setFilesVersion(0);
    setTerminalLogs([]);
    setError(null);
    setIsRunning(false);
    setAgentMode(null);
  }, []);

  const loadHistory = useCallback(
    (args: {
      messages: Array<{
        id?: string;
        role: string;
        content: string;
        created_at?: string;
        metadata?: Record<string, unknown>;
      }>;
      files: Array<{ path: string; content: string }>;
    }) => {
      const agentMessages: AgentMessage[] = args.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const meta = (m.metadata ?? {}) as Record<string, unknown>;
          const rawTools = meta.tool_calls;
          const persistedTools: Array<Record<string, unknown>> = Array.isArray(
            rawTools,
          )
            ? (rawTools as Array<Record<string, unknown>>)
            : [];

          const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();

          const toolCallsArr: AgentToolCall[] = persistedTools.map((tc, idx) => ({
            id: typeof tc.id === "string" ? tc.id : `${m.id ?? "msg"}-tc-${idx}`,
            name: typeof tc.name === "string" ? tc.name : "unknown",
            args: (tc.args as Record<string, unknown>) ?? {},
            result: typeof tc.result === "string" ? tc.result : undefined,
            success: typeof tc.success === "boolean" ? tc.success : undefined,
            timestamp: ts,
          }));

          return {
            id: m.id ?? `${Date.now()}-${Math.random()}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: ts,
            toolCalls: toolCallsArr.length > 0 ? toolCallsArr : undefined,
          };
        });

      setMessages(agentMessages);
      // Signal the UI that files are available so it can (re)embed StackBlitz.
      if (args.files.length > 0) {
        setFilesVersion((v) => v + 1);
        setPhase("done");
      }
    },
    [],
  );

  return {
    projectId,
    phase,
    messages,
    toolCalls,
    filesVersion,
    terminalLogs,
    error,
    isRunning,
    agentMode,
    send,
    abort,
    reset,
    setProjectId,
    loadHistory,
  };
}
