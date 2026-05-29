"use client";

import { X, Heart, Zap, ExternalLink, Sparkles } from "lucide-react";
import {
  DONATION_DEADLINE_ISO,
  DONATION_GOAL,
  TRAKTEER_URL,
  LINKTEER_URL,
  formatIDR,
} from "@/lib/donation-config";
import { useDonation, useCountdown, type CountdownParts } from "@/hooks/useDonation";

interface DonationAlertProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Satu kotak angka countdown (Hari / Jam / Menit / Detik). */
function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border py-3">
      <span className="text-2xl font-bold tabular-nums text-light-text dark:text-dark-text">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-light-muted dark:text-dark-muted mt-0.5">
        {label}
      </span>
    </div>
  );
}

function Countdown({ parts }: { parts: CountdownParts }) {
  if (parts.expired) {
    return (
      <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-center">
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          Waktu habis
        </p>
        <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
          Deadline donasi telah lewat.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      <CountdownBox value={parts.days} label="Hari" />
      <CountdownBox value={parts.hours} label="Jam" />
      <CountdownBox value={parts.minutes} label="Menit" />
      <CountdownBox value={parts.seconds} label="Detik" />
    </div>
  );
}

/**
 * Alert donasi yang muncul otomatis setiap kali masuk app (login maupun chat).
 * Sengaja sedikit intrusif — bisa ditutup, tapi tampil lagi tiap reload.
 */
export default function DonationAlert({ isOpen, onClose }: DonationAlertProps) {
  // Hanya fetch saat alert terbuka.
  const { data, loading } = useDonation({ enabled: isOpen });
  const parts = useCountdown(data?.deadlineIso ?? DONATION_DEADLINE_ISO);

  if (!isOpen) return null;

  const goal = data?.goal ?? DONATION_GOAL;
  const totalRaised = data?.totalRaised ?? 0;
  const percent = goal > 0 ? Math.min(100, (totalRaised / goal) * 100) : 0;
  const trakteerUrl = data?.trakteerUrl ?? TRAKTEER_URL;
  const linkteerUrl = data?.linkteerUrl ?? LINKTEER_URL;
  const showInitialLoading = loading && !data;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bantu Kami Tetap Gratis"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-2xl shadow-2xl"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted transition-colors z-10"
        >
          <X size={20} />
        </button>

        <div className="px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-2.5 pr-10">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Sparkles size={18} className="text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">
              Bantu Kami Tetap Gratis
            </h2>
          </div>

          {/* Intro / selling copy */}
          <p className="text-sm font-medium text-light-text dark:text-dark-text leading-relaxed">
            Semua fitur dmrxai 100% gratis untuk uji coba. Tidak ada API key,
            tidak ada batas harian, akses penuh ke Claude Opus dan model premium
            lainnya.
          </p>

          {/* The ask */}
          <p className="text-sm text-light-muted dark:text-dark-muted leading-relaxed">
            dmrxai sudah berjalan lebih dari 1 bulan tanpa meminta bantuan. Pada{" "}
            <strong className="text-light-text dark:text-dark-text">
              1 Juni 2026 pukul 07:00 WIB
            </strong>{" "}
            server kemungkinan ditutup kalau tidak ada dukungan. Bantu lewat
            Trakteer supaya dmrxai tetap gratis dan bisa terus diakses.
          </p>

          {/* Countdown */}
          <div>
            <p className="text-xs font-semibold text-light-text dark:text-dark-text mb-2">
              Sisa waktu menuju deadline
            </p>
            <Countdown parts={parts} />
          </div>

          {/* Progress */}
          <div>
            {showInitialLoading ? (
              <div className="flex items-center gap-3 py-2">
                <div className="w-5 h-5 border-2 border-light-accent dark:border-dark-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-light-muted dark:text-dark-muted">
                  Memuat data donasi...
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-semibold text-light-text dark:text-dark-text">
                    Terkumpul
                  </span>
                  <span className="text-sm font-medium text-light-text dark:text-dark-text tabular-nums">
                    {formatIDR(totalRaised)}{" "}
                    <span className="text-light-muted dark:text-dark-muted font-normal">
                      / {formatIDR(goal)}
                    </span>
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-light-input dark:bg-dark-input overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-light-muted dark:text-dark-muted tabular-nums">
                    {percent.toFixed(1)}%
                  </span>
                  {data?.configured === false && (
                    <span className="text-[11px] text-light-muted dark:text-dark-muted">
                      Data donasi belum tersambung
                    </span>
                  )}
                  {data?.error && (
                    <span className="text-[11px] text-rose-500/70">
                      {data.error}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2">
            {/* Primary: langsung ke popup pembayaran */}
            <a
              href={linkteerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/25"
            >
              <Zap size={18} />
              <span>Bantu Sekarang</span>
            </a>
            {/* Secondary: buka halaman Trakteer */}
            <a
              href={trakteerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted font-medium hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
            >
              <Heart size={16} />
              <span>Dukung via Trakteer</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
