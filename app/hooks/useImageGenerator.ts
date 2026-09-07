"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Settings, ImageSettings, GeneratedImage, DEFAULT_IMAGE_SETTINGS } from "@/lib/types";
import {
  getImageSettingsFromDB,
  saveImageSettingsToDB,
} from "@/lib/user-settings-db";
import {
  getImagesFromDB,
  saveImageToDB,
  deleteImageFromDB,
  clearAllImagesFromDB,
} from "@/lib/image-gen-db";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const IMAGES_STORAGE_KEY = "chat-app-generated-images";
const IMAGE_SETTINGS_KEY = "chat-app-image-settings";

function getStoredImages(): GeneratedImage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(IMAGES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveStoredImages(images: GeneratedImage[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep only last 50 images to avoid localStorage limits
    const toSave = images.slice(0, 50);
    localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("Failed to save images:", e);
  }
}

export function getImageSettings(): ImageSettings {
  if (typeof window === "undefined") return DEFAULT_IMAGE_SETTINGS;
  try {
    const stored = localStorage.getItem(IMAGE_SETTINGS_KEY);
    return stored ? { ...DEFAULT_IMAGE_SETTINGS, ...JSON.parse(stored) } : DEFAULT_IMAGE_SETTINGS;
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

export function saveImageSettings(settings: ImageSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save image settings:", e);
  }
}

export function useImageGenerator(settings: Settings, options: { serverManaged?: boolean } = {}) {
  const { serverManaged = false } = options;
  const [imageSettings, setImageSettingsState] = useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight generation when the consumer unmounts so we don't
  // leak network requests or update state on a torn-down component.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Debounce DB writes for image settings (sliders/dropdowns can fire fast).
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSaveImageSettingsToDB = useCallback((s: ImageSettings) => {
    if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      void saveImageSettingsToDB(s).catch(() => {});
    }, 1500);
  }, []);

  // Load from localStorage first for instant paint, then DB merge for the
  // canonical history. DB wins on matching IDs across devices.
  const loadImageData = useCallback(() => {
    const images = getStoredImages();
    const imgSettings = getImageSettings();
    setGeneratedImages(images);
    setImageSettingsState(imgSettings);

    void (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const [dbImages, dbSettings] = await Promise.all([
          getImagesFromDB(),
          getImageSettingsFromDB(),
        ]);

        if (dbSettings) {
          setImageSettingsState((prev) => {
            const merged = { ...prev, ...dbSettings };
            saveImageSettings(merged);
            return merged;
          });
        }

        if (dbImages.length > 0) {
          // Merge: DB wins for matching IDs.
          const merged = new Map<string, GeneratedImage>();
          for (const img of images) merged.set(img.id, img);
          for (const img of dbImages) merged.set(img.id, img);
          const final = Array.from(merged.values()).sort(
            (a, b) => b.timestamp - a.timestamp
          );
          setGeneratedImages(final);
          saveStoredImages(final);
        }
      } catch (e) {
        console.error("[useImageGenerator] DB load failed:", e);
      }
    })();
  }, []);

  // Update image settings (mirror to localStorage + debounced DB write)
  const updateImageSettings = useCallback(
    (newSettings: Partial<ImageSettings>) => {
      setImageSettingsState((prev) => {
        const updated = { ...prev, ...newSettings };
        saveImageSettings(updated);
        debouncedSaveImageSettingsToDB(updated);
        return updated;
      });
    },
    [debouncedSaveImageSettingsToDB]
  );

  // Generate image
  const generateImage = useCallback(
    async (prompt: string, negativePrompt?: string) => {
      if (!prompt.trim()) {
        setError("Please enter a prompt.");
        return;
      }
      if (!serverManaged && (!settings.apiKey || !settings.baseUrl)) {
        setError("Please configure your API Key and Base URL in Settings.");
        return;
      }

      setError(null);
      setIsGenerating(true);
      setProgress("Generating image...");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const baseBody = {
          prompt: prompt.trim(),
          negativePrompt: negativePrompt?.trim() || undefined,
          model: imageSettings.model,
          size: imageSettings.size,
          quality: imageSettings.quality,
          style: imageSettings.style,
          n: imageSettings.n,
        };
        // Avoid sending apiKey/baseUrl to the edge proxy when the server is
        // managing credentials. Reduces the chance of leaking a stale local
        // key and keeps the wire payload minimal.
        const body = serverManaged
          ? baseBody
          : {
              ...baseBody,
              apiKey: settings.apiKey,
              baseUrl: settings.baseUrl,
            };

        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortController.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Generation failed (${response.status})`);
        }

        if (!data.images || data.images.length === 0) {
          throw new Error("No images were generated.");
        }

        // Create GeneratedImage entries
        const newImages: GeneratedImage[] = data.images.map((img: { url?: string; b64Data?: string }) => ({
          id: uuidv4(),
          prompt: prompt.trim(),
          negativePrompt: negativePrompt?.trim() || undefined,
          url: img.url || undefined,
          b64Data: img.b64Data || undefined,
          model: imageSettings.model,
          size: imageSettings.size,
          timestamp: Date.now(),
        }));

        setGeneratedImages((prev) => {
          const updated = [...newImages, ...prev];
          saveStoredImages(updated);
          return updated;
        });

        // Persist to DB (fire-and-forget per image so a single failure
        // doesn't block the others).
        for (const img of newImages) {
          void saveImageToDB(img).catch(() => {});
        }

        setProgress(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setProgress(null);
        } else {
          const message = err instanceof Error ? err.message : "Image generation failed";
          setError(message);
          setProgress(null);
        }
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [settings, imageSettings, serverManaged]
  );

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setProgress(null);
    }
  }, []);

  // Delete a generated image
  const deleteImage = useCallback((id: string) => {
    setGeneratedImages((prev) => {
      const updated = prev.filter((img) => img.id !== id);
      saveStoredImages(updated);
      return updated;
    });
    void deleteImageFromDB(id).catch(() => {});
  }, []);

  // Clear all images
  const clearAllImages = useCallback(() => {
    setGeneratedImages([]);
    saveStoredImages([]);
    void clearAllImagesFromDB().catch(() => {});
  }, []);

  return {
    imageSettings,
    updateImageSettings,
    generatedImages,
    isGenerating,
    error,
    progress,
    loadImageData,
    generateImage,
    stopGeneration,
    deleteImage,
    clearAllImages,
    setError,
  };
}
