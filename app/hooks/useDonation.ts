"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DonationData } from "@/lib/donation-config";

/** Sisa waktu menuju deadline, dipecah jadi komponen yang siap dirender. */
export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Hitung CountdownParts dari "sekarang" sampai deadline. Negatif -> expired. */
function computeParts(deadlineMs: number): CountdownParts {
  const diff = deadlineMs - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const days = Math.floor(diff / MS_PER_DAY);
  const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((diff % MS_PER_MINUTE) / MS_PER_SECOND);
  return { days, hours, minutes, seconds, expired: false };
}

/**
 * Live countdown menuju `deadlineIso`. Re-compute tiap 1 detik via setInterval
 * dan dibersihkan saat unmount. Negatif di-clamp ke 0 dengan expired = true.
 */
export function useCountdown(deadlineIso: string): CountdownParts {
  const deadlineMs = Date.parse(deadlineIso);

  const [parts, setParts] = useState<CountdownParts>(() => {
    if (Number.isNaN(deadlineMs)) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    return computeParts(deadlineMs);
  });

  useEffect(() => {
    if (Number.isNaN(deadlineMs)) {
      setParts({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
      return;
    }

    // Sinkronkan langsung saat deadline berubah, lalu tick tiap detik.
    setParts(computeParts(deadlineMs));
    const id = setInterval(() => {
      setParts(computeParts(deadlineMs));
    }, MS_PER_SECOND);

    return () => clearInterval(id);
  }, [deadlineMs]);

  return parts;
}

export interface UseDonationOptions {
  /** Saat false, hook tidak melakukan fetch apa pun. Default: true. */
  enabled?: boolean;
}

export interface UseDonationResult {
  data: DonationData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Ambil data donasi dari GET /api/donation dan poll tiap 60 detik
 * (selaras dengan cache TTL server). Hanya aktif saat `enabled`.
 */
export function useDonation(options: UseDonationOptions = {}): UseDonationResult {
  const { enabled = true } = options;

  const [data, setData] = useState<DonationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController untuk fetch yang sedang berjalan, supaya bisa dibatalkan
  // saat unmount / refetch berikutnya tanpa set state pada komponen lepas.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Batalkan request sebelumnya kalau masih in-flight.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/donation", { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Gagal memuat data donasi (${res.status})`);
      }
      const json = (await res.json()) as DonationData;
      if (!controller.signal.aborted) {
        setData(json);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Gagal memuat data donasi");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    if (!enabled) return;
    void fetchData();
  }, [enabled, fetchData]);

  useEffect(() => {
    if (!enabled) return;

    void fetchData();
    const id = setInterval(() => {
      void fetchData();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [enabled, fetchData]);

  return { data, loading, error, refresh };
}
