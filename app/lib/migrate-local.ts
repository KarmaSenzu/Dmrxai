"use client";

import { getSupabaseBrowser } from "./supabase-browser";
import { getConversations } from "./storage";
import { saveConversationToDB } from "./chat-db";
import { saveImageToDB } from "./image-gen-db";
import {
  saveUserSettingsToDB,
  saveImageSettingsToDB,
} from "./user-settings-db";
import {
  getProjects,
  getProjectData,
  syncProjectToDB,
} from "./builder-storage";
import type { Settings, ImageSettings, GeneratedImage } from "./types";

const MIGRATED_FLAG_PREFIX = "dmrxai:migrated_v1:";

function isGeneratedImage(v: unknown): v is GeneratedImage {
  return (
    typeof v === "object" &&
    v !== null &&
    "id" in v &&
    "prompt" in v
  );
}

export interface MigrationStats {
  conversationsMigrated: number;
  builderProjectsMigrated: number;
  imagesMigrated: number;
  settingsMigrated: boolean;
  imageSettingsMigrated: boolean;
  errors: string[];
  skipped: boolean; // true if already migrated for this user
}

/**
 * Run one-shot migration of localStorage data → Supabase DB.
 * Idempotent: subsequent calls for the same user are no-ops thanks to a
 * per-user flag stored in localStorage.
 */
export async function migrateLocalStorageToDB(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    conversationsMigrated: 0,
    builderProjectsMigrated: 0,
    imagesMigrated: 0,
    settingsMigrated: false,
    imageSettingsMigrated: false,
    errors: [],
    skipped: false,
  };

  if (typeof window === "undefined") {
    stats.skipped = true;
    return stats;
  }

  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    stats.errors.push("No authed user");
    return stats;
  }

  const flagKey = MIGRATED_FLAG_PREFIX + user.id;
  if (localStorage.getItem(flagKey) === "true") {
    stats.skipped = true;
    return stats;
  }

  // 1. Migrate chat conversations
  try {
    const convs = getConversations();
    for (const conv of convs) {
      try {
        await saveConversationToDB(conv);
        stats.conversationsMigrated++;
      } catch (e) {
        stats.errors.push(
          `conv ${conv.id}: ${e instanceof Error ? e.message : "?"}`,
        );
      }
    }
  } catch (e) {
    stats.errors.push(
      "Load conversations failed: " + (e instanceof Error ? e.message : "?"),
    );
  }

  // 2. Migrate builder projects
  try {
    const projects = getProjects();
    for (const project of projects) {
      try {
        const data = getProjectData(project.id);
        if (!data) continue;
        await syncProjectToDB(
          user.id,
          data.project,
          data.messages,
          data.files,
        );
        stats.builderProjectsMigrated++;
      } catch (e) {
        stats.errors.push(
          `project ${project.id}: ${e instanceof Error ? e.message : "?"}`,
        );
      }
    }
  } catch (e) {
    stats.errors.push(
      "Load projects failed: " + (e instanceof Error ? e.message : "?"),
    );
  }

  // 3. Migrate generated images
  try {
    const raw = localStorage.getItem("chat-app-generated-images");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Element-level validation guards against malformed/poisoned localStorage
      // (manual edits, prior schema drift). Anything missing core fields is
      // skipped silently rather than thrown across the migration.
      const images: GeneratedImage[] = Array.isArray(parsed)
        ? parsed.filter(isGeneratedImage)
        : [];
      for (const img of images) {
        try {
          await saveImageToDB(img);
          stats.imagesMigrated++;
        } catch (e) {
          stats.errors.push(
            `image ${img.id}: ${e instanceof Error ? e.message : "?"}`,
          );
        }
      }
    }
  } catch (e) {
    stats.errors.push(
      "Load images failed: " + (e instanceof Error ? e.message : "?"),
    );
  }

  // 4. Migrate settings
  try {
    const raw = localStorage.getItem("chat-app-settings");
    if (raw) {
      const settings = JSON.parse(raw) as Partial<Settings>;
      await saveUserSettingsToDB(settings);
      stats.settingsMigrated = true;
    }
  } catch (e) {
    stats.errors.push(
      "Settings migration failed: " + (e instanceof Error ? e.message : "?"),
    );
  }

  // 5. Migrate image settings
  try {
    const raw = localStorage.getItem("chat-app-image-settings");
    if (raw) {
      const imageSettings = JSON.parse(raw) as Partial<ImageSettings>;
      await saveImageSettingsToDB(imageSettings);
      stats.imageSettingsMigrated = true;
    }
  } catch (e) {
    stats.errors.push(
      "Image settings migration failed: " +
        (e instanceof Error ? e.message : "?"),
    );
  }

  // Mark migrated. We set the flag even if some sub-steps errored — partial
  // success is preferable to retrying the whole batch on every login and
  // creating duplicates. Errors are surfaced via the returned stats.
  try {
    localStorage.setItem(flagKey, "true");
    localStorage.setItem(flagKey + ":at", new Date().toISOString());
  } catch {
    // ignore quota — flag is best-effort
  }

  return stats;
}

/**
 * Reset migration flag for current user (for testing / forced re-migration).
 */
export async function resetMigrationFlag(): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  localStorage.removeItem(MIGRATED_FLAG_PREFIX + user.id);
  localStorage.removeItem(MIGRATED_FLAG_PREFIX + user.id + ":at");
}
