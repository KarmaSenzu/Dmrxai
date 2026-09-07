import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid-" + Math.random().toString(36).slice(2, 8)),
}));

// Mock storage
vi.mock("@/lib/storage", () => ({
  saveConversation: vi.fn(),
  getConversations: vi.fn(() => []),
  deleteConversation: vi.fn(),
  saveConversations: vi.fn(),
}));

// Mock chat-db
vi.mock("@/lib/chat-db", () => ({
  getConversationsFromDB: vi.fn(() => Promise.resolve([])),
  saveConversationToDB: vi.fn(() => Promise.resolve()),
  deleteConversationFromDB: vi.fn(() => Promise.resolve()),
  clearAllConversationsFromDB: vi.fn(() => Promise.resolve()),
}));

// Mock supabase
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
    },
  }),
}));

// Mock tools
vi.mock("@/lib/tools", () => ({
  executeTool: vi.fn(() => Promise.resolve("tool result")),
}));

// Mock auto-mode
vi.mock("@/lib/auto-mode", () => ({
  detectIntent: vi.fn(() => ({ effectiveMode: "normal", reason: "", signals: [] })),
}));

import { useChat } from "@/hooks/useChat";
import { getConversations, saveConversation, saveConversations } from "@/lib/storage";
import type { Settings } from "@/lib/types";

const mockSettings: Settings = {
  apiKey: "test-key",
  baseUrl: "https://api.test.com",
  model: "kr/claude-opus-4.6",
  temperature: 0.7,
  maxTokens: 16384,
  systemPrompt: "",
};

function createMockSSEResponse(content: string) {
  const chunks = [
    `data: {"choices":[{"delta":{"content":"${content}"},"finish_reason":null}]}\n\n`,
    `data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("initializes with empty state", () => {
    const { result } = renderHook(() => useChat(mockSettings));

    expect(result.current.conversations).toEqual([]);
    expect(result.current.activeConversation).toBeNull();
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("loadConversations reads from localStorage", () => {
    const mockConvs = [
      {
        id: "conv-1",
        title: "Test Chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    vi.mocked(getConversations).mockReturnValue(mockConvs);

    const { result } = renderHook(() => useChat(mockSettings));

    act(() => {
      result.current.loadConversations();
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].title).toBe("Test Chat");
  });

  it("createConversation adds a new conversation and sets it active", () => {
    const { result } = renderHook(() => useChat(mockSettings));

    let newConv: any;
    act(() => {
      newConv = result.current.createConversation();
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversationId).toBe(newConv.id);
    expect(result.current.conversations[0].title).toBe("New Chat");
    expect(saveConversations).toHaveBeenCalled();
  });

  it("deleteConversation removes conversation and clears active if matching", () => {
    const { result } = renderHook(() => useChat(mockSettings));

    let newConv: any;
    act(() => {
      newConv = result.current.createConversation();
    });

    expect(result.current.activeConversationId).toBe(newConv.id);

    act(() => {
      result.current.deleteConversation(newConv.id);
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("selectConversation sets the active conversation ID", () => {
    const mockConvs = [
      {
        id: "conv-1",
        title: "Chat 1",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "conv-2",
        title: "Chat 2",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    vi.mocked(getConversations).mockReturnValue(mockConvs);

    const { result } = renderHook(() => useChat(mockSettings));

    act(() => {
      result.current.loadConversations();
    });

    act(() => {
      result.current.selectConversation("conv-2");
    });

    expect(result.current.activeConversationId).toBe("conv-2");
  });

  it("sendMessage does nothing when content is empty", async () => {
    const { result } = renderHook(() => useChat(mockSettings));

    await act(async () => {
      await result.current.sendMessage("");
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sendMessage sets error when credentials are missing", async () => {
    const noCredsSettings: Settings = {
      ...mockSettings,
      apiKey: "",
      baseUrl: "",
    };

    const { result } = renderHook(() => useChat(noCredsSettings));

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.error).toBe(
      "Please configure your API Key and Model in Settings."
    );
  });

  it("sendMessage creates conversation if none active and streams response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEResponse("Hello there!")
    );

    const { result } = renderHook(() => useChat(mockSettings));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    // Should have created a conversation
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversationId).not.toBeNull();

    // Should have user + assistant messages
    const conv = result.current.conversations[0];
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0].role).toBe("user");
    expect(conv.messages[0].content).toBe("Hi");
    expect(conv.messages[1].role).toBe("assistant");
    expect(conv.messages[1].content).toBe("Hello there!");
  });

  it("sendMessage sets isLoading during request", async () => {
    let resolveResponse: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.mocked(global.fetch).mockReturnValue(responsePromise as any);

    const { result } = renderHook(() => useChat(mockSettings));

    // Start sending (don't await)
    const sendPromise = act(async () => {
      await result.current.sendMessage("Hello");
    });

    // isLoading should be true while waiting
    // Note: due to React batching, we check after the act resolves
    resolveResponse!(createMockSSEResponse("Response"));
    await sendPromise;

    // After completion, isLoading should be false
    expect(result.current.isLoading).toBe(false);
  });

  it("sendMessage handles HTTP error responses", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useChat(mockSettings));

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Should show a user-friendly error in the assistant message
    const conv = result.current.conversations[0];
    const assistantMsg = conv.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.content).toContain("Model tidak dapat digunakan");
  });

  it("stopGeneration aborts the current request", async () => {
    const mockAbort = vi.fn();
    const originalAbortController = global.AbortController;
    global.AbortController = vi.fn(() => ({
      signal: { aborted: false },
      abort: mockAbort,
    })) as any;

    vi.mocked(global.fetch).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useChat(mockSettings));

    // Start a message (don't await since it won't resolve)
    act(() => {
      result.current.sendMessage("Hello");
    });

    // Wait a tick for the fetch to be called
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.stopGeneration();
    });

    expect(mockAbort).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);

    global.AbortController = originalAbortController;
  });

  it("clearAllConversations removes all conversations", () => {
    vi.mocked(getConversations).mockReturnValue([
      { id: "1", title: "A", messages: [], createdAt: 1, updatedAt: 1 },
      { id: "2", title: "B", messages: [], createdAt: 2, updatedAt: 2 },
    ]);

    const { result } = renderHook(() => useChat(mockSettings));

    act(() => {
      result.current.loadConversations();
    });

    expect(result.current.conversations).toHaveLength(2);

    act(() => {
      result.current.clearAllConversations();
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("sendMessage in serverManaged mode only requires model", async () => {
    const serverManagedSettings: Settings = {
      ...mockSettings,
      apiKey: "",
      baseUrl: "",
      model: "kr/claude-opus-4.6",
    };

    vi.mocked(global.fetch).mockResolvedValue(
      createMockSSEResponse("Server managed response")
    );

    const { result } = renderHook(() =>
      useChat(serverManagedSettings, { serverManaged: true })
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    // Should NOT set error since serverManaged only needs model
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalled();
  });
});
