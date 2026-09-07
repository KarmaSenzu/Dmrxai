"use client";

import { useState, useEffect, useCallback } from "react";
import { getTheme, saveTheme } from "@/lib/storage";
import { getThemeFromDB, saveThemeToDB } from "@/lib/user-settings-db";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function useTheme() {
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = getTheme();
    setThemeState(savedTheme);
    document.documentElement.classList.toggle("dark", savedTheme === "dark");

    // After local hydrate, pull the canonical theme from DB if signed in.
    void (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const dbTheme = await getThemeFromDB();
        if (!dbTheme || dbTheme === savedTheme) return;

        setThemeState(dbTheme);
        saveTheme(dbTheme);
        document.documentElement.classList.toggle("dark", dbTheme === "dark");
      } catch (e) {
        console.error("[useTheme] DB load failed:", e);
      }
    })();
  }, []);

  const setTheme = useCallback((newTheme: "dark" | "light") => {
    if (typeof window === "undefined") return;
    setThemeState(newTheme);
    saveTheme(newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    void saveThemeToDB(newTheme).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}
