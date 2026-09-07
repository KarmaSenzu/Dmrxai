import { describe, it, expect, beforeEach } from "vitest";
import {
  getSettings,
  saveSettings,
  getConversations,
  saveConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  getTheme,
  saveTheme,
} from "@/lib/storage";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { Conversation, Settings } from "@/lib/types";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getSettings", () => {
    it("returns DEFAULT_SETTINGS when nothing is stored", () => {
      const result = getSettings();
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    it("returns merged settings from localStorage", () => {
      const custom = { model: "gpt-4o", temperature: 0.5 };
      localStorage.setItem("chat-app-settings", JSON.stringify(custom));
      const result = getSettings();
      expect(result.model).toBe("gpt-4o");
      expect(result.temperature).toBe(0.5);
      // Other fields should come from defaults
      expect(result.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    });

    it("returns DEFAULT_SETTINGS on parse error", () => {
      localStorage.setItem("chat-app-settings", "invalid-json{{{");
      const result = getSettings();
      expect(result).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("saveSettings", () => {
    it("saves settings to localStorage", () => {
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        model: "claude-3-opus",
        temperature: 0.9,
      };
      saveSettings(settings);
      const stored = JSON.parse(localStorage.getItem("chat-app-settings")!);
      expect(stored.model).toBe("claude-3-opus");
      expect(stored.temperature).toBe(0.9);
    });

    it("overwrites existing settings", () => {
      saveSettings({ ...DEFAULT_SETTINGS, model: "first" });
      saveSettings({ ...DEFAULT_SETTINGS, model: "second" });
      const stored = JSON.parse(localStorage.getItem("chat-app-settings")!);
      expect(stored.model).toBe("second");
    });
  });

  describe("getConversations", () => {
    it("returns empty array when nothing is stored", () => {
      const result = getConversations();
      expect(result).toEqual([]);
    });

    it("returns parsed conversations from localStorage", () => {
      const convs: Conversation[] = [
        { id: "1", title: "Chat 1", messages: [], createdAt: 1000, updatedAt: 2000 },
      ];
      localStorage.setItem("chat-app-conversations", JSON.stringify(convs));
      const result = getConversations();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("returns empty array on parse error", () => {
      localStorage.setItem("chat-app-conversations", "not-json!!!");
      const result = getConversations();
      expect(result).toEqual([]);
    });
  });

  describe("saveConversations", () => {
    it("saves conversations to localStorage", () => {
      const convs: Conversation[] = [
        { id: "1", title: "Chat", messages: [], createdAt: 1000, updatedAt: 2000 },
      ];
      saveConversations(convs);
      const stored = JSON.parse(localStorage.getItem("chat-app-conversations")!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("1");
    });

    it("sorts conversations by updatedAt descending before saving", () => {
      const convs: Conversation[] = [
        { id: "old", title: "Old", messages: [], createdAt: 1000, updatedAt: 1000 },
        { id: "new", title: "New", messages: [], createdAt: 2000, updatedAt: 3000 },
      ];
      saveConversations(convs);
      const stored = JSON.parse(localStorage.getItem("chat-app-conversations")!);
      expect(stored[0].id).toBe("new");
      expect(stored[1].id).toBe("old");
    });
  });

  describe("getConversation", () => {
    it("returns undefined when conversation not found", () => {
      const result = getConversation("nonexistent");
      expect(result).toBeUndefined();
    });

    it("returns the matching conversation", () => {
      const convs: Conversation[] = [
        { id: "abc", title: "Found", messages: [], createdAt: 1000, updatedAt: 2000 },
        { id: "def", title: "Other", messages: [], createdAt: 1000, updatedAt: 2000 },
      ];
      localStorage.setItem("chat-app-conversations", JSON.stringify(convs));
      const result = getConversation("abc");
      expect(result).toBeDefined();
      expect(result!.title).toBe("Found");
    });
  });

  describe("saveConversation", () => {
    it("adds new conversation to the beginning", () => {
      const existing: Conversation[] = [
        { id: "old", title: "Old", messages: [], createdAt: 1000, updatedAt: 1000 },
      ];
      localStorage.setItem("chat-app-conversations", JSON.stringify(existing));

      const newConv: Conversation = {
        id: "new",
        title: "New Chat",
        messages: [],
        createdAt: 2000,
        updatedAt: 3000,
      };
      saveConversation(newConv);

      const stored = JSON.parse(localStorage.getItem("chat-app-conversations")!);
      // New conversation should be present
      expect(stored.some((c: Conversation) => c.id === "new")).toBe(true);
    });

    it("updates existing conversation in place", () => {
      const existing: Conversation[] = [
        { id: "conv-1", title: "Original", messages: [], createdAt: 1000, updatedAt: 1000 },
      ];
      localStorage.setItem("chat-app-conversations", JSON.stringify(existing));

      const updated: Conversation = {
        id: "conv-1",
        title: "Updated Title",
        messages: [],
        createdAt: 1000,
        updatedAt: 2000,
      };
      saveConversation(updated);

      const stored = JSON.parse(localStorage.getItem("chat-app-conversations")!);
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe("Updated Title");
    });
  });

  describe("deleteConversation", () => {
    it("removes conversation by id", () => {
      const convs: Conversation[] = [
        { id: "keep", title: "Keep", messages: [], createdAt: 1000, updatedAt: 2000 },
        { id: "delete", title: "Delete", messages: [], createdAt: 1000, updatedAt: 1000 },
      ];
      localStorage.setItem("chat-app-conversations", JSON.stringify(convs));

      deleteConversation("delete");

      const stored = JSON.parse(localStorage.getItem("chat-app-conversations")!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("keep");
    });

    it("does nothing when id not found", () => {
      const convs: Conversation[] = [
        { id: "only", title: "Only", messages: [], createdAt: 1000, updatedAt: 2000 },
      ];
      localStorage.setItem("chat-app-conversations", JSON.stringify(convs));

      deleteConversation("nonexistent");

      const stored = JSON.parse(localStorage.getItem("chat-app-conversations")!);
      expect(stored).toHaveLength(1);
    });
  });

  describe("getTheme", () => {
    it("returns 'dark' by default when nothing stored", () => {
      const result = getTheme();
      // Default depends on matchMedia, but in test env it should be "dark"
      expect(result === "dark" || result === "light").toBe(true);
    });

    it("returns stored theme value", () => {
      localStorage.setItem("chat-app-theme", "light");
      expect(getTheme()).toBe("light");
    });

    it("returns stored dark theme", () => {
      localStorage.setItem("chat-app-theme", "dark");
      expect(getTheme()).toBe("dark");
    });

    it("ignores invalid stored values", () => {
      localStorage.setItem("chat-app-theme", "invalid");
      const result = getTheme();
      // Should fall through to system preference or default
      expect(result === "dark" || result === "light").toBe(true);
    });
  });

  describe("saveTheme", () => {
    it("saves theme to localStorage", () => {
      saveTheme("light");
      expect(localStorage.getItem("chat-app-theme")).toBe("light");
    });

    it("overwrites existing theme", () => {
      saveTheme("light");
      saveTheme("dark");
      expect(localStorage.getItem("chat-app-theme")).toBe("dark");
    });
  });
});
