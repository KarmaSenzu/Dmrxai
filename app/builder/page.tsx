"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";

const BuilderWorkspaceE2B = dynamic(
  () => import("@/components/BuilderWorkspaceE2B"),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <Loader2 className="animate-spin text-light-accent dark:text-dark-accent" size={28} />
      </div>
    ),
  },
);

function BuilderPageInner() {
  const { mounted } = useTheme();
  const { isLoaded } = useSettings();

  if (!mounted || !isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <Loader2 className="animate-spin text-light-accent dark:text-dark-accent" size={28} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-light-bg dark:bg-dark-bg">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar">
        <Link
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-light-text dark:text-dark-text">
            App Builder
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent font-semibold">
            Beta
          </span>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <BuilderWorkspaceE2B />
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
          <Loader2 className="animate-spin text-light-accent dark:text-dark-accent" size={28} />
        </div>
      }
    >
      <BuilderPageInner />
    </Suspense>
  );
}
