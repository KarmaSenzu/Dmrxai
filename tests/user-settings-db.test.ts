import { describe, it, expect, vi, beforeEach } from "vitest";

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
  getUserSettingsFromDB,
  saveUserSettingsToDB,
  saveThemeToDB,
  getThemeFromDB,
  saveImageSettingsToDB,
  getImageSettingsFromDB,
} from "@/lib/user-settings-db";

describe("user-settings-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "test-user-123" } } });
  });

  describe("getUserSettingsFromDB", () => {
    it("returns null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const result = await getUserSettingsFromDB();
      expect(result).toBeNull();
    });

    it("returns null on query error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
      });
      const result = await getUserSettingsFromDB();
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("returns null when no settings row exists", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });
      const result = await getUserSettingsFromDB();
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("maps DB row to Settings shape correctly", async () => {
      const dbRow = {
        user_id: "test-user-123",
        model: "gpt-4o",
        temperature: 0.8,
        max_tokens: 4096,
        system_prompt: "You are helpful",
        theme: "dark",
        image_settings: {},
        preferences: { customField: "value" },
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: dbRow, error: null }),
          }),
        }),
      });

      const result = await getUserSettingsFromDB();
      expect(result).not.toBeNull();
      expect(result!.model).toBe("gpt-4o");
      expect(result!.temperature).toBe(0.8);
      expect(result!.maxTokens).toBe(4096);
      expect(result!.systemPrompt).toBe("You are helpful");
    });

    it("merges preferences into result", async () => {
      const dbRow = {
        user_id: "test-user-123",
        model: null,
        temperature: 0.7,
        max_tokens: 8192,
        system_prompt: "",
        theme: "dark",
        image_settings: {},
        preferences: { someCustomPref: true },
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: dbRow, error: null }),
          }),
        }),
      });

      const result = await getUserSettingsFromDB();
      expect((result as Record<string, unknown>).someCustomPref).toBe(true);
    });

    it("handles null preferences gracefully", async () => {
      const dbRow = {
        user_id: "test-user-123",
        model: "claude-3",
        temperature: 0.5,
        max_tokens: 2048,
        system_prompt: "test",
        theme: "light",
        image_settings: {},
        preferences: null,
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: dbRow, error: null }),
          }),
        }),
      });

      const result = await getUserSettingsFromDB();
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-3");
    });
  });

  describe("saveUserSettingsToDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await saveUserSettingsToDB({ model: "gpt-4o" });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("upserts settings with correct columns", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await saveUserSettingsToDB({
        model: "gpt-4o",
        temperature: 0.9,
        maxTokens: 4096,
        systemPrompt: "Be concise",
      });

      expect(mockFrom).toHaveBeenCalledWith("user_settings");
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.model).toBe("gpt-4o");
      expect(upsertArg.temperature).toBe(0.9);
      expect(upsertArg.max_tokens).toBe(4096);
      expect(upsertArg.system_prompt).toBe("Be concise");
      expect(upsertArg.user_id).toBe("test-user-123");
    });

    it("strips apiKey and baseUrl from settings", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await saveUserSettingsToDB({
        model: "gpt-4o",
        apiKey: "sk-secret",
        baseUrl: "https://api.example.com",
      } as any);

      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.apiKey).toBeUndefined();
      expect(upsertArg.baseUrl).toBeUndefined();
    });

    it("stores unknown fields in preferences", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await saveUserSettingsToDB({
        model: "gpt-4o",
        customField: "custom-value",
      } as any);

      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.preferences).toEqual({ customField: "custom-value" });
    });

    it("handles save error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: "save failed" } }),
      });

      await saveUserSettingsToDB({ model: "gpt-4o" });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("saveThemeToDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await saveThemeToDB("dark");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("upserts theme correctly", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await saveThemeToDB("light");
      expect(mockFrom).toHaveBeenCalledWith("user_settings");
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.theme).toBe("light");
      expect(upsertArg.user_id).toBe("test-user-123");
    });

    it("handles error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: "theme save failed" } }),
      });

      await saveThemeToDB("dark");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("getThemeFromDB", () => {
    it("returns null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const result = await getThemeFromDB();
      expect(result).toBeNull();
    });

    it("returns theme value when found", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { theme: "light" }, error: null }),
          }),
        }),
      });

      const result = await getThemeFromDB();
      expect(result).toBe("light");
    });

    it("returns null on error", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "err" } }),
          }),
        }),
      });

      const result = await getThemeFromDB();
      expect(result).toBeNull();
    });

    it("returns null for invalid theme value", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { theme: "invalid" }, error: null }),
          }),
        }),
      });

      const result = await getThemeFromDB();
      expect(result).toBeNull();
    });
  });

  describe("saveImageSettingsToDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await saveImageSettingsToDB({ model: "dall-e-3" });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("upserts image settings correctly", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      await saveImageSettingsToDB({ model: "dall-e-3", size: "1024x1024" });
      expect(mockFrom).toHaveBeenCalledWith("user_settings");
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.image_settings).toEqual({ model: "dall-e-3", size: "1024x1024" });
      expect(upsertArg.user_id).toBe("test-user-123");
    });
  });

  describe("getImageSettingsFromDB", () => {
    it("returns null when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const result = await getImageSettingsFromDB();
      expect(result).toBeNull();
    });

    it("returns image settings when found", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { image_settings: { model: "dall-e-3", size: "512x512" } },
              error: null,
            }),
          }),
        }),
      });

      const result = await getImageSettingsFromDB();
      expect(result).toEqual({ model: "dall-e-3", size: "512x512" });
    });

    it("returns null on error", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "err" } }),
          }),
        }),
      });

      const result = await getImageSettingsFromDB();
      expect(result).toBeNull();
    });

    it("returns null when image_settings is null", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { image_settings: null },
              error: null,
            }),
          }),
        }),
      });

      const result = await getImageSettingsFromDB();
      expect(result).toBeNull();
    });
  });
});
