import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock useSettings
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {
      apiKey: "",
      baseUrl: "",
      model: "kr/claude-opus-4.6",
      temperature: 0.7,
      maxTokens: 16384,
      systemPrompt: "",
    },
    isLoaded: true,
    isConfigured: true,
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
    serverConfig: { aiConfigured: true, usageConfigured: false, aiBaseUrlHint: null },
  }),
}));

// Mock builder-storage
vi.mock("@/lib/builder-storage", () => ({
  addMessage: vi.fn(),
  syncFiles: vi.fn(),
  updateProject: vi.fn(),
  getFiles: vi.fn(() => ({})),
  getMessages: vi.fn(() => []),
  setMessages: vi.fn(),
  getProjectData: vi.fn(() => null),
  syncProjectToDB: vi.fn(() => Promise.resolve()),
}));

// Mock the StackBlitz tool dispatcher. The hook imports `executeToolOnFileMap`
// at module top and runs tool calls client-side against an in-memory file map.
vi.mock("@/lib/stackblitz-tool-dispatch", () => ({
  executeToolOnFileMap: vi.fn(() => ({
    result: "ok",
    success: true,
    filesChanged: [],
  })),
}));

import { useBuilderSession } from "@/hooks/useBuilderSession";
import {
  addMessage,
  getFiles,
  syncFiles,
} from "@/lib/builder-storage";
import { executeToolOnFileMap } from "@/lib/stackblitz-tool-dispatch";

function createMockSSEStream(events: Array<{ event: string; data: Record<string, unknown> }>) {
  const lines = events.map(({ event, data }) => {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  });
  const text = lines.join("");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Build a server `done` event payload in the new single-turn contract. */
function doneEvent(opts: {
  content?: string | null;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  continuation?: "client-execute" | null;
  summary?: string;
}) {
  const tool_calls = (opts.toolCalls ?? []).map((tc) => ({
    id: tc.id,
    type: "function",
    function: { name: tc.name, arguments: JSON.stringify(tc.args) },
  }));
  const data: Record<string, unknown> = {
    assistant_message: {
      role: "assistant",
      content: opts.content ?? null,
      ...(tool_calls.length > 0 ? { tool_calls } : {}),
    },
    continuation: opts.continuation ?? null,
  };
  if (opts.summary !== undefined) data.summary = opts.summary;
  return { event: "done", data };
}

describe("useBuilderSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(executeToolOnFileMap).mockReturnValue({
      result: "ok",
      success: true,
      filesChanged: [],
    });
  });

  it("initializes with idle state", () => {
    const { result } = renderHook(() => useBuilderSession());

    expect(result.current.projectId).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(result.current.messages).toEqual([]);
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.filesVersion).toBe(0);
    expect(result.current.terminalLogs).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.agentMode).toBeNull();
  });

  it("setProjectId updates the project ID", () => {
    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    expect(result.current.projectId).toBe("project-123");
  });

  it("send sets error when no project is selected", async () => {
    const { result } = renderHook(() => useBuilderSession());

    await act(async () => {
      await result.current.send("Build a todo app");
    });

    expect(result.current.error).toBe("No project selected. Create a project first.");
    expect(result.current.isRunning).toBe(false);
  });

  it("send adds user and assistant messages on a no-tool completion", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([
        { event: "status", data: { phase: "thinking", message: "Planning..." } },
        doneEvent({ content: "Built the app", continuation: null }),
      ])
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Build a todo app", "project-123");
    });

    // Should have user + assistant messages
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Build a todo app");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Built the app");
    expect(result.current.phase).toBe("done");
    expect(result.current.isRunning).toBe(false);
  });

  it("send persists user message to localStorage", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([doneEvent({ content: "Done", continuation: null })])
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Hello", "project-123");
    });

    expect(addMessage).toHaveBeenCalledWith(
      "project-123",
      expect.objectContaining({
        role: "user",
        content: "Hello",
      })
    );
  });

  it("send handles error SSE event", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([
        { event: "status", data: { phase: "thinking", message: "Starting..." } },
        { event: "error", data: { error: "Sandbox timeout" } },
      ])
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Build it", "project-123");
    });

    expect(result.current.error).toBe("Sandbox timeout");
    expect(result.current.phase).toBe("error");
    expect(result.current.isRunning).toBe(false);
  });

  it("send handles HTTP error response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Build it", "project-123");
    });

    expect(result.current.error).toBe("Internal server error");
    expect(result.current.phase).toBe("error");
    expect(result.current.isRunning).toBe(false);
  });

  it("send surfaces tool_call events in toolCalls", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([
        {
          event: "tool_call",
          data: { id: "tc-1", name: "create_file", args: { path: "/index.html", content: "<h1>Hi</h1>" } },
        },
        doneEvent({ content: "Created file", continuation: null }),
      ])
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Create index.html", "project-123");
    });

    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.toolCalls[0].name).toBe("create_file");
  });

  it("send does NOT execute tool calls client-side (server-driven loop)", async () => {
    vi.mocked(getFiles).mockReturnValue({});

    // The server now drives the full loop, so a single POST returns a stream
    // that includes tool_call events AND the final done event — the client no
    // longer re-POSTs or executes tools locally.
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([
        {
          event: "tool_call",
          data: { id: "tc-1", name: "create_file", args: { path: "/x.tsx", content: "y" } },
        },
        doneEvent({ content: "All done", continuation: null }),
      ])
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Create x.tsx", "project-123");
    });

    // Client no longer executes tools locally.
    expect(executeToolOnFileMap).not.toHaveBeenCalled();
    // Single POST (no continuation re-POST).
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Tool call surfaced in the activity feed.
    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.phase).toBe("done");
    expect(result.current.isRunning).toBe(false);
  });

  it("updates tool result on tool_result event (Steps panel advances)", async () => {
    vi.mocked(getFiles).mockReturnValue({});

    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([
        {
          event: "tool_call",
          data: { id: "tc-1", name: "create_file", args: { path: "/x.tsx", content: "y" } },
        },
        {
          event: "tool_result",
          data: { id: "tc-1", success: true, result: "File created: /x.tsx" },
        },
        doneEvent({ content: "Done", continuation: null }),
      ])
    );

    const { result } = renderHook(() => useBuilderSession());
    act(() => result.current.setProjectId("project-123"));

    await act(async () => {
      await result.current.send("Create x.tsx", "project-123");
    });

    // The tool call now has its result populated (so the Steps panel shows
    // completed=1 rather than 0).
    expect(result.current.toolCalls[0].result).toBe("File created: /x.tsx");
    expect(result.current.toolCalls[0].success).toBe(true);
  });

  it("abort cancels the current run", async () => {
    const mockAbort = vi.fn();
    const originalAbortController = global.AbortController;
    let signalRef: any = { aborted: false };
    global.AbortController = vi.fn(() => ({
      signal: signalRef,
      abort: () => {
        signalRef.aborted = true;
        mockAbort();
      },
    })) as any;

    vi.mocked(global.fetch).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    // Start send (don't await)
    act(() => {
      result.current.send("Build it", "project-123");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.abort();
    });

    expect(mockAbort).toHaveBeenCalled();

    global.AbortController = originalAbortController;
  });

  it("reset clears all session state", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEStream([doneEvent({ content: "Done", continuation: null })])
    );

    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.setProjectId("project-123");
    });

    await act(async () => {
      await result.current.send("Build it", "project-123");
    });

    // Verify state is populated
    expect(result.current.projectId).toBe("project-123");
    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.reset();
    });

    expect(result.current.projectId).toBeNull();
    expect(result.current.phase).toBe("idle");
    expect(result.current.messages).toEqual([]);
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.filesVersion).toBe(0);
    expect(result.current.terminalLogs).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.agentMode).toBeNull();
  });

  it("loadHistory hydrates messages from server data", () => {
    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.loadHistory({
        messages: [
          { id: "m1", role: "user", content: "Hello", created_at: "2024-01-01T00:00:00Z" },
          { id: "m2", role: "assistant", content: "Hi there", created_at: "2024-01-01T00:00:01Z" },
        ],
        files: [{ path: "/index.html", content: "<h1>Hi</h1>" }],
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello");
    expect(result.current.messages[1].role).toBe("assistant");
    expect(result.current.messages[1].content).toBe("Hi there");
    // Files present -> signal UI to re-embed and mark the project done.
    expect(result.current.filesVersion).toBeGreaterThan(0);
    expect(result.current.phase).toBe("done");
  });

  it("loadHistory leaves phase idle when no files are provided", () => {
    const { result } = renderHook(() => useBuilderSession());

    act(() => {
      result.current.loadHistory({
        messages: [{ id: "m1", role: "user", content: "Hello" }],
        files: [],
      });
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.filesVersion).toBe(0);
  });
});
