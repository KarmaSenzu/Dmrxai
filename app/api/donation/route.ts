// app/api/donation/route.ts
//
// Endpoint publik untuk widget "support the server" (donasi).
// Mengambil data supports dari Trakteer Public API, menghitung total
// terkumpul + top supporters, lalu mengembalikan DonationData.
//
// - Tanpa TRAKTEER_API_KEY: tetap balikan struktur valid (configured: false)
//   supaya UI bisa render Rp 0 tanpa error.
// - Dengan key: fetch + agregasi, dengan in-memory cache (TTL 60s) untuk
//   mengurangi hit ke Trakteer (Cloudflare-fronted).
//
// TIDAK pernah mengembalikan API key di response.

import { NextResponse } from "next/server";
import {
  DONATION_GOAL,
  DONATION_DEADLINE_ISO,
  TRAKTEER_URL,
  LINKTEER_URL,
  type DonationData,
  type TopSupporter,
} from "@/lib/donation-config";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TRAKTEER_API_BASE = "https://api.trakteer.id/v1/public";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const PER_PAGE = 100;
const MAX_PAGES = 10;

// In-memory cache di module scope.
let cache: { data: DonationData; ts: number } | null = null;

interface TrakteerSupport {
  creator_name?: string;
  supporter_name?: string;
  support_message?: string;
  quantity?: number;
  amount?: number;
  unit_name?: string;
  status?: string;
  updated_at?: string;
}

interface TrakteerPagination {
  total?: number;
  count?: number;
  per_page?: number;
  current_page?: number;
  total_page?: number;
}

interface TrakteerResponse {
  status?: string;
  status_code?: number;
  result?: {
    data?: TrakteerSupport[];
    meta?: { pagination?: TrakteerPagination };
  } | null;
}

/** Bangun DonationData "kosong" yang konsisten. */
function buildBase(
  configured: boolean,
  overrides: Partial<DonationData> = {}
): DonationData {
  return {
    totalRaised: 0,
    goal: DONATION_GOAL,
    supporters: [],
    deadlineIso: DONATION_DEADLINE_ISO,
    trakteerUrl: TRAKTEER_URL,
    linkteerUrl: LINKTEER_URL,
    configured,
    lastUpdated: Date.now(),
    ...overrides,
  };
}

/** Coerce ke number yang aman (NaN/Infinity -> 0). */
function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tentukan apakah sebuah support dianggap "berhasil".
 * Per docs: status bisa success | pending | failed | refund.
 * - undefined (field tidak ada) -> treat as success (contoh docs lain omit status).
 * - "success" -> success.
 * - selain itu (termasuk "" / pending / failed / refund) -> NOT success.
 */
const isSuccess = (s?: string): boolean => s === undefined || s === "success";

export async function GET() {
  // 1. Serve dari cache kalau masih fresh.
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const apiKey = process.env.TRAKTEER_API_KEY?.trim();

  // 2. Tanpa key -> struktur valid, configured: false.
  if (!apiKey) {
    const data = buildBase(false);
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  }

  // 3. Dengan key -> fetch + agregasi.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers = {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      key: apiKey,
    };

    const collected: TrakteerSupport[] = [];
    let totalPage = 1;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${TRAKTEER_API_BASE}/supports?limit=${PER_PAGE}&page=${page}`;
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Trakteer returned ${res.status}`);
      }

      const json = (await res.json()) as TrakteerResponse;

      if (json?.status !== "success" || !json.result) {
        throw new Error("Trakteer response status not success");
      }

      const items = Array.isArray(json.result.data) ? json.result.data : [];
      collected.push(...items);

      // Selalu berhenti kalau halaman ini kosong.
      if (items.length === 0) break;

      const pagination = json.result.meta?.pagination;
      const reportedTotalPage = safeNumber(pagination?.total_page);
      if (reportedTotalPage > 0) {
        // Meta pagination tersedia: pakai total_page untuk stop.
        totalPage = reportedTotalPage;
        if (page >= totalPage) break;
      } else {
        // Meta pagination ABSENT: heuristik halaman terakhir.
        // Berhenti kalau item < PER_PAGE (artinya ini halaman terakhir).
        if (items.length < PER_PAGE) break;
      }
    }

    // Total terkumpul: hanya item yang sukses.
    let totalRaised = 0;
    for (const item of collected) {
      if (!isSuccess(item?.status)) continue;
      totalRaised += safeNumber(item?.amount);
    }

    // Agregasi per nama: hanya item yang sukses.
    // Nama: creator_name dulu, fallback supporter_name, lalu "Anonim".
    const byName = new Map<string, number>();
    for (const item of collected) {
      if (!isSuccess(item?.status)) continue;
      const rawName = (item?.creator_name ?? item?.supporter_name ?? "").trim();
      const name = rawName || "Anonim";
      const amount = safeNumber(item?.amount);
      byName.set(name, (byName.get(name) ?? 0) + amount);
    }

    const supporters: TopSupporter[] = Array.from(byName.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const data = buildBase(true, { totalRaised, supporters });
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    // 4. Error apapun -> graceful, jangan throw / jangan 500 client.
    const data = buildBase(true, { error: "Gagal memuat data donasi" });
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } finally {
    clearTimeout(timeout);
  }
}
