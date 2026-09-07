import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "img-uuid-" + Math.random().toString(36).slice(2, 8)),
}));

// Mock supabase
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
    },
  }),
}));

// Mock user-settings-db
vi.mock("@/lib/user-settings-db", () => ({
  getImageSettingsFromDB: vi.fn(() => Promise.resolve(null)),
  saveImageSettingsToDB: vi.fn(() => Promise.resolve()),
}));

// Mock image-gen-db
vi.mock("@/lib/image-gen-db", () => ({
  getImagesFromDB: vi.fn(() => Promise.resolve([])),
  saveImageToDB: vi.fn(() => Promise.resolve()),
  deleteImageFromDB: vi.fn(() => Promise.resolve()),
  clearAllImagesFromDB: vi.fn(() => Promise.resolve()),
}));

import { useImageGenerator } from "@/hooks/useImageGenerator";
import { deleteImageFromDB, clearAllImagesFromDB } from "@/lib/image-gen-db";
import type { Settings } from "@/lib/types";

const mockSettings: Settings = {
  apiKey: "test-key",
  baseUrl: "https://api.test.com",
  model: "kr/claude-opus-4.6",
  temperature: 0.7,
  maxTokens: 16384,
  systemPrompt: "",
};

describe("useImageGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it("initializes with default image settings", () => {
    const { result } = renderHook(() => useImageGenerator(mockSettings));

    expect(result.current.imageSettings.model).toBe("gpt-image-1");
    expect(result.current.imageSettings.size).toBe("1024x1024");
    expect(result.current.imageSettings.quality).toBe("standard");
    expect(result.current.imageSettings.style).toBe("natural");
    expect(result.current.imageSettings.n).toBe(1);
  });

  it("initializes with empty generated images", () => {
    const { result } = renderHook(() => useImageGenerator(mockSettings));

    expect(result.current.generatedImages).toEqual([]);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
  });

  it("loadImageData reads images from localStorage", () => {
    const storedImages = [
      {
        id: "img-1",
        prompt: "A cat",
        url: "https://example.com/cat.png",
        model: "gpt-image-1",
        size: "1024x1024",
        timestamp: Date.now(),
      },
    ];
    localStorage.setItem(
      "chat-app-generated-images",
      JSON.stringify(storedImages)
    );

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    act(() => {
      result.current.loadImageData();
    });

    expect(result.current.generatedImages).toHaveLength(1);
    expect(result.current.generatedImages[0].prompt).toBe("A cat");
  });

  it("loadImageData reads image settings from localStorage", () => {
    const storedSettings = {
      model: "dall-e-3",
      size: "1792x1024",
      quality: "hd",
      style: "vivid",
      n: 2,
    };
    localStorage.setItem(
      "chat-app-image-settings",
      JSON.stringify(storedSettings)
    );

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    act(() => {
      result.current.loadImageData();
    });

    expect(result.current.imageSettings.model).toBe("dall-e-3");
    expect(result.current.imageSettings.size).toBe("1792x1024");
    expect(result.current.imageSettings.quality).toBe("hd");
  });

  it("updateImageSettings merges and persists settings", () => {
    const { result } = renderHook(() => useImageGenerator(mockSettings));

    act(() => {
      result.current.updateImageSettings({ size: "1792x1024", quality: "hd" });
    });

    expect(result.current.imageSettings.size).toBe("1792x1024");
    expect(result.current.imageSettings.quality).toBe("hd");
    // Other settings remain default
    expect(result.current.imageSettings.model).toBe("gpt-image-1");

    // Check localStorage was updated
    const stored = JSON.parse(
      localStorage.getItem("chat-app-image-settings") || "{}"
    );
    expect(stored.size).toBe("1792x1024");
  });

  it("generateImage sets error when prompt is empty", async () => {
    const { result } = renderHook(() => useImageGenerator(mockSettings));

    await act(async () => {
      await result.current.generateImage("");
    });

    expect(result.current.error).toBe("Please enter a prompt.");
    expect(result.current.isGenerating).toBe(false);
  });

  it("generateImage sets error when API credentials are missing", async () => {
    const noCredsSettings: Settings = {
      ...mockSettings,
      apiKey: "",
      baseUrl: "",
    };

    const { result } = renderHook(() => useImageGenerator(noCredsSettings));

    await act(async () => {
      await result.current.generateImage("A beautiful sunset");
    });

    expect(result.current.error).toBe(
      "Please configure your API Key and Base URL in Settings."
    );
  });

  it("generateImage calls /api/image and stores result", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          images: [{ url: "https://example.com/generated.png" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    await act(async () => {
      await result.current.generateImage("A beautiful sunset");
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/image",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(result.current.generatedImages).toHaveLength(1);
    expect(result.current.generatedImages[0].prompt).toBe("A beautiful sunset");
    expect(result.current.generatedImages[0].url).toBe(
      "https://example.com/generated.png"
    );
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
  });

  it("generateImage handles API error response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Model overloaded" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    );

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    await act(async () => {
      await result.current.generateImage("A cat");
    });

    expect(result.current.error).toBe("Model overloaded");
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generatedImages).toHaveLength(0);
  });

  it("generateImage handles empty images array in response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ images: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    await act(async () => {
      await result.current.generateImage("A cat");
    });

    expect(result.current.error).toBe("No images were generated.");
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

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    // Start generation (don't await)
    act(() => {
      result.current.generateImage("A cat");
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.stopGeneration();
    });

    expect(mockAbort).toHaveBeenCalled();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.progress).toBeNull();

    global.AbortController = originalAbortController;
  });

  it("deleteImage removes an image by ID", () => {
    const { result } = renderHook(() => useImageGenerator(mockSettings));

    // Manually set some images
    const storedImages = [
      {
        id: "img-1",
        prompt: "Cat",
        url: "https://example.com/cat.png",
        model: "gpt-image-1",
        size: "1024x1024",
        timestamp: Date.now(),
      },
      {
        id: "img-2",
        prompt: "Dog",
        url: "https://example.com/dog.png",
        model: "gpt-image-1",
        size: "1024x1024",
        timestamp: Date.now(),
      },
    ];
    localStorage.setItem(
      "chat-app-generated-images",
      JSON.stringify(storedImages)
    );

    act(() => {
      result.current.loadImageData();
    });

    expect(result.current.generatedImages).toHaveLength(2);

    act(() => {
      result.current.deleteImage("img-1");
    });

    expect(result.current.generatedImages).toHaveLength(1);
    expect(result.current.generatedImages[0].id).toBe("img-2");
    expect(deleteImageFromDB).toHaveBeenCalledWith("img-1");
  });

  it("clearAllImages removes all images", () => {
    const { result } = renderHook(() => useImageGenerator(mockSettings));

    const storedImages = [
      {
        id: "img-1",
        prompt: "Cat",
        url: "https://example.com/cat.png",
        model: "gpt-image-1",
        size: "1024x1024",
        timestamp: Date.now(),
      },
    ];
    localStorage.setItem(
      "chat-app-generated-images",
      JSON.stringify(storedImages)
    );

    act(() => {
      result.current.loadImageData();
    });

    expect(result.current.generatedImages).toHaveLength(1);

    act(() => {
      result.current.clearAllImages();
    });

    expect(result.current.generatedImages).toHaveLength(0);
    expect(clearAllImagesFromDB).toHaveBeenCalled();
  });

  it("generateImage sends correct body parameters", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          images: [{ url: "https://example.com/img.png" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const { result } = renderHook(() => useImageGenerator(mockSettings));

    act(() => {
      result.current.updateImageSettings({
        model: "dall-e-3",
        size: "1792x1024",
        quality: "hd",
      });
    });

    await act(async () => {
      await result.current.generateImage("A sunset", "No clouds");
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);

    expect(body.prompt).toBe("A sunset");
    expect(body.negativePrompt).toBe("No clouds");
    expect(body.model).toBe("dall-e-3");
    expect(body.size).toBe("1792x1024");
    expect(body.quality).toBe("hd");
    expect(body.apiKey).toBe("test-key");
    expect(body.baseUrl).toBe("https://api.test.com");
  });
});
