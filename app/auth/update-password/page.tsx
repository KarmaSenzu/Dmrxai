"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Hold the success-redirect timer so we can cancel it on unmount; the
  // user might navigate away before the 2s window elapses, in which case
  // we don't want a stale router.push firing post-unmount.
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Password tidak sama");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      redirectTimerRef.current = setTimeout(() => {
        redirectTimerRef.current = null;
        router.push("/");
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-light-bg to-light-sidebar dark:from-dark-bg dark:to-dark-sidebar p-4">
      <div className="w-full max-w-md">
        <div className="bg-light-sidebar dark:bg-dark-sidebar rounded-2xl shadow-xl border border-light-border dark:border-dark-border p-8">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text mb-2">Set Password Baru</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mb-6">
            Masukkan password baru untuk akunmu.
          </p>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>Password berhasil diubah. Mengarahkan ke beranda...</span>
            </div>
          )}

          {!success && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Password baru"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input text-light-text dark:text-dark-text text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Konfirmasi password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input text-light-text dark:text-dark-text text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50 text-white text-sm font-medium transition"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
