"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

export function UserMenu() {
  const { user, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (loading) {
    return <Loader2 size={18} className="animate-spin text-light-muted dark:text-dark-muted" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm text-violet-500 hover:underline"
      >
        Login
      </Link>
    );
  }

  const initial = (user.user_metadata?.display_name || user.email || "?").charAt(0).toUpperCase();
  const displayName = user.user_metadata?.display_name || user.email?.split("@")[0] || "User";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover transition"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold">
          {initial}
        </div>
        <span className="text-sm font-medium text-light-text dark:text-dark-text truncate max-w-[120px]">
          {displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-56 rounded-lg border border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-light-border dark:border-dark-border">
            <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{displayName}</p>
            <p className="text-xs text-light-muted dark:text-dark-muted truncate">{user.email}</p>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-light-text dark:text-dark-text hover:bg-light-hover dark:hover:bg-dark-hover transition"
          >
            <UserIcon size={14} /> Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-500 hover:bg-light-hover dark:hover:bg-dark-hover transition text-left"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}
