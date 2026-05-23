import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SEARXNG_URL = process.env.SEARXNG_URL || "http://searxng:8080";
const FETCH_TIMEOUT_MS = 15_000;
const SNIPPET_CAP = 1500;

interface SearxResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
}

interface NormalizedResult {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query: unknown = body?.query;
    let count: number = typeof body?.count === "number" ? body.count : 8;

    if (typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({ error: "Invalid query" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    count = Math.max(1, Math.min(15, Math.floor(count)));

    const searchUrl = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&safesearch=0&language=auto`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(searchUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; DmrxAI-Bot/1.0)",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Search returned ${response.status}`,
          results: [],
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawResults: SearxResult[] = Array.isArray(data?.results) ? data.results : [];

    const normalized: NormalizedResult[] = [];
    for (const r of rawResults) {
      if (!r.url || !r.title) continue;
      const snippet = (r.content || "").slice(0, SNIPPET_CAP);
      normalized.push({
        title: r.title,
        url: r.url,
        snippet,
        engine: r.engine || "unknown",
      });
      if (normalized.length >= count) break;
    }

    return new Response(
      JSON.stringify({
        query: query.trim(),
        results: normalized,
        count: normalized.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Search failed";
    return new Response(
      JSON.stringify({ error: `Search unavailable: ${message}`, results: [] }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
