"use client";

import { useRouter } from "next/navigation";
import LoginPage from "@/components/LoginPage";
import { useTheme } from "@/hooks/useTheme";

export default function LandingClient() {
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();

  // Avoid the SSR hydration flash where theme defaults to "dark" before the
  // useTheme effect resolves the user's preference. The mounted flag flips
  // true once that resolves, so we hold the render until then.
  if (!mounted) return null;

  return (
    <LoginPage
      theme={theme}
      onToggleTheme={toggleTheme}
      onStart={() => router.push("/login")}
    />
  );
}
