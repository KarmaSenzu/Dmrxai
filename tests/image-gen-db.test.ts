import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeneratedImage } from "@/lib/types";

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
  getImagesFromDB,
  saveImageToDB,
  deleteImageFromDB,
  clearAllImagesFromDB,
} from "@/lib/image-gen-db";

describe("image-gen-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "test-user-123" } } });
  });

  describe("getImagesFromDB", () => {
    it("returns empty array when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const result = await getImagesFromDB();
      expect(result).toEqual([]);
    });

    it("returns empty array on query error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
            }),
          }),
        }),
      });
      const result = await getImagesFromDB();
      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });

    it("returns mapped images on success", async () => {
      const dbData = [
        {
          id: "img-1",
          user_id: "test-user-123",
          prompt: "a cat",
          negative_prompt: "blurry",
          model: "dall-e-3",
          image_url: "https://example.com/cat.png",
          thumbnail_url: null,
          width: 1024,
          height: 1024,
          metadata: { size: "1024x1024" },
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
            }),
          }),
        }),
      });

      const result = await getImagesFromDB();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("img-1");
      expect(result[0].prompt).toBe("a cat");
      expect(result[0].negativePrompt).toBe("blurry");
      expect(result[0].model).toBe("dall-e-3");
      expect(result[0].url).toBe("https://example.com/cat.png");
      expect(result[0].size).toBe("1024x1024");
    });

    it("uses width x height when metadata.size is missing", async () => {
      const dbData = [
        {
          id: "img-2",
          user_id: "test-user-123",
          prompt: "a dog",
          negative_prompt: null,
          model: "dall-e-3",
          image_url: "https://example.com/dog.png",
          thumbnail_url: null,
          width: 512,
          height: 768,
          metadata: {},
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
            }),
          }),
        }),
      });

      const result = await getImagesFromDB();
      expect(result[0].size).toBe("512x768");
    });

    it("defaults to 1024x1024 when no size info available", async () => {
      const dbData = [
        {
          id: "img-3",
          user_id: "test-user-123",
          prompt: "abstract",
          negative_prompt: null,
          model: null,
          image_url: null,
          thumbnail_url: null,
          width: null,
          height: null,
          metadata: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
            }),
          }),
        }),
      });

      const result = await getImagesFromDB();
      expect(result[0].size).toBe("1024x1024");
    });

    it("extracts b64Data from metadata", async () => {
      const dbData = [
        {
          id: "img-4",
          user_id: "test-user-123",
          prompt: "pixel art",
          negative_prompt: null,
          model: "dall-e-2",
          image_url: null,
          thumbnail_url: null,
          width: 256,
          height: 256,
          metadata: { size: "256x256", b64Data: "base64encodedstring" },
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: dbData, error: null }),
            }),
          }),
        }),
      });

      const result = await getImagesFromDB();
      expect(result[0].b64Data).toBe("base64encodedstring");
    });
  });

  describe("saveImageToDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const image: GeneratedImage = {
        id: "img-1",
        prompt: "test",
        model: "dall-e-3",
        size: "1024x1024",
        timestamp: Date.now(),
      };
      await saveImageToDB(image);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("upserts image with correct data", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const image: GeneratedImage = {
        id: "img-1",
        prompt: "a beautiful sunset",
        negativePrompt: "dark",
        url: "https://example.com/sunset.png",
        model: "dall-e-3",
        size: "1024x1024",
        timestamp: 1704067200000,
      };

      await saveImageToDB(image);
      expect(mockFrom).toHaveBeenCalledWith("image_generations");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "img-1",
          user_id: "test-user-123",
          prompt: "a beautiful sunset",
          negative_prompt: "dark",
          model: "dall-e-3",
          image_url: "https://example.com/sunset.png",
          width: 1024,
          height: 1024,
        }),
        { onConflict: "id" }
      );
    });

    it("stores b64Data in metadata", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const image: GeneratedImage = {
        id: "img-2",
        prompt: "test",
        b64Data: "base64data",
        model: "dall-e-2",
        size: "512x512",
        timestamp: Date.now(),
      };

      await saveImageToDB(image);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.metadata.b64Data).toBe("base64data");
      expect(upsertArg.metadata.size).toBe("512x512");
    });

    it("handles save error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: "save failed" } }),
      });

      const image: GeneratedImage = {
        id: "img-1",
        prompt: "test",
        model: "dall-e-3",
        size: "1024x1024",
        timestamp: Date.now(),
      };

      await saveImageToDB(image);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("parses non-standard size as null width/height", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const image: GeneratedImage = {
        id: "img-3",
        prompt: "test",
        model: "dall-e-3",
        size: "custom",
        timestamp: Date.now(),
      };

      await saveImageToDB(image);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg.width).toBeNull();
      expect(upsertArg.height).toBeNull();
    });
  });

  describe("deleteImageFromDB", () => {
    it("scopes delete by id and user_id", async () => {
      const eqUser = vi.fn().mockResolvedValue({ error: null });
      const eqId = vi.fn().mockReturnValue({ eq: eqUser });
      const mockDeleteFn = vi.fn().mockReturnValue({ eq: eqId });
      mockFrom.mockReturnValue({ delete: mockDeleteFn });

      await deleteImageFromDB("img-123");
      expect(mockFrom).toHaveBeenCalledWith("image_generations");
      expect(eqId).toHaveBeenCalledWith("id", "img-123");
      expect(eqUser).toHaveBeenCalledWith("user_id", "test-user-123");
    });

    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await deleteImageFromDB("img-123");
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("handles delete error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const eqUser = vi
        .fn()
        .mockResolvedValue({ error: { message: "delete failed" } });
      const eqId = vi.fn().mockReturnValue({ eq: eqUser });
      mockFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqId }) });

      await deleteImageFromDB("img-123");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("clearAllImagesFromDB", () => {
    it("does nothing when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      await clearAllImagesFromDB();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("deletes all images for the user", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDeleteFn = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ delete: mockDeleteFn });

      await clearAllImagesFromDB();
      expect(mockFrom).toHaveBeenCalledWith("image_generations");
      expect(mockEq).toHaveBeenCalledWith("user_id", "test-user-123");
    });

    it("handles clear error gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockEq = vi.fn().mockResolvedValue({ error: { message: "clear failed" } });
      mockFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: mockEq }) });

      await clearAllImagesFromDB();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
