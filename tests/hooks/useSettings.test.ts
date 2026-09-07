import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies
vi.mock("@/lib/storage", () => ({
  getSettings: vi.fn(() => ({
    apiKey: "",
    baseUrl: "",
    model: "kr/claude-opus-4.6",
    temperature: 0.7,
    maxTokens: 16384,
    systemPrompt: "",
  })),
  saveSettings: vi.fn(),
}));

vi.mock("@/lib/user-settings-db", () => ({
  getUserSettingsFromDB: vi.fn(() => Promise.resolve(null)),
  saveUserSettingsToDB: vi.fn(() => Promise.resolve()),
}));

const mockGetUser = vi.fn<(...args: any[]) => Promise<{ data: { user: any } }>>(() =>
  Promise.resolve({ data: { user: null } })
);
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: vi.fn(() => ({
    auth: {
      getUser: (...args: any[]) => mockGetUser(...args),
    },
  })),
}));

// Mock fetch for /api/config
const mockFetch = vi.fn<(...args: any[]) => Promise<any>>(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        aiConfigured: true,
        usageConfigured: false,
        aiBaseUrlHint: null,
      }),
  })
);
global.fetch = mockFetch as unknown as typeof fetch;

import { useSettings } from "@/hooks/useSettings";
import { getSettings, saveSettings } from "@/lib/storage";
import { getUserSettingsFromDB, saveUserSettingsToDB } from "@/lib/user-settings-db";

describe("useSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            aiConfigured: true,
            usageConfigured: false,
            aiBaseUrlHint: null,
          }),
      } as Response)
    );
  });

  it("loads default settings initially", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.model).toBe("kr/claude-opus-4.6");
    expect(result.current.settings.temperature).toBe(0.7);
    expect(result.current.settings.maxTokens).toBe(16384);
  });

  it("sets isLoaded to true after mount and config fetch", async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
  });

  it("reads settings from localStorage on mount", () => {
    vi.mocked(getSettings).mockReturnValue({
      apiKey: "",
      baseUrl: "",
      model: "kr/claude-haiku-4.5",
      temperature: 0.5,
      maxTokens: 8192,
      systemPrompt: "custom prompt",
    });

    const { result } = renderHook(() => useSettings());
    expect(getSettings).toHaveBeenCalled();
    expect(result.current.settings.model).toBe("kr/claude-haiku-4.5");
    expect(result.current.settings.temperature).toBe(0.5);
  });

  it("clears legacy apiKey and baseUrl from localStorage on mount", () => {
    vi.mocked(getSettings).mockReturnValue({
      apiKey: "old-key",
      baseUrl: "https://old-url.com",
      model: "kr/claude-opus-4.6",
      temperature: 0.7,
      maxTokens: 16384,
      systemPrompt: "",
    });

    const { result } = renderHook(() => useSettings());
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "", baseUrl: "" })
    );
    expect(result.current.settings.apiKey).toBe("");
    expect(result.current.settings.baseUrl).toBe("");
  });

  it("updateSettings merges partial settings and persists", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ temperature: 0.9 });
    });

    expect(result.current.settings.temperature).toBe(0.9);
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.9 })
    );
  });

  it("updateSettings triggers debounced DB save", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ model: "kr/gpt-4o" });
    });

    // DB save is debounced at 1500ms
    expect(saveUserSettingsToDB).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(saveUserSettingsToDB).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resetSettings restores defaults", () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.updateSettings({ temperature: 1.0, model: "custom" });
    });

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings.model).toBe("kr/claude-opus-4.6");
    expect(result.current.settings.temperature).toBe(0.7);
  });

  it("fetches server config on mount", async () => {
    renderHook(() => useSettings());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/config");
    });
  });

  it("isConfigured is true when AI is configured and model is set", async () => {
    vi.mocked(getSettings).mockReturnValue({
      apiKey: "",
      baseUrl: "",
      model: "kr/claude-opus-4.6",
      temperature: 0.7,
      maxTokens: 16384,
      systemPrompt: "",
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isConfigured).toBe(true);
    });
  });

  it("isConfigured is false when no model is set", async () => {
    vi.mocked(getSettings).mockReturnValue({
      apiKey: "",
      baseUrl: "",
      model: "",
      temperature: 0.7,
      maxTokens: 16384,
      systemPrompt: "",
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.isConfigured).toBe(false);
  });

  it("merges DB settings when user is authenticated", async () => {
    vi.mocked(getSettings).mockReturnValue({
      apiKey: "",
      baseUrl: "",
      model: "kr/claude-opus-4.6",
      temperature: 0.7,
      maxTokens: 16384,
      systemPrompt: "",
    });

    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.mocked(getUserSettingsFromDB).mockResolvedValue({
      model: "kr/gpt-4o",
      temperature: 0.5,
    });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settings.model).toBe("kr/gpt-4o");
    });

    expect(result.current.settings.temperature).toBe(0.5);
    // apiKey/baseUrl should still be cleared
    expect(result.current.settings.apiKey).toBe("");
  });
});
