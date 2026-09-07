import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();
const mockSupabaseBrowser = {
  auth: { getUser: mockGetUser },
};

vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => mockSupabaseBrowser,
}));

const mockGetConversations = vi.fn();
vi.mock("@/lib/storage", () => ({
  getConversations: () => mockGetConversations(),
}));

const mockSaveConversationToDB = vi.fn();
vi.mock("@/lib/chat-db", () => ({
  saveConversationToDB: (...args: unknown[]) => mockSaveConversationToDB(...args),
}));

const mockSaveImageToDB = vi.fn();
vi.mock("@/lib/image-gen-db", () => ({
  saveImageToDB: (...args: unknown[]) => mockSaveImageToDB(...args),
}));

const mockSaveUserSettingsToDB = vi.fn();
const mockSaveImageSettingsToDB = vi.fn();
vi.mock("@/lib/user-settings-db", () => ({
  saveUserSettingsToDB: (...args: unknown[]) => mockSaveUserSettingsToDB(...args),
  saveImageSettingsToDB: (...args: unknown[]) => mockSaveImageSettingsToDB(...args),
}));

const mockGetProjects = vi.fn();
const mockGetProjectData = vi.fn();
const mockSyncProjectToDB = vi.fn();
vi.mock("@/lib/builder-storage", () => ({
  getProjects: () => mockGetProjects(),
  getProjectData: (id: string) => mockGetProjectData(id),
  syncProjectToDB: (...args: unknown[]) => mockSyncProjectToDB(...args),
}));

import { migrateLocalStorageToDB, resetMigrationFlag } from "@/lib/migrate-local";

describe("migrate-local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mockGetConversations.mockReturnValue([]);
    mockGetProjects.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("migrateLocalStorageToDB", () => {
    it("returns skipped when already migrated for user", async () => {
      localStorage.setItem("dmrxai:migrated_v1:user-123", "true");

      const stats = await migrateLocalStorageToDB();

      expect(stats.skipped).toBe(true);
      expect(stats.conversationsMigrated).toBe(0);
    });

    it("returns error when no authenticated user", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const stats = await migrateLocalStorageToDB();

      expect(stats.errors).toContain("No authed user");
      expect(stats.skipped).toBe(false);
    });

    it("migrates conversations successfully", async () => {
      const conversations = [
        { id: "conv-1", messages: [] },
        { id: "conv-2", messages: [] },
      ];
      mockGetConversations.mockReturnValue(conversations);
      mockSaveConversationToDB.mockResolvedValue(undefined);

      const stats = await migrateLocalStorageToDB();

      expect(stats.conversationsMigrated).toBe(2);
      expect(mockSaveConversationToDB).toHaveBeenCalledTimes(2);
    });

    it("records error for failed conversation migration", async () => {
      const conversations = [{ id: "conv-1", messages: [] }];
      mockGetConversations.mockReturnValue(conversations);
      mockSaveConversationToDB.mockRejectedValue(new Error("DB error"));

      const stats = await migrateLocalStorageToDB();

      expect(stats.conversationsMigrated).toBe(0);
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0]).toContain("conv conv-1");
      expect(stats.errors[0]).toContain("DB error");
    });

    it("records error when getConversations throws", async () => {
      mockGetConversations.mockImplementation(() => {
        throw new Error("Parse error");
      });

      const stats = await migrateLocalStorageToDB();

      expect(stats.errors[0]).toContain("Load conversations failed");
    });

    it("migrates builder projects successfully", async () => {
      const projects = [{ id: "proj-1" }, { id: "proj-2" }];
      mockGetProjects.mockReturnValue(projects);
      mockGetProjectData.mockReturnValue({
        project: { id: "proj-1", title: "Test" },
        messages: [],
        files: {},
      });
      mockSyncProjectToDB.mockResolvedValue(undefined);

      const stats = await migrateLocalStorageToDB();

      expect(stats.builderProjectsMigrated).toBe(2);
    });

    it("skips project when getProjectData returns null", async () => {
      const projects = [{ id: "proj-1" }];
      mockGetProjects.mockReturnValue(projects);
      mockGetProjectData.mockReturnValue(null);

      const stats = await migrateLocalStorageToDB();

      expect(stats.builderProjectsMigrated).toBe(0);
      expect(mockSyncProjectToDB).not.toHaveBeenCalled();
    });

    it("records error for failed project migration", async () => {
      const projects = [{ id: "proj-1" }];
      mockGetProjects.mockReturnValue(projects);
      mockGetProjectData.mockReturnValue({
        project: { id: "proj-1" },
        messages: [],
        files: {},
      });
      mockSyncProjectToDB.mockRejectedValue(new Error("Sync failed"));

      const stats = await migrateLocalStorageToDB();

      expect(stats.builderProjectsMigrated).toBe(0);
      expect(stats.errors[0]).toContain("project proj-1");
    });

    it("migrates generated images from localStorage", async () => {
      const images = [
        { id: "img-1", prompt: "p1", url: "https://example.com/1.png" },
        { id: "img-2", prompt: "p2", url: "https://example.com/2.png" },
      ];
      localStorage.setItem("chat-app-generated-images", JSON.stringify(images));
      mockSaveImageToDB.mockResolvedValue(undefined);

      const stats = await migrateLocalStorageToDB();

      expect(stats.imagesMigrated).toBe(2);
      expect(mockSaveImageToDB).toHaveBeenCalledTimes(2);
    });

    it("records error for failed image migration", async () => {
      const images = [{ id: "img-1", prompt: "p1", url: "https://example.com/1.png" }];
      localStorage.setItem("chat-app-generated-images", JSON.stringify(images));
      mockSaveImageToDB.mockRejectedValue(new Error("Image save failed"));

      const stats = await migrateLocalStorageToDB();

      expect(stats.imagesMigrated).toBe(0);
      expect(stats.errors[0]).toContain("image img-1");
    });

    it("migrates user settings from localStorage", async () => {
      const settings = { theme: "dark", model: "gpt-4" };
      localStorage.setItem("chat-app-settings", JSON.stringify(settings));
      mockSaveUserSettingsToDB.mockResolvedValue(undefined);

      const stats = await migrateLocalStorageToDB();

      expect(stats.settingsMigrated).toBe(true);
      expect(mockSaveUserSettingsToDB).toHaveBeenCalledWith(settings);
    });

    it("migrates image settings from localStorage", async () => {
      const imageSettings = { size: "1024x1024", quality: "hd" };
      localStorage.setItem("chat-app-image-settings", JSON.stringify(imageSettings));
      mockSaveImageSettingsToDB.mockResolvedValue(undefined);

      const stats = await migrateLocalStorageToDB();

      expect(stats.imageSettingsMigrated).toBe(true);
      expect(mockSaveImageSettingsToDB).toHaveBeenCalledWith(imageSettings);
    });

    it("records error when settings migration fails", async () => {
      localStorage.setItem("chat-app-settings", JSON.stringify({ theme: "dark" }));
      mockSaveUserSettingsToDB.mockRejectedValue(new Error("Settings save failed"));

      const stats = await migrateLocalStorageToDB();

      expect(stats.settingsMigrated).toBe(false);
      expect(stats.errors[0]).toContain("Settings migration failed");
    });

    it("records error when image settings migration fails", async () => {
      localStorage.setItem("chat-app-image-settings", JSON.stringify({ size: "512" }));
      mockSaveImageSettingsToDB.mockRejectedValue(new Error("Image settings failed"));

      const stats = await migrateLocalStorageToDB();

      expect(stats.imageSettingsMigrated).toBe(false);
      expect(stats.errors[0]).toContain("Image settings migration failed");
    });

    it("sets migration flag after completion", async () => {
      const stats = await migrateLocalStorageToDB();

      expect(stats.skipped).toBe(false);
      expect(localStorage.getItem("dmrxai:migrated_v1:user-123")).toBe("true");
      expect(localStorage.getItem("dmrxai:migrated_v1:user-123:at")).toBeTruthy();
    });

    it("sets migration flag even when some steps have errors", async () => {
      mockGetConversations.mockImplementation(() => {
        throw new Error("fail");
      });

      await migrateLocalStorageToDB();

      expect(localStorage.getItem("dmrxai:migrated_v1:user-123")).toBe("true");
    });

    it("does not migrate images when localStorage key is missing", async () => {
      const stats = await migrateLocalStorageToDB();

      expect(stats.imagesMigrated).toBe(0);
      expect(mockSaveImageToDB).not.toHaveBeenCalled();
    });
  });

  describe("resetMigrationFlag", () => {
    it("removes migration flag for current user", async () => {
      localStorage.setItem("dmrxai:migrated_v1:user-123", "true");
      localStorage.setItem("dmrxai:migrated_v1:user-123:at", "2024-01-01");

      await resetMigrationFlag();

      expect(localStorage.getItem("dmrxai:migrated_v1:user-123")).toBeNull();
      expect(localStorage.getItem("dmrxai:migrated_v1:user-123:at")).toBeNull();
    });

    it("does nothing when no user is authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      localStorage.setItem("dmrxai:migrated_v1:user-123", "true");

      await resetMigrationFlag();

      // Flag should remain since we couldn't identify the user
      expect(localStorage.getItem("dmrxai:migrated_v1:user-123")).toBe("true");
    });
  });
});
