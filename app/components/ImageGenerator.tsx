"use client";

import { useState } from "react";
import {
  ImageSettings,
  GeneratedImage,
  IMAGE_SIZES,
  IMAGE_QUALITIES,
  IMAGE_STYLES,
  IMAGE_MODELS,
} from "@/lib/types";
import {
  Image as ImageIcon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  Loader2,
  Square,
  Settings,
  X,
  AlertCircle,
  Eraser,
} from "lucide-react";

interface ImageGeneratorProps {
  imageSettings: ImageSettings;
  onUpdateSettings: (settings: Partial<ImageSettings>) => void;
  generatedImages: GeneratedImage[];
  isGenerating: boolean;
  error: string | null;
  progress: string | null;
  onGenerate: (prompt: string, negativePrompt?: string) => void;
  onStop: () => void;
  onDeleteImage: (id: string) => void;
  onClearAll: () => void;
  onDismissError: () => void;
  isConfigured: boolean;
  onOpenSettings: () => void;
  fetchedModels: string[];
}

export default function ImageGenerator({
  imageSettings,
  onUpdateSettings,
  generatedImages,
  isGenerating,
  error,
  progress,
  onGenerate,
  onStop,
  onDeleteImage,
  onClearAll,
  onDismissError,
  isConfigured,
  onOpenSettings,
  fetchedModels,
}: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  // Combine hardcoded image models with any fetched models that look like image models
  const imageModelsList = [
    ...IMAGE_MODELS,
    ...fetchedModels.filter(
      (m) =>
        (m.includes("dall-e") || m.includes("image") || m.includes("stable") || m.includes("sdxl") || m.includes("flux")) &&
        !IMAGE_MODELS.includes(m)
    ),
  ];

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    onGenerate(prompt, negativePrompt || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleDownload = (image: GeneratedImage) => {
    if (image.b64Data) {
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${image.b64Data}`;
      link.download = `dmrxai-${image.id.slice(0, 8)}.png`;
      link.click();
    } else if (image.url) {
      window.open(image.url, "_blank");
    }
  };

  const getImageSrc = (image: GeneratedImage) => {
    if (image.b64Data) return `data:image/png;base64,${image.b64Data}`;
    if (image.url) return image.url;
    return "";
  };

  // Not configured state
  if (!isConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-light-input dark:bg-dark-input flex items-center justify-center">
            <ImageIcon size={32} className="text-light-muted dark:text-dark-muted" />
          </div>
          <h2 className="text-2xl font-bold text-light-text dark:text-dark-text mb-3">
            Image Generator
          </h2>
          <p className="text-light-muted dark:text-dark-muted mb-6">
            Configure your API settings to start generating images with AI.
          </p>
          <button
            onClick={onOpenSettings}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-light-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
          >
            <Settings size={18} />
            <span>Configure API Settings</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Panel - Controls */}
      <div className="lg:w-96 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-light-border dark:border-dark-border overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Image Generator</h2>
              <p className="text-xs text-light-muted dark:text-dark-muted">Create images with AI</p>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
              Model
            </label>
            <select
              value={imageSettings.model}
              onChange={(e) => onUpdateSettings({ model: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:border-light-accent dark:focus:border-dark-accent transition-colors text-sm"
            >
              {imageModelsList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the image you want to generate..."
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text placeholder-light-muted dark:placeholder-dark-muted focus:outline-none focus:border-light-accent dark:focus:border-dark-accent transition-colors resize-none text-sm"
            />
            <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
              Ctrl+Enter to generate
            </p>
          </div>

          {/* Negative Prompt Toggle */}
          <div>
            <button
              onClick={() => setShowNegativePrompt(!showNegativePrompt)}
              className="flex items-center gap-2 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
            >
              {showNegativePrompt ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>Negative prompt</span>
            </button>
            {showNegativePrompt && (
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid in the image..."
                rows={2}
                className="w-full mt-2 px-3 py-2.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text placeholder-light-muted dark:placeholder-dark-muted focus:outline-none focus:border-light-accent dark:focus:border-dark-accent transition-colors resize-none text-sm"
              />
            )}
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-5 gap-2">
              {IMAGE_SIZES.map((size) => (
                <button
                  key={size.value}
                  onClick={() => onUpdateSettings({ size: size.value })}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs transition-colors ${
                    imageSettings.size === size.value
                      ? "border-light-accent dark:border-dark-accent bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent"
                      : "border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted hover:border-light-accent/50 dark:hover:border-dark-accent/50"
                  }`}
                >
                  <span className="font-semibold">{size.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>Advanced settings</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4">
                {/* Quality */}
                <div>
                  <label className="block text-xs font-medium text-light-text dark:text-dark-text mb-1.5">
                    Quality
                  </label>
                  <div className="flex gap-2">
                    {IMAGE_QUALITIES.map((q) => (
                      <button
                        key={q}
                        onClick={() => onUpdateSettings({ quality: q })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                          imageSettings.quality === q
                            ? "border-light-accent dark:border-dark-accent bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent"
                            : "border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted hover:border-light-accent/50 dark:hover:border-dark-accent/50"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Style */}
                <div>
                  <label className="block text-xs font-medium text-light-text dark:text-dark-text mb-1.5">
                    Style
                  </label>
                  <div className="flex gap-2">
                    {IMAGE_STYLES.map((s) => (
                      <button
                        key={s}
                        onClick={() => onUpdateSettings({ style: s })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                          imageSettings.style === s
                            ? "border-light-accent dark:border-dark-accent bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent"
                            : "border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted hover:border-light-accent/50 dark:hover:border-dark-accent/50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Number of images */}
                <div>
                  <label className="block text-xs font-medium text-light-text dark:text-dark-text mb-1.5">
                    Number of images
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => onUpdateSettings({ n })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          imageSettings.n === n
                            ? "border-light-accent dark:border-dark-accent bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent"
                            : "border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted hover:border-light-accent/50 dark:hover:border-dark-accent/50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={onDismissError} className="flex-shrink-0 hover:text-red-400">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Generate Button */}
          <div>
            {isGenerating ? (
              <button
                onClick={onStop}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
              >
                <Square size={16} fill="currentColor" />
                <span>Stop Generating</span>
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Sparkles size={16} />
                <span>Generate</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Gallery */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-light-bg dark:bg-dark-bg">
        {/* Gallery Header */}
        {generatedImages.length > 0 && (
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-sm border-b border-light-border dark:border-dark-border">
            <span className="text-sm text-light-muted dark:text-dark-muted">
              {generatedImages.length} image{generatedImages.length !== 1 ? "s" : ""} generated
            </span>
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 text-xs text-light-muted dark:text-dark-muted hover:text-red-500 transition-colors"
            >
              <Eraser size={12} />
              <span>Clear all</span>
            </button>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && progress && (
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-light-sidebar dark:bg-dark-sidebar border border-light-border dark:border-dark-border">
              <Loader2 size={20} className="animate-spin text-purple-500" />
              <span className="text-sm text-light-text dark:text-dark-text">{progress}</span>
            </div>
          </div>
        )}

        {/* Image Grid */}
        {generatedImages.length > 0 ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {generatedImages.map((image) => (
              <div
                key={image.id}
                className="group relative rounded-xl overflow-hidden border border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar fade-in"
              >
                {/* Image */}
                <div
                  className="aspect-square cursor-pointer"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={getImageSrc(image)}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(image);
                    }}
                    className="p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                    title="Download"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteImage(image.id);
                    }}
                    className="p-2 rounded-lg bg-black/60 text-white hover:bg-red-500/80 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Prompt text */}
                <div className="p-3">
                  <p className="text-xs text-light-muted dark:text-dark-muted line-clamp-2">
                    {image.prompt}
                  </p>
                  <p className="text-xs text-light-muted/60 dark:text-dark-muted/60 mt-1">
                    {image.model} · {image.size}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isGenerating && (
            <div className="flex-1 flex items-center justify-center h-full p-8">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
                  <ImageIcon size={36} className="text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-2">
                  No images yet
                </h3>
                <p className="text-sm text-light-muted dark:text-dark-muted max-w-xs mx-auto">
                  Enter a prompt and click Generate to create your first AI image.
                </p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <img
              src={getImageSrc(selectedImage)}
              alt={selectedImage.prompt}
              className="w-full h-full object-contain rounded-xl"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-white/70 max-w-lg truncate">{selectedImage.prompt}</p>
              <button
                onClick={() => handleDownload(selectedImage)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm"
              >
                <Download size={14} />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
