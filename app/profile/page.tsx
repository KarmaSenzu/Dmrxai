"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Loader2, AlertCircle, CheckCircle2, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  email: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/profile");
    }
  }, [authLoading, user, router]);

  // Load profile. Guarded with a `mounted` flag so we don't setState on
  // an unmounted component if the user navigates away before the Supabase
  // round-trip resolves.
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const loadProfile = async () => {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, email")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (error) {
        setMessage({ type: "error", text: "Gagal memuat profile: " + error.message });
      } else if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? "");
      }
      setLoading(false);
    };
    loadProfile();
    return () => {
      mounted = false;
    };
  }, [user]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setMessage(null);

    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      setMessage({ type: "error", text: "Gagal menyimpan: " + error.message });
    } else {
      setMessage({ type: "success", text: "Profile berhasil disimpan" });
    }
    setSaving(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <Loader2 size={28} className="animate-spin text-light-accent dark:text-dark-accent" />
      </div>
    );
  }

  if (!user) return null;

  const initial = (profile?.display_name || profile?.email || user.email || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text mb-4"
        >
          <ArrowLeft size={14} /> Kembali
        </Link>

        <div className="bg-light-sidebar dark:bg-dark-sidebar rounded-2xl border border-light-border dark:border-dark-border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text mb-1">Profile</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mb-6">Kelola informasi akun kamu</p>

          {/* Avatar + initial */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-light-border dark:border-dark-border">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-light-text dark:text-dark-text truncate">
                {profile?.display_name || user.email?.split("@")[0]}
              </p>
              <p className="text-sm text-light-muted dark:text-dark-muted truncate">{user.email}</p>
            </div>
          </div>

          {message && (
            <div className={`mb-4 flex items-start gap-2 p-3 rounded-lg text-sm border ${
              message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
            }`}>
              {message.type === "success" ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1.5">
                Nama Tampilan
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted" />
                <input
                  type="text"
                  placeholder="Nama kamu"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={saving}
                  maxLength={50}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input text-light-text dark:text-dark-text text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted" />
                <input
                  type="email"
                  value={user.email ?? ""}
                  disabled
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg text-light-muted dark:text-dark-muted text-sm cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-light-muted dark:text-dark-muted mt-1">Email tidak bisa diubah saat ini.</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50 text-white text-sm font-medium transition flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Simpan Perubahan
              </button>
              <Link
                href="/auth/reset"
                className="px-4 py-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg hover:bg-light-hover dark:hover:bg-dark-hover text-light-text dark:text-dark-text text-sm font-medium transition"
              >
                Ganti Password
              </Link>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-light-border dark:border-dark-border">
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 text-sm font-medium transition"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
