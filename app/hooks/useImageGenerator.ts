"use client";

import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { Settings, ImageSettings, GeneratedImage, DEFAULT_IMAGE_SETTINGS } from "@/lib/types";

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

export function useImageGenerator(settings: Settings) {
  const [imageSettings, setImageSettingsState] = useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load from localStorage
  const loadImageData = useCallback(() => {
    const images = getStoredImages();
    const imgSettings = getImageSettings();
    setGeneratedImages(images);
    setImageSettingsState(imgSettings);
  }, []);

  // Update image settings
  const updateImageSettings = useCallback((newSettings: Partial<ImageSettings>) => {
    setImageSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      saveImageSettings(updated);
      return updated;
    });
  }, []);

  // Generate image
  const generateImage = useCallback(
    async (prompt: string, negativePrompt?: string) => {
      if (!prompt.trim()) {
        setError("Please enter a prompt.");
        return;
      }
      if (!settings.apiKey || !settings.baseUrl) {
        setError("Please configure your API Key and Base URL in Settings.");
        return;
      }

      setError(null);
      setIsGenerating(true);
      setProgress("Generating image...");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            negativePrompt: negativePrompt?.trim() || undefined,
            model: imageSettings.model,
            size: imageSettings.size,
            quality: imageSettings.quality,
            style: imageSettings.style,
            n: imageSettings.n,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
          }),
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
        const newImages: GeneratedImage[] = data.images.map((img: any) => ({
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
    [settings, imageSettings]
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
  }, []);

  // Clear all images
  const clearAllImages = useCallback(() => {
    setGeneratedImages([]);
    saveStoredImages([]);
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
