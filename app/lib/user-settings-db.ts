"use client";

import { getSupabaseBrowser } from "./supabase-browser";
import type { Settings, ImageSettings } from "./types";

export interface DBUserSettings {
  user_id: string;
  model: string | null;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  theme: "dark" | "light";
  image_settings: Record<string, unknown>;
  preferences: Record<string, unknown>;
  updated_at: string;
}

/**
 * Load user_settings row for the authed user. Returns a partial Settings
 * mapped from DB columns, ready to merge over local defaults. Returns null
 * when not signed in or the row doesn't exist yet (caller will create on
 * first save).
 */
export async function getUserSettingsFromDB(): Promise<Partial<Settings> | null> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[SETTINGS-DB] Load failed:", error);
    return null;
  }
  if (!data) {
    console.warn("[SETTINGS-DB] No settings row, will create on first save");
    return null;
  }

  // Map DB row to Settings shape. preferences JSONB carries any client-only
  // fields (apiKey/baseUrl are intentionally NOT round-tripped through DB).
  const prefs = (data.preferences as Record<string, unknown> | null) ?? {};
  const merged: Partial<Settings> = { ...prefs } as Partial<Settings>;
  if (typeof data.model === "string") merged.model = data.model;
  if (typeof data.temperature === "number") merged.temperature = data.temperature;
  if (typeof data.max_tokens === "number") merged.maxTokens = data.max_tokens;
  if (typeof data.system_prompt === "string") merged.systemPrompt = data.system_prompt;
  return merged;
}

/**
 * Persist a partial Settings update to user_settings. Known columns
 * (model/temperature/max_tokens/system_prompt) are written directly; any
 * unknown fields are merged into the preferences JSONB. apiKey/baseUrl are
 * intentionally stripped because credentials are server-managed now.
 */
export async function saveUserSettingsToDB(settings: Partial<Settings>): Promise<void> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Strip never-persisted creds from any incoming patch.
  const sanitized = { ...settings } as Partial<Settings> & Record<string, unknown>;
  delete sanitized.apiKey;
  delete sanitized.baseUrl;

  const { model, temperature, maxTokens, systemPrompt, ...rest } = sanitized;

  const update: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof model === "string") update.model = model;
  if (typeof temperature === "number") update.temperature = temperature;
  if (typeof maxTokens === "number") update.max_tokens = maxTokens;
  if (typeof systemPrompt === "string") update.system_prompt = systemPrompt;
  if (Object.keys(rest).length > 0) update.preferences = rest;

  const { error } = await supabase
    .from("user_settings")
    .upsert(update, { onConflict: "user_id" });
  if (error) console.error("[SETTINGS-DB] Save failed:", error);
}

export async function saveThemeToDB(theme: "dark" | "light"): Promise<void> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, theme, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) console.error("[SETTINGS-DB] Theme save failed:", error);
}

export async function getThemeFromDB(): Promise<"dark" | "light" | null> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_settings")
    .select("theme")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data.theme === "light" || data.theme === "dark" ? data.theme : null;
}

export async function saveImageSettingsToDB(
  imageSettings: Partial<ImageSettings>
): Promise<void> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        image_settings: imageSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) console.error("[SETTINGS-DB] Image settings save failed:", error);
}

export async function getImageSettingsFromDB(): Promise<Partial<ImageSettings> | null> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_settings")
    .select("image_settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return (data.image_settings as Partial<ImageSettings> | null) ?? null;
}
