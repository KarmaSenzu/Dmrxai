import { Settings, Conversation, DEFAULT_SETTINGS } from "./types";

const SETTINGS_KEY = "chat-app-settings";
const CONVERSATIONS_KEY = "chat-app-conversations";
const THEME_KEY = "chat-app-theme";
const ONBOARDED_KEY = "dmrxai-onboarded";

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
export function getConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CONVERSATIONS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load conversations:", e);
  }
  return [];
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.error("Failed to save conversations:", e);
  }
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

// Onboarded flag — set when user clicks "Mulai Sekarang" on landing page.
// Used as the gate to access the chat app (not real auth, just UX gate).
export function getOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "true";
  } catch (e) {
    console.error("Failed to load onboarded flag:", e);
    return false;
  }
}

export function setOnboarded(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDED_KEY, value ? "true" : "false");
  } catch (e) {
    console.error("Failed to save onboarded flag:", e);
  }
}
