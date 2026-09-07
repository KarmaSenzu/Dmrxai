"use client";

import { useEffect } from "react";

/**
 * Validate that a candidate dashboard URL is an absolute http(s) URL we can
 * safely redirect to. Returns null if invalid. We deliberately do NOT use
 * the server-only url-guard here because this component runs in the browser;
 * the operator-supplied env var is trusted to point at the real dashboard.
 */
function resolveDashboardUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  useEffect(() => {
    // External dashboard URL is configured by deployment via env var.
    // If unset or invalid, fall back to the app root rather than a hardcoded
    // localhost target.
    const dashboardUrl = resolveDashboardUrl(process.env.NEXT_PUBLIC_DASHBOARD_URL);
    window.location.href = dashboardUrl ?? "/";
  }, []);

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 mx-auto mb-4 border-2 border-light-accent dark:border-dark-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-light-muted dark:text-dark-muted">Mengarahkan ke Dashboard...</p>
      </div>
    </div>
  );
}
