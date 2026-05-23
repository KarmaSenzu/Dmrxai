"use client";

import { useMemo, useState } from "react";
import { X, Search, Check } from "lucide-react";
import {
  groupModels,
  formatModelDisplayName,
} from "@/lib/model-categories";

interface ModelCatalogProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onModelChange: (model: string) => void;
  fetchedModels?: string[];
}

export default function ModelCatalog({
  isOpen,
  onClose,
  currentModel,
  onModelChange,
  fetchedModels = [],
}: ModelCatalogProps) {
  const [search, setSearch] = useState("");

  // Filter first, then group. Filter matches against the raw ID and the
  // cleaned display name so users can search either way.
  const filteredIds = useMemo(() => {
    if (!search.trim()) return fetchedModels;
    const q = search.toLowerCase();
    return fetchedModels.filter((id) => {
      const display = formatModelDisplayName(id).toLowerCase();
      return id.toLowerCase().includes(q) || display.includes(q);
    });
  }, [fetchedModels, search]);

  const groupedModels = useMemo(
    () =>
      groupModels(
        filteredIds.map((id) => ({
          id,
          displayName: formatModelDisplayName(id),
        }))
      ),
    [filteredIds]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-light-border dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Available Models</h2>
              <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
                Models loaded from your connected provider, dikelompokkan per family.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search */}
          {fetchedModels.length > 0 && (
            <div className="relative mt-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text text-sm focus:outline-none focus:border-light-accent dark:focus:border-dark-accent transition-colors"
              />
            </div>
          )}
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {fetchedModels.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-light-muted dark:text-dark-muted">
                No models loaded yet. Make sure your API key and Base URL are set in Settings.
              </p>
            </div>
          ) : filteredIds.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-light-muted dark:text-dark-muted">
                No models match &quot;{search}&quot;
              </p>
            </div>
          ) : (
            groupedModels.map((group) => (
              <div key={group.category.id} className="border-b border-light-border/50 dark:border-dark-border/50 last:border-b-0">
                {/* Category header */}
                <div className="sticky top-0 z-10 px-6 py-2 bg-light-sidebar dark:bg-dark-sidebar border-b border-light-border/40 dark:border-dark-border/40 flex items-center gap-2">
                  {group.category.icon && (
                    <span className="text-sm leading-none" aria-hidden="true">
                      {group.category.icon}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-light-text dark:text-dark-text">
                    {group.category.label}
                  </span>
                  <span className="text-[10px] text-light-muted dark:text-dark-muted">
                    ({group.models.length})
                  </span>
                  {group.category.description && (
                    <span className="hidden sm:inline text-[10px] text-light-muted dark:text-dark-muted ml-auto truncate">
                      {group.category.description}
                    </span>
                  )}
                </div>

                {/* Models in this category */}
                {group.models.map((m) => {
                  const isSelected = currentModel === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onModelChange(m.id)}
                      className={`w-full text-left px-6 py-3 transition-colors flex items-center gap-4 border-b border-light-border/30 dark:border-dark-border/30 last:border-b-0 ${
                        isSelected
                          ? "bg-light-accent/5 dark:bg-dark-accent/5"
                          : "hover:bg-light-hover dark:hover:bg-dark-hover"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isSelected ? "text-light-accent dark:text-dark-accent" : "text-light-text dark:text-dark-text"}`}>
                            {m.displayName || m.id}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-light-accent/15 dark:bg-dark-accent/15 text-light-accent dark:text-dark-accent">
                              Active
                            </span>
                          )}
                        </div>
                        {m.displayName && m.displayName !== m.id && (
                          <p className="text-[10px] text-light-muted dark:text-dark-muted mt-0.5 font-mono truncate">
                            {m.id}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Check size={16} className="flex-shrink-0 text-light-accent dark:text-dark-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-light-muted dark:text-dark-muted">
              {fetchedModels.length} model{fetchedModels.length === 1 ? "" : "s"} available
              {groupedModels.length > 0 && ` in ${groupedModels.length} ${groupedModels.length === 1 ? "category" : "categories"}`}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-light-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
