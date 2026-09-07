import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Conversation, Message } from "@/lib/types";

// Mock Supabase
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import {
  getConversationsFromDB,
  saveConversationToDB,
  deleteConversationFromDB,
  clearAllConversationsFromDB,
} from "@/lib/chat-db";

describe("chat-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "test-user-123" } } });
  });

  describe("getConversationsFromDB", () => {
    it("returns empty array when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const result = await getConversationsFromDB();
      expect(result).toEqual([]);
    });

    it("returns empty array on query error", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
      });
      const result = await getConversationsFromDB();
      expect(result).toEqual([]);
    });

    it("returns mapped conversations on success", async () => {
      const dbData = [
        {
          id: "conv-1",
          title: "Test Chat",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          chat_messages: [
            {
              id: "msg-1",
              role: "user",
              content: "Hello",
              model: null,
              reasoning: null,
              tool_calls: null,
              tool_call_id: null,
              attachments: null,
              created_at: "2024-01-01T00:00:01Z",
            },
            {
              id: "msg-2",
              role: "assistant",
              content: "Hi there!",
              model: "gpt-4o",
              reasoning: null,
              tool_calls: null,
              tool_call_id: null,
              attachments: null,
              created_at: "2024-01-01T00:00:02Z",
            },
          ],
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
          }),
        }),
      });

      const result = await getConversationsFromDB();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("conv-1");
      expect(result[0].title).toBe("Test Chat");
      expect(result[0].messages).toHaveLength(2);
      expect(result[0].messages[0].role).toBe("user");
      expect(result[0].messages[1].model).toBe("gpt-4o");
    });

    it("sorts messages by created_at ascending", async () => {
      const dbData = [
        {
          id: "conv-1",
          title: "Chat",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          chat_messages: [
            { id: "msg-2", role: "assistant", content: "Reply", model: null, reasoning: null, tool_calls: null, tool_call_id: null, attachments: null, created_at: "2024-01-01T00:00:05Z" },
            { id: "msg-1", role: "user", content: "First", model: null, reasoning: null, tool_calls: null, tool_call_id: null, attachments: null, created_at: "2024-01-01T00:00:01Z" },
          ],
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
          }),
        }),
      });

      const result = await getConversationsFromDB();
      expect(result[0].messages[0].id).toBe("msg-1");
      expect(result[0].messages[1].id).toBe("msg-2");
    });

    it("handles null chat_messages gracefully", async () => {
      const dbData = [
        {
          id: "conv-1",
          title: "Empty Chat",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          chat_messages: null,
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
          }),
        }),
      });

      const result = await getConversationsFromDB();
      expect(result[0].messages).toEqual([]);
    });

    it("drops malformed tool_calls/attachments via type guards", async () => {
      const dbData = [
        {
          id: "conv-1",
          title: "Chat",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          chat_messages: [
            {
              id: "msg-1",
              role: "assistant",
              content: "Hi",
              model: null,
              reasoning: null,
              // Both should fail the array check and be dropped, not crash.
              tool_calls: "not an array",
              tool_call_id: null,
              attachments: { not: "an array" },
              created_at: "2024-01-01T00:00:01Z",
            },
          ],
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
          }),
        }),
      });

      const result = await getConversationsFromDB();
      const msg = result[0].messages[0];
      expect(msg.tool_calls).toBeUndefined();
      expect(msg.attachments).toBeUndefined();
    });
  });

  describe("saveConversationToDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const conv: Conversation = {
        id: "conv-1",
        title: "Test",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveConversationToDB(conv);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("upserts conversation, then upserts messages and prunes orphans", async () => {
      const mockConvUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockMsgUpsert = vi.fn().mockResolvedValue({ error: null });
      // Existing message rows include msg-1 (kept) and msg-old (orphan).
      const mockSelectEq = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "msg-1" }, { id: "msg-old" }], error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockSelectEq });
      const mockDeleteIn = vi.fn().mockResolvedValue({ error: null });
      const mockDeleteEq = vi.fn().mockReturnValue({ in: mockDeleteIn });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });

      mockFrom.mockImplementation((table: string) => {
        if (table === "chat_conversations") return { upsert: mockConvUpsert };
        if (table === "chat_messages")
          return { upsert: mockMsgUpsert, select: mockSelect, delete: mockDelete };
        return {};
      });

      const conv: Conversation = {
        id: "conv-1",
        title: "Test Chat",
        messages: [
          { id: "msg-1", role: "user", content: "Hello", timestamp: 1704067200000 },
        ] as Message[],
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      };

      await saveConversationToDB(conv);

      // Conversation upsert with onConflict
      expect(mockConvUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: "conv-1", user_id: "test-user-123" }),
        { onConflict: "id" },
      );
      // Messages upserted, not delete-then-insert
      expect(mockMsgUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "msg-1" })]),
        { onConflict: "id" },
      );
      // Orphan pruned by id
      expect(mockDeleteIn).toHaveBeenCalledWith("id", ["msg-old"]);
    });

    it("does not delete anything when no orphans are detected", async () => {
      const mockConvUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockMsgUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockSelectEq = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "msg-1" }], error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockSelectEq });
      const mockDelete = vi.fn();

      mockFrom.mockImplementation((table: string) => {
        if (table === "chat_conversations") return { upsert: mockConvUpsert };
        if (table === "chat_messages")
          return { upsert: mockMsgUpsert, select: mockSelect, delete: mockDelete };
        return {};
      });

      const conv: Conversation = {
        id: "conv-1",
        title: "Test",
        messages: [
          { id: "msg-1", role: "user", content: "Hello", timestamp: 1704067200000 },
        ] as Message[],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveConversationToDB(conv);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("skips message upsert when messages array is empty but still prunes orphans", async () => {
      const mockConvUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockMsgUpsert = vi.fn();
      const mockSelectEq = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "old-1" }], error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockSelectEq });
      const mockDeleteIn = vi.fn().mockResolvedValue({ error: null });
      const mockDeleteEq = vi.fn().mockReturnValue({ in: mockDeleteIn });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });

      mockFrom.mockImplementation((table: string) => {
        if (table === "chat_conversations") return { upsert: mockConvUpsert };
        if (table === "chat_messages")
          return { upsert: mockMsgUpsert, select: mockSelect, delete: mockDelete };
        return {};
      });

      const conv: Conversation = {
        id: "conv-1",
        title: "Empty",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveConversationToDB(conv);
      expect(mockMsgUpsert).not.toHaveBeenCalled();
      expect(mockDeleteIn).toHaveBeenCalledWith("id", ["old-1"]);
    });

    it("handles conversation upsert error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockUpsert = vi.fn().mockResolvedValue({ error: { message: "upsert failed" } });

      mockFrom.mockImplementation((table: string) => {
        if (table === "chat_conversations") return { upsert: mockUpsert };
        return {};
      });

      const conv: Conversation = {
        id: "conv-1",
        title: "Test",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveConversationToDB(conv);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("deleteConversationFromDB", () => {
    it("scopes delete by id and user_id", async () => {
      const eqUser = vi.fn().mockResolvedValue({ error: null });
      const eqId = vi.fn().mockReturnValue({ eq: eqUser });
      const mockDeleteFn = vi.fn().mockReturnValue({ eq: eqId });
      mockFrom.mockReturnValue({ delete: mockDeleteFn });

      await deleteConversationFromDB("conv-123");
      expect(mockFrom).toHaveBeenCalledWith("chat_conversations");
      expect(eqId).toHaveBeenCalledWith("id", "conv-123");
      expect(eqUser).toHaveBeenCalledWith("user_id", "test-user-123");
    });

    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await deleteConversationFromDB("conv-123");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("handles delete error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const eqUser = vi
        .fn()
        .mockResolvedValue({ error: { message: "delete failed" } });
      const eqId = vi.fn().mockReturnValue({ eq: eqUser });
      mockFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqId }) });

      await deleteConversationFromDB("conv-123");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("clearAllConversationsFromDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await clearAllConversationsFromDB();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("deletes all conversations for the user", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDeleteFn = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ delete: mockDeleteFn });

      await clearAllConversationsFromDB();
      expect(mockFrom).toHaveBeenCalledWith("chat_conversations");
      expect(mockEq).toHaveBeenCalledWith("user_id", "test-user-123");
    });
  });
});
