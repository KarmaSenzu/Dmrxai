"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, X, AlertCircle, RefreshCw } from "lucide-react";
import * as LucideIcons from "lucide-react";
import {
  groupModels,
  formatModelDisplayName,
  getActiveCapabilities,
  CAPABILITY_META,
  scoreModel,
  type Capability,
} from "@/lib/model-categories";
import { getSettings } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────
// Capability badge primitives
// ─────────────────────────────────────────────────────────────────────

function CapabilityIcon({
  name,
  size = 12,
}: {
  name: string;
  size?: number;
}) {
  const Icon = (LucideIcons as Record<string, unknown>)[name] as
    | React.ComponentType<{ size?: number; className?: string }>
    | undefined;
  if (!Icon) return null;
  return <Icon size={size} />;
}

// Tailwind doesn't allow string interpolation for class names in JIT,
// so we map color tokens to static class strings.
const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  purple:
    "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
  amber:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  yellow:
    "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  indigo:
    "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
};

function Badge({ capability }: { capability: Capability }) {
  const meta = CAPABILITY_META[capability];
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border ${COLOR_CLASSES[meta.color] ?? ""}`}
    >
      <CapabilityIcon name={meta.icon} size={10} />
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const router = useRouter();

  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<Capability>>(
    new Set()
  );
  // Bumped manually to retry the fetch effect.
  const [retryToken, setRetryToken] = useState(0);

  // Fetch model list using same shape as ModelCatalog/Home: POST to the
  // local edge proxy with apiKey + baseUrl from localStorage. Server
  // overrides with env when configured server-side.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const settings = getSettings();
    const apiKey = settings.apiKey || "_server_managed_";
    const baseUrl = settings.baseUrl || "_server_managed_";

    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, baseUrl }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            json?.error || `Failed to fetch models (${res.status})`
          );
        }
        return json;
      })
      .then((data) => {
        let ids: string[] = [];
        if (data?.data && Array.isArray(data.data)) {
          ids = data.data
            .map((m: unknown) =>
              typeof m === "string"
                ? m
                : (m as { id?: string; name?: string })?.id ||
                  (m as { id?: string; name?: string })?.name ||
                  ""
            )
            .filter((id: string) => id && id.length > 0);
        } else if (Array.isArray(data)) {
          ids = data
            .map((m: unknown) =>
              typeof m === "string"
                ? m
                : (m as { id?: string; name?: string })?.id ||
                  (m as { id?: string; name?: string })?.name ||
                  ""
            )
            .filter((id: string) => id && id.length > 0);
        }
        setModels(ids);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        const msg =
          err instanceof Error ? err.message : "Gagal memuat daftar model";
        setError(msg);
        setLoading(false);
      });

    return () => controller.abort();
  }, [retryToken]);

  // Apply search + capability filters.
  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filters = Array.from(activeFilters);
    return models.filter((id) => {
      if (q) {
        const display = formatModelDisplayName(id).toLowerCase();
        if (!id.toLowerCase().includes(q) && !display.includes(q)) return false;
      }
      if (filters.length > 0) {
        const caps = new Set(getActiveCapabilities(id));
        for (const f of filters) {
          if (!caps.has(f)) return false;
        }
      }
      return true;
    });
  }, [models, searchQuery, activeFilters]);

  const grouped = useMemo(
    () =>
      groupModels(
        filteredModels.map((id) => ({
          id,
          displayName: formatModelDisplayName(id),
        }))
      ),
    [filteredModels]
  );

  const toggleFilter = (cap: Capability) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setActiveFilters(new Set());
  };

  const hasFilters = searchQuery.trim().length > 0 || activeFilters.size > 0;

  return (
    <main className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Kembali ke chat
        </button>

        {/* Hero */}
        <section className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Model AI Tersedia
          </h1>
          <p className="text-base sm:text-lg text-light-muted dark:text-dark-muted mt-3 max-w-2xl leading-relaxed">
            Pilih model yang sesuai kebutuhan Anda. Setiap model punya kekuatan
            dan keterbatasan masing-masing.
          </p>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-2">
            {loading
              ? "Memuat daftar model..."
              : `${models.length} model tersedia`}
          </p>
        </section>

        {/* Search */}
        <section className="mb-4">
          <div className="relative w-full md:max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari model berdasarkan nama atau ID..."
              className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input text-light-text dark:text-dark-text text-sm focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </section>

        {/* Capability filter chips */}
        <section className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(CAPABILITY_META) as Capability[]).map((cap) => {
              const meta = CAPABILITY_META[cap];
              const isActive = activeFilters.has(cap);
              return (
                <button
                  key={cap}
                  onClick={() => toggleFilter(cap)}
                  title={meta.description}
                  className={
                    isActive
                      ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-light-accent dark:bg-dark-accent text-white border border-transparent transition-colors"
                      : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
                  }
                >
                  <CapabilityIcon name={meta.icon} size={12} />
                  {meta.label}
                </button>
              );
            })}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
              >
                <X size={12} /> Reset filter
              </button>
            )}
          </div>
        </section>

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {!loading && error && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 mb-4">
              <AlertCircle size={24} className="text-rose-500" />
            </div>
            <p className="text-base font-semibold">Gagal memuat model</p>
            <p className="text-sm text-light-muted dark:text-dark-muted mt-2 max-w-md mx-auto">
              {error}
            </p>
            <button
              onClick={() => setRetryToken((n) => n + 1)}
              className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-lg bg-light-accent dark:bg-dark-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={14} /> Coba lagi
            </button>
          </div>
        )}

        {/* Empty state — no fetched models */}
        {!loading && !error && models.length === 0 && (
          <div className="text-center py-16 text-light-muted dark:text-dark-muted">
            <p className="text-sm">
              Belum ada model yang dimuat. Pastikan API Key dan Base URL sudah
              di-set di Settings.
            </p>
          </div>
        )}

        {/* Empty state — filters return nothing */}
        {!loading && !error && models.length > 0 && filteredModels.length === 0 && (
          <div className="text-center py-16 text-light-muted dark:text-dark-muted">
            <p className="text-sm">
              Tidak ada model yang cocok dengan filter Anda
            </p>
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-lg bg-light-accent dark:bg-dark-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Reset filter
            </button>
          </div>
        )}

        {/* Groups */}
        {!loading && !error && filteredModels.length > 0 && (
          <section>
            {grouped.map((group) => (
              <div key={group.category.id}>
                <div className="flex items-center gap-2 text-base font-semibold mt-8 mb-3">
                  {group.category.icon && (
                    <span aria-hidden="true">{group.category.icon}</span>
                  )}
                  <span>{group.category.label}</span>
                  <span className="text-xs font-normal text-light-muted dark:text-dark-muted">
                    ({group.models.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.models.map((m) => {
                    const display = m.displayName || m.id;
                    const caps = getActiveCapabilities(m.id);
                    const score = Math.round(scoreModel(m.id));
                    return (
                      <div
                        key={m.id}
                        className="p-4 rounded-xl border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input hover:border-light-accent dark:hover:border-dark-accent transition-colors flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold leading-snug break-words">
                            {display}
                          </h3>
                          <span
                            title={`Skor kualitas heuristic: ${score}`}
                            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted font-mono"
                          >
                            {score}
                          </span>
                        </div>
                        {display !== m.id && (
                          <p className="text-[11px] text-light-muted dark:text-dark-muted font-mono break-all leading-snug">
                            {m.id}
                          </p>
                        )}
                        {caps.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {caps.map((cap) => (
                              <Badge key={cap} capability={cap} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-xl border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input animate-pulse"
        >
          <div className="h-4 w-3/4 rounded bg-light-border dark:bg-dark-border" />
          <div className="h-3 w-1/2 rounded bg-light-border dark:bg-dark-border mt-3" />
          <div className="flex gap-1 mt-4">
            <div className="h-4 w-12 rounded bg-light-border dark:bg-dark-border" />
            <div className="h-4 w-14 rounded bg-light-border dark:bg-dark-border" />
            <div className="h-4 w-10 rounded bg-light-border dark:bg-dark-border" />
          </div>
        </div>
      ))}
    </div>
  );
}
