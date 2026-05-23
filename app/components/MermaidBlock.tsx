"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidBlockProps {
  code: string;
}

let idCounter = 0;
const nextId = () => `mermaid-${Date.now()}-${idCounter++}`;

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const idRef = useRef<string>(nextId());

  // TODO: re-render on theme change
  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError("");
      try {
        const mermaid = (await import("mermaid")).default;

        // Detect dark mode by checking the html.dark class.
        const isDark =
          typeof document !== "undefined" &&
          document.documentElement.classList.contains("dark");

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          themeVariables: isDark
            ? {
                background: "#0d1117",
                primaryColor: "#1c2128",
                primaryTextColor: "#e6edf3",
                primaryBorderColor: "#30363d",
                lineColor: "#8b949e",
                secondaryColor: "#161b22",
                tertiaryColor: "#21262d",
              }
            : {
                background: "#ffffff",
                primaryColor: "#f0f2f5",
                primaryTextColor: "#1f2328",
                primaryBorderColor: "#d0d7de",
                lineColor: "#656d76",
                secondaryColor: "#f6f8fa",
                tertiaryColor: "#eaeef2",
              },
          securityLevel: "strict",
        });

        // Validate first
        const isValid = await mermaid.parse(code, { suppressErrors: true });
        if (!isValid) {
          if (!cancelled) {
            setError("Sintaks Mermaid tidak valid. Periksa syntax diagram.");
            setLoading(false);
          }
          return;
        }

        const { svg: rendered } = await mermaid.render(idRef.current, code);
        if (!cancelled) {
          setSvg(rendered);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Gagal render diagram";
          setError(msg);
          setLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Handle copy source
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (error) {
    return (
      <div className="my-4 rounded-lg border border-rose-500/30 bg-rose-500/5 overflow-hidden">
        <div className="px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 border-b border-rose-500/20">
          Error rendering diagram Mermaid
        </div>
        <div className="px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
        <pre className="px-3 py-2 text-xs font-mono bg-rose-500/5 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto border-t border-rose-500/20">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-light-border dark:border-dark-border">
        <span className="text-[10px] font-mono uppercase text-light-muted dark:text-dark-muted">
          mermaid
        </span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          {copied ? "Tersalin!" : "Salin source"}
        </button>
      </div>
      {loading ? (
        <div
          ref={containerRef}
          className="px-4 py-4 overflow-x-auto flex justify-center"
        >
          <div className="text-xs text-light-muted dark:text-dark-muted py-8">
            Merender diagram...
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="px-4 py-4 overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
