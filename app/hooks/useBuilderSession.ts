"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "./useSettings";
import {
  addMessage as addLocalMessage,
  updateProject as updateLocalProject,
  getMessages as getLocalMessages,
  setMessages as setLocalMessages,
  getProjectData as getLocalProjectData,
  syncProjectToDB,
  type BuilderProject,
  type BuilderProjectMessage,
} from "@/lib/builder-storage";
import type { AgentMode } from "@/lib/agent-tools";
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
  /** Preview URL emitted by the server (wildcard subdomain) once the dev server is up. */
  previewUrl: string | null;
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Tracks whether the current run already hit a fatal error, so the finalize
  // step doesn't overwrite an error phase with "done".
  const hadErrorRef = useRef(false);

  // Mirror of toolCalls so the SSE handler (whose `send` closure may be stale)
  // can read the live tool-call array.
  const toolCallsRef = useRef<AgentToolCall[]>([]);
  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  // Keep userId/settings in refs so the long-lived `send` closure can read the
  // current values without listing them as deps.
  const userIdRef = useRef<string | null>(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Streaming persistence: upsert the in-flight assistant message into
  // localStorage every ~500ms so a tab close mid-run keeps partial state.
  const streamPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

      const msgId = streamingAssistantIdRef.current ?? crypto.randomUUID();
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

  // ---- send: single POST + SSE stream (server drives the full loop) ----

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

      const runPid = pid;

      // Reset state for new run.
      setError(null);
      setPhase("thinking");
      setIsRunning(true);
      setToolCalls([]);
      setAgentMode(null);
      setPreviewUrl(null);
      hadErrorRef.current = false;

      // Add user message.
      const userMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      addLocalMessage(runPid, {
        id: userMsg.id,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      });

      // Add placeholder assistant message.
      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
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

      try {
        const liveSettings = settingsRef.current;
        const body: Record<string, unknown> = {
          projectId: runPid,
          prompt,
          model: modelOverride || liveSettings.model || "kr/claude-haiku-4.5",
        };
        if (overrideMode) body.mode = overrideMode;

        const res = await fetch("/api/builder/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalSummary = "";

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
              case "terminal": {
                const text = data.text as string;
                if (text) appendLog(text);
                break;
              }
              case "status": {
                const p = data.phase as string;
                const msg = data.message as string;
                if (p === "terminal") {
                  appendLog(msg);
                } else if (p === "mode") {
                  const m = msg as AgentMode;
                  setAgentMode(m);
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
                finalSummary =
                  (data.summary as string | undefined) ||
                  (data.assistant_message as { content?: string } | undefined)
                    ?.content ||
                  "Done";
                break;
              }
              case "preview_ready": {
                const url = data.url as string;
                if (url) setPreviewUrl(url);
                break;
              }
              case "error": {
                const errMsg = data.error as string;
                setError(errMsg);
                setPhase("error");
                setIsRunning(false);
                hadErrorRef.current = true;
                appendLog(`\n❌ ${errMsg}`);
                break;
              }
            }
          }
        }

        // ---- Finalize (success path) ----
        if (
          isMountedRef.current &&
          !controller.signal.aborted &&
          !hadErrorRef.current
        ) {
          const summary = finalSummary || "Done";
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

          appendLog(`\n✅ ${summary}`);
        }
      } catch (e) {
        if (!isMountedRef.current) return;
        if ((e as Error).name === "AbortError") {
          setPhase("idle");
          setIsRunning(false);
          appendLog("[Dibatalkan]");

          const cancelMsg = "[Dibatalkan]";
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

          finalizeAssistantPersistence(runPid, cancelMsg, toolCallsRef.current);
          updateLocalProject(runPid, {
            lastRunStatus: "interrupted",
            lastRunAt: Date.now(),
          });
        } else {
          const errMsg = (e as Error).message;
          setError(errMsg);
          setPhase("error");
          setIsRunning(false);
          appendLog(`❌ ${errMsg}`);

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isThinking) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: `[Network error: ${errMsg}]`,
                  isThinking: false,
                  toolCalls: [...toolCallsRef.current],
                },
              ];
            }
            return prev;
          });

          finalizeAssistantPersistence(
            runPid,
            `[Network error: ${errMsg}]`,
            toolCallsRef.current,
          );
          updateLocalProject(runPid, {
            lastRunStatus: "error",
            lastRunAt: Date.now(),
          });
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
    setPreviewUrl(null);
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
            id: m.id ?? crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: ts,
            toolCalls: toolCallsArr.length > 0 ? toolCallsArr : undefined,
          };
        });

      setMessages(agentMessages);
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
    previewUrl,
    send,
    abort,
    reset,
    setProjectId,
    loadHistory,
  };
}
