"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { renderNode } from "./wireframe/renderNode";
import { countNodes, MAX_NODES, type WireframeSpec } from "./wireframe/types";

// Inline width caps (within the chat column). Desktop/tablet also get a
// realistic MIN width so they render at true proportions instead of being
// squished into the narrow chat column; the block scrolls horizontally.
const FRAME_WIDTH: Record<string, string> = {
  phone: "max-w-[340px]",
  tablet: "max-w-[760px]",
  desktop: "max-w-full",
  auto: "max-w-md",
};

// Minimum rendering width (px) per device so content is legible.
const FRAME_MIN_WIDTH: Record<string, number> = {
  phone: 0,
  tablet: 700,
  desktop: 1040,
  auto: 0,
};

function Fallback({ message, spec }: { message: string; spec: string }) {
  return (
    <div className="my-4 rounded-lg border border-rose-500/30 bg-rose-500/5 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 border-b border-rose-500/20">
        Error rendering wireframe
      </div>
      <div className="px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
        {message}
      </div>
      <pre className="px-3 py-2 text-xs font-mono bg-rose-500/5 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto border-t border-rose-500/20">
        {spec}
      </pre>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 py-1.5 text-[10px] font-semibold text-light-text dark:text-dark-text">
      <span>9:41</span>
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-2 rounded-[1px] bg-current opacity-70" />
        <span className="inline-block w-3 h-2 rounded-[1px] bg-current opacity-50" />
        <span className="inline-block w-4 h-2 rounded-[2px] border border-current opacity-70" />
      </div>
    </div>
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <div className="flex-1 flex items-center gap-2 rounded-md bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border px-3 py-1 text-[11px] text-light-muted dark:text-dark-muted truncate">
        <span className="opacity-60">{"\uD83D\uDD12"}</span>
        <span className="truncate">{url}</span>
      </div>
    </div>
  );
}

export default function WireframeBlock({ spec }: { spec: string }) {
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Lock body scroll while the fullscreen overlay is open; close on Escape.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(spec);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  let parsed: WireframeSpec;
  try {
    parsed = JSON.parse(spec);
  } catch {
    return <Fallback message="JSON wireframe tidak valid." spec={spec} />;
  }

  if (!parsed || parsed.type !== "screen" || !Array.isArray(parsed.children)) {
    return (
      <Fallback
        message={'Spec wireframe harus berupa { "type": "screen", "children": [...] }.'}
        spec={spec}
      />
    );
  }

  const total = countNodes(parsed.children);
  if (total > MAX_NODES) {
    return (
      <Fallback
        message={`Wireframe terlalu besar (${total} node, maks ${MAX_NODES}). Sederhanakan struktur.`}
        spec={spec}
      />
    );
  }

  const width = parsed.width ?? "auto";
  const widthCls = FRAME_WIDTH[width] ?? FRAME_WIDTH.auto;
  const minW = FRAME_MIN_WIDTH[width] ?? 0;
  const isPhone = width === "phone";
  const isWeb = width === "desktop" || width === "tablet";
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";

  const children = parsed.children;
  const hasSidebar =
    isWeb &&
    children.some(
      (c) => c && typeof c === "object" && (c as { type?: unknown }).type === "sidebar"
    );

  const frameOuter = isPhone
    ? "rounded-[2rem] border-[6px] border-light-border dark:border-dark-border shadow-xl p-1.5"
    : "rounded-xl border border-light-border dark:border-dark-border shadow-md";

  const url =
    "www." +
    (title ? title.toLowerCase().replace(/[^a-z0-9]+/g, "") || "example" : "example") +
    ".com";

  let body: React.ReactNode;
  if (hasSidebar) {
    const sidebar = children.find(
      (c) => (c as { type?: unknown }).type === "sidebar"
    );
    const rest = children.filter(
      (c) => (c as { type?: unknown }).type !== "sidebar"
    );
    body = (
      <div className="flex flex-row min-h-[280px]">
        {sidebar && renderNode(sidebar, "sidebar")}
        <div className="flex-1 flex flex-col gap-3 p-4 min-w-0">
          {rest.map((n, i) => renderNode(n, i))}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3 p-4">
        {children.map((n, i) => renderNode(n, i))}
      </div>
    );
  }

  // The device frame, shared by inline and fullscreen renders. `full` removes
  // the inline min-width cap so it can grow to the overlay width.
  const renderFrame = (full: boolean) => (
    <div
      className={`bg-light-bg dark:bg-dark-bg ${frameOuter} ${
        full ? "w-full max-w-[1400px]" : `w-full ${widthCls}`
      }`}
      style={!full && minW ? { minWidth: minW } : undefined}
    >
      <div className={`overflow-hidden ${isPhone ? "rounded-[1.4rem]" : "rounded-lg"}`}>
        {isPhone && <StatusBar />}
        {isWeb && <BrowserBar url={url} />}
        {title && !hasSidebar && (
          <div className="px-4 py-2.5 text-sm font-bold text-light-text dark:text-dark-text border-b border-light-border dark:border-dark-border">
            {title}
          </div>
        )}
        {body}
      </div>
    </div>
  );

  return (
    <>
      <div className="my-4 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-light-border dark:border-dark-border">
          <span className="text-[10px] font-mono uppercase text-light-muted dark:text-dark-muted">
            wireframe
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFullscreen(true)}
              className="inline-flex items-center gap-1 text-[10px] text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
            >
              <Maximize2 className="w-3 h-3" /> Perbesar
            </button>
            <button
              onClick={handleCopy}
              className="text-[10px] text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
            >
              {copied ? "Tersalin!" : "Salin source"}
            </button>
          </div>
        </div>

        <div className="px-4 py-5 overflow-x-auto flex justify-center bg-light-sidebar/40 dark:bg-dark-sidebar/40">
          {renderFrame(false)}
        </div>
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-light-sidebar dark:bg-dark-sidebar border-b border-light-border dark:border-dark-border">
            <span className="text-xs font-semibold text-light-text dark:text-dark-text">
              {title || "Wireframe"} {" "}
              <span className="text-light-muted dark:text-dark-muted">
                — preview
              </span>
            </span>
            <button
              onClick={() => setFullscreen(false)}
              className="inline-flex items-center gap-1 text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
            >
              <X className="w-4 h-4" /> Tutup (Esc)
            </button>
          </div>
          <div
            className="flex-1 overflow-auto p-6 flex justify-center bg-light-sidebar/40 dark:bg-dark-sidebar/40"
            onClick={(e) => e.stopPropagation()}
          >
            {renderFrame(true)}
          </div>
        </div>
      )}
    </>
  );
}