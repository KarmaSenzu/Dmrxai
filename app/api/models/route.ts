import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";
import { requireUser } from "@/lib/auth-server";
import { createLogger } from "@/lib/logger";
import { validateUrl, UrlGuardError, getAllowedHostsFromEnv } from "@/lib/url-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeUpstreamError } from "@/lib/sanitize-error";

const log = createLogger("api/models");

export const runtime = "edge";

// In-memory cache (per edge isolate). Avoids re-hitting the upstream provider
// for the same (baseUrl, apiKey) within the TTL. Fine for a single instance;
// multiple isolates will each warm independently.
type CacheEntry = { data: unknown; expiresAt: number };
const modelsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Bound the in-memory cache so we never balloon when many distinct
// (baseUrl, apiKey) pairs hit a single isolate. We approximate LRU by
// dropping the oldest insertion (Map preserves insertion order).
const MAX_CACHE = 100;
function cacheSet(key: string, value: CacheEntry) {
  if (modelsCache.size >= MAX_CACHE) {
    const firstKey = modelsCache.keys().next().value;
    if (firstKey) modelsCache.delete(firstKey);
  }
  modelsCache.set(key, value);
}

/**
 * Build a non-reversible cache fingerprint from the API key. Using a SHA-256
 * prefix (instead of the first 8 characters of the key itself) means an
 * attacker who somehow read the cache key cannot derive the key prefix —
 * a useful defense-in-depth bit even though the cache is in-process only.
 */
async function fingerprint(key: string): Promise<string> {
  if (!key) return "anon";
  const buf = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function POST(req: NextRequest) {
  try {
    log.info("POST", "Request received");

    // Auth gate — model listing is gated behind login.
    let user;
    try {
      user = await requireUser(req);
    } catch (response) {
      return response as Response;
    }

    // Rate limit: most calls hit the in-isolate cache, but we still bound bursts.
    const limited = enforceRateLimit(
      req,
      { limit: 60, windowMs: 60_000, prefix: "models" },
      user.id,
    );
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { apiKey: userApiKey, baseUrl: userBaseUrl } = body ?? {};

    // Server-side override kalau env di-set, kalau tidak fallback ke body.
    let apiKey: string;
    let baseUrl: string;
    try {
      const cfg = resolveAIConfig({
        apiKey: userApiKey,
        baseUrl: userBaseUrl,
      });
      apiKey = cfg.apiKey;
      baseUrl = cfg.baseUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid AI config";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required field: baseUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // SSRF guard: validate baseUrl points to a public AI provider host.
    try {
      validateUrl(baseUrl, {
        allowedHosts: getAllowedHostsFromEnv("ALLOWED_AI_HOSTS"),
      });
    } catch (e) {
      if (e instanceof UrlGuardError) {
        return new Response(
          JSON.stringify({ error: "Invalid baseUrl: " + e.code }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      throw e;
    }

    // Normalize base URL
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl}/models`;

    // Cache lookup keyed on (baseUrl + api-key fingerprint).
    const cacheKey = `${normalizedBaseUrl}::${await fingerprint(apiKey)}`;
    const cached = modelsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(JSON.stringify(cached.data), {
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    log.debug("POST", "Fetching models from provider", { endpoint });

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      return new Response(
        JSON.stringify({ error: `Failed to fetch models (${response.status}): ${sanitizeUpstreamError(errorMessage)}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Normalize various provider response shapes into { data: [{ id }] }.
    // - OpenAI-compatible: { data: [{ id, ... }, ...] }
    // - Some providers: a flat array of objects/strings
    // - Anthropic-style: { models: [...] } (defensive)
    let ids: string[] = [];

    if (data && Array.isArray(data.data)) {
      ids = data.data
        .map((m: any) => m?.id || m?.name || (typeof m === "string" ? m : ""))
        .filter((id: string) => id && id.length > 0);
    } else if (Array.isArray(data)) {
      ids = data
        .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name || ""))
        .filter((id: string) => id && id.length > 0);
    } else if (data && Array.isArray(data.models)) {
      ids = data.models
        .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name || ""))
        .filter((id: string) => id && id.length > 0);
    }

    ids.sort((a, b) => a.localeCompare(b));

    const responseData = { data: ids.map((id) => ({ id })) };

    // Cache successful response.
    cacheSet(cacheKey, {
      data: responseData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    log.error("POST", "Failed to fetch models", { error: String(error) });
    return new Response(
      JSON.stringify({ error: sanitizeUpstreamError(message) || "Failed to fetch models" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
