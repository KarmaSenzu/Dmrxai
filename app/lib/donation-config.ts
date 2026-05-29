// app/lib/donation-config.ts
//
// Konfigurasi & tipe untuk fitur "support the server" (donasi via Trakteer).
// Dipakai oleh API route /api/donation dan komponen UI donasi.
//
// Tidak ada secret di sini — API key Trakteer hanya dibaca di server route.

/** Target donasi (IDR). */
export const DONATION_GOAL = 1_000_000;

/** Deadline donasi: 1 Juni 2026, 07:00 WIB. */
export const DONATION_DEADLINE_ISO = "2026-06-01T07:00:00+07:00";

/** Link halaman Trakteer publik. */
export const TRAKTEER_URL = "https://teer.id/karma_senizu";

/** Link LinkTeer langsung ke popup pembayaran (skip langkah pilih unit). */
export const LINKTEER_URL = "https://trakteer.id/karma_senizu/tip?open=true";

export interface TopSupporter {
  name: string;
  amount: number;
  avatar?: string;
}

export interface DonationData {
  totalRaised: number;
  goal: number;
  supporters: TopSupporter[];
  deadlineIso: string;
  trakteerUrl: string;
  linkteerUrl: string;
  configured: boolean;
  lastUpdated: number;
  error?: string;
}

/**
 * Format angka jadi Rupiah Indonesia, mis. "Rp 1.000.000".
 * Aman dipakai di server maupun client (Intl tersedia di keduanya).
 * Guard NaN/Infinity supaya output tetap valid.
 */
export function formatIDR(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
