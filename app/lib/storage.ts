import { Settings, Conversation, DEFAULT_SETTINGS } from "./types";

const SETTINGS_KEY = "chat-app-settings";
const CONVERSATIONS_KEY = "chat-app-conversations";
const THEME_KEY = "chat-app-theme";

// Settings
export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

// Conversations
//
// Defensive schema validation: localStorage can be edited by hand,
// migrated from older schemas, or corrupted by other code. Filter out
// anything that doesn't match the minimal `Conversation` shape so the
// rest of the app can rely on the returned values.
function isConversation(item: unknown): item is Conversation {
  if (!item || typeof item !== "object") return false;
  const c = item as Record<string, unknown>;
  return typeof c.id === "string" && Array.isArray(c.messages);
}

export function getConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CONVERSATIONS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConversation);
  } catch (e) {
    console.error("Failed to load conversations:", e);
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === "undefined") return;

  // Best-effort: when localStorage is full, drop the oldest conversations
  // (lowest updatedAt) and retry up to a few times before giving up.
  let toSave = [...conversations].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(toSave));
      return;
    } catch (e) {
      const err = e as DOMException;
      const isQuota =
        err?.name === "QuotaExceededError" ||
        err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        err?.code === 22 ||
        err?.code === 1014;

      if (!isQuota || toSave.length <= 1) {
        console.error("Failed to save conversations:", e);
        return;
      }

      // Drop oldest 25% (tail of the desc-sorted list).
      const dropCount = Math.max(1, Math.ceil(toSave.length * 0.25));
      console.warn(
        `[STORAGE] localStorage quota exceeded, dropping ${dropCount} oldest conversation(s) and retrying`,
      );
      toSave = toSave.slice(0, toSave.length - dropCount);
    }
  }

  console.error("[STORAGE] Failed to save conversations after multiple quota retries");
}

export function getConversation(id: string): Conversation | undefined {
  const conversations = getConversations();
  return conversations.find((c) => c.id === id);
}

export function saveConversation(conversation: Conversation): void {
  const conversations = getConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);
  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }
  saveConversations(conversations);
}

export function deleteConversation(id: string): void {
  const conversations = getConversations().filter((c) => c.id !== id);
  saveConversations(conversations);
}

// Theme
export function getTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch (e) {
    console.error("Failed to load theme:", e);
  }
  // Check system preference
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function saveTheme(theme: "dark" | "light"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    console.error("Failed to save theme:", e);
  }
}

