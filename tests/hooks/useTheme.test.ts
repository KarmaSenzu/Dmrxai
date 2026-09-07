import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies
vi.mock("@/lib/storage", () => ({
  getTheme: vi.fn(() => "dark"),
  saveTheme: vi.fn(),
}));

vi.mock("@/lib/user-settings-db", () => ({
  getThemeFromDB: vi.fn(() => Promise.resolve(null)),
  saveThemeToDB: vi.fn(() => Promise.resolve()),
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

import { useTheme } from "@/hooks/useTheme";
import { getTheme, saveTheme } from "@/lib/storage";
import { getThemeFromDB, saveThemeToDB } from "@/lib/user-settings-db";

describe("useTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove("dark");
  });

  it("initializes with default dark theme", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("sets mounted to true after mount", async () => {
    const { result } = renderHook(() => useTheme());
    // useEffect runs synchronously in test env with happy-dom
    expect(result.current.mounted).toBe(true);
  });

  it("reads theme from localStorage on mount", () => {
    vi.mocked(getTheme).mockReturnValue("light");
    const { result } = renderHook(() => useTheme());
    expect(getTheme).toHaveBeenCalled();
    expect(result.current.theme).toBe("light");
  });

  it("applies dark class to documentElement when theme is dark", () => {
    vi.mocked(getTheme).mockReturnValue("dark");
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class from documentElement when theme is light", () => {
    document.documentElement.classList.add("dark");
    vi.mocked(getTheme).mockReturnValue("light");
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleTheme switches from dark to light", () => {
    vi.mocked(getTheme).mockReturnValue("dark");
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(saveTheme).toHaveBeenCalledWith("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleTheme switches from light to dark", () => {
    vi.mocked(getTheme).mockReturnValue("light");
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(saveTheme).toHaveBeenCalledWith("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme directly sets a specific theme", () => {
    vi.mocked(getTheme).mockReturnValue("dark");
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(saveTheme).toHaveBeenCalledWith("light");
    expect(saveThemeToDB).toHaveBeenCalledWith("light");
  });

  it("fetches theme from DB when user is authenticated", async () => {
    vi.mocked(getTheme).mockReturnValue("dark");
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.mocked(getThemeFromDB).mockResolvedValue("light");

    const { result } = renderHook(() => useTheme());

    // Wait for async DB fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.theme).toBe("light");
    expect(saveTheme).toHaveBeenCalledWith("light");
  });

  it("does not override local theme if DB returns same value", async () => {
    vi.mocked(getTheme).mockReturnValue("dark");
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.mocked(getThemeFromDB).mockResolvedValue("dark");

    renderHook(() => useTheme());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // saveTheme should only be called from the initial mount, not from DB sync
    // since DB theme matches local theme
    expect(saveTheme).not.toHaveBeenCalledWith("dark");
  });
});
