"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Settings, DEFAULT_SETTINGS } from "@/lib/types";
import { getSettings, saveSettings } from "@/lib/storage";
import {
  getUserSettingsFromDB,
  saveUserSettingsToDB,
} from "@/lib/user-settings-db";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export interface ServerConfig {
  aiConfigured: boolean;
  usageConfigured: boolean;
  aiBaseUrlHint: string | null;
}

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  aiConfigured: false,
  usageConfigured: false,
  aiBaseUrlHint: null,
};

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [serverConfig, setServerConfig] = useState<ServerConfig>(DEFAULT_SERVER_CONFIG);
  const [serverConfigLoaded, setServerConfigLoaded] = useState(false);

  // Debounced DB writer. localStorage is the instant cache; DB is the
  // canonical store but tolerates a small lag so rapid slider drags don't
  // spam Supabase.
  const dbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedDBSave = useCallback((s: Partial<Settings>) => {
    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    dbSaveTimerRef.current = setTimeout(() => {
      void saveUserSettingsToDB(s).catch(() => {});
    }, 1500);
  }, []);

  useEffect(() => {
    const saved = getSettings();

    // Auto-clear legacy BYOK creds. The system is now server-managed —
    // any apiKey/baseUrl in localStorage is leftover from old versions
    // and should not be persisted. We only run this migration once per
    // browser, gated by a flag, so future legitimate uses of these fields
    // (e.g. user-supplied keys for self-hosted) won't get stomped on every
    // mount of the hook.
    const migrationFlag = "dmrxai:settings-byok-cleared:v1";
    const alreadyMigrated =
      typeof window !== "undefined" && localStorage.getItem(migrationFlag) === "1";
    if (!alreadyMigrated && (saved.apiKey || saved.baseUrl)) {
      const sanitized = { ...saved, apiKey: "", baseUrl: "" };
      saveSettings(sanitized);
      setSettingsState(sanitized);
      try {
        localStorage.setItem(migrationFlag, "1");
      } catch {
        // ignore quota
      }
    } else {
      setSettingsState(saved);
      if (!alreadyMigrated) {
        try {
          localStorage.setItem(migrationFlag, "1");
        } catch {
          // ignore quota
        }
      }
    }

    setIsLoaded(true);
  }, []);

  // After local hydrate, fetch DB settings for the authed user and merge.
  // DB wins on matching keys so a fresh device picks up server-of-record.
  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const dbSettings = await getUserSettingsFromDB();
        if (!dbSettings) return;

        setSettingsState((prev) => {
          const merged = { ...prev, ...dbSettings, apiKey: "", baseUrl: "" };
          saveSettings(merged);
          return merged;
        });
      } catch (e) {
        console.error("[useSettings] DB load failed:", e);
      }
    })();
  }, []);

  // Fetch server-managed config flag once on mount. The endpoint never
  // returns secrets — only booleans + an optional public baseUrl hint.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cancelled || !cfg || typeof cfg !== "object") return;
        setServerConfig({
          aiConfigured: Boolean(cfg.aiConfigured),
          usageConfigured: Boolean(cfg.usageConfigured),
          aiBaseUrlHint: typeof cfg.aiBaseUrlHint === "string" ? cfg.aiBaseUrlHint : null,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setServerConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback(
    (newSettings: Partial<Settings>) => {
      setSettingsState((prev) => {
        const updated = { ...prev, ...newSettings };
        saveSettings(updated);
        debouncedDBSave(updated);
        return updated;
      });
    },
    [debouncedDBSave]
  );

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    debouncedDBSave(DEFAULT_SETTINGS);
  }, [debouncedDBSave]);

  // The Supabase session (enforced by middleware + server component shell)
  // is now the source of truth for "is the user allowed in?". Locally we
  // only need to know whether server-managed AI is wired up and a model
  // is selected for the chat UI to function.
  const isConfigured = serverConfig.aiConfigured && Boolean(settings.model);

  return {
    settings,
    updateSettings,
    resetSettings,
    isConfigured,
    isLoaded: isLoaded && serverConfigLoaded,
    serverConfig,
  };
}
