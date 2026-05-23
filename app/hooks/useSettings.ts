"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, DEFAULT_SETTINGS } from "@/lib/types";
import {
  getSettings,
  saveSettings,
  getOnboarded,
  setOnboarded as persistOnboarded,
} from "@/lib/storage";

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
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [serverConfig, setServerConfig] = useState<ServerConfig>(DEFAULT_SERVER_CONFIG);
  const [serverConfigLoaded, setServerConfigLoaded] = useState(false);

  useEffect(() => {
    const saved = getSettings();

    // Auto-clear legacy BYOK creds. The system is now server-managed —
    // any apiKey/baseUrl in localStorage is leftover from old versions
    // and should not be persisted. Clear once, save sanitized version.
    if (saved.apiKey || saved.baseUrl) {
      const sanitized = { ...saved, apiKey: "", baseUrl: "" };
      saveSettings(sanitized);
      setSettingsState(sanitized);
    } else {
      setSettingsState(saved);
    }

    setIsOnboarded(getOnboarded());
    setIsLoaded(true);
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

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    persistOnboarded(true);
    setIsOnboarded(true);
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    persistOnboarded(false);
    setIsOnboarded(false);
  }, []);

  // App is "configured" only when the server-managed AI provider is
  // active (apiKey + baseUrl baked into the server, model selected) AND
  // the user has explicitly completed onboarding via the "Mulai" CTA.
  const serverManagedConfigured = serverConfig.aiConfigured && Boolean(settings.model);
  const isConfigured = serverManagedConfigured && isOnboarded;

  return {
    settings,
    updateSettings,
    resetSettings,
    completeOnboarding,
    isConfigured,
    isOnboarded,
    isLoaded: isLoaded && serverConfigLoaded,
    serverConfig,
  };
}
