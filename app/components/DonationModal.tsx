"use client";

import { X, Heart, Crown, ExternalLink, Zap } from "lucide-react";
import {
  DONATION_DEADLINE_ISO,
  TRAKTEER_URL,
  LINKTEER_URL,
  formatIDR,
  type TopSupporter,
} from "@/lib/donation-config";
import { useDonation, useCountdown, type CountdownParts } from "@/hooks/useDonation";

interface DonationModalProps {
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

/** Accent ranking untuk Top Sultan: emas / perak / perunggu lalu netral. */
function rankAccent(rank: number): string {
  if (rank === 1) return "bg-amber-400/20 text-amber-600 dark:text-amber-300";
  if (rank === 2) return "bg-slate-400/20 text-slate-600 dark:text-slate-300";
  if (rank === 3) return "bg-orange-500/20 text-orange-600 dark:text-orange-300";
  return "bg-light-input dark:bg-dark-input text-light-muted dark:text-dark-muted";
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

export default function DonationModal({ isOpen, onClose }: DonationModalProps) {
  // Hanya fetch saat modal terbuka — supaya tidak mengganggu saat chatting.
  const { data, loading } = useDonation({ enabled: isOpen });
  const parts = useCountdown(data?.deadlineIso ?? DONATION_DEADLINE_ISO);

  if (!isOpen) return null;

  const goal = data?.goal ?? 0;
  const totalRaised = data?.totalRaised ?? 0;
  const percent =
    goal > 0 ? Math.min(100, (totalRaised / goal) * 100) : 0;
  const supporters: TopSupporter[] = data?.supporters ?? [];
  const trakteerUrl = data?.trakteerUrl ?? TRAKTEER_URL;
  const linkteerUrl = data?.linkteerUrl ?? LINKTEER_URL;
  const showInitialLoading = loading && !data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dukung server dmrxai"
        className="relative w-full max-w-lg max-h-[85vh] bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2.5">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Heart size={18} className="text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">
              Bantu dmrxai tetap gratis
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
          {/* Message */}
          <p className="text-sm text-light-muted dark:text-dark-muted leading-relaxed">
            dmrxai sudah beroperasi lebih dari 1 bulan tanpa meminta bantuan
            sepeser pun. Pada{" "}
            <strong className="text-light-text dark:text-dark-text">
              1 Juni 2026 pukul 07:00 WIB
            </strong>
            , server kemungkinan akan ditutup. Kalau kamu ingin dmrxai tetap
            gratis dan bisa terus diakses, bantu lewat Trakteer.
          </p>

          {/* Countdown */}
          <div>
            <p className="text-xs font-semibold text-light-text dark:text-dark-text mb-2">
              Sisa waktu
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

          {/* Top Sultan */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Crown size={16} className="text-amber-500" />
              <h3 className="text-sm font-bold text-light-text dark:text-dark-text">
                Top Sultan
              </h3>
            </div>
            {supporters.length === 0 ? (
              <div className="rounded-xl border border-dashed border-light-border dark:border-dark-border px-4 py-6 text-center">
                <p className="text-sm text-light-muted dark:text-dark-muted">
                  Belum ada donatur. Jadilah yang pertama!
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {supporters.map((s, i) => {
                  const rank = i + 1;
                  return (
                    <li
                      key={`${s.name}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-light-input dark:bg-dark-input"
                    >
                      <span
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${rankAccent(rank)}`}
                      >
                        {rank}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-light-text dark:text-dark-text">
                        {s.name}
                      </span>
                      <span className="flex-shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatIDR(s.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* CTA Footer */}
        <div className="px-6 py-4 border-t border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar flex flex-col gap-2">
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
            <span>Buka halaman Trakteer</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
