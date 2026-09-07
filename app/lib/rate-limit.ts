import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("rate-limit");

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup stale buckets periodically (only on server)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min
const STALE_AFTER = 60 * 60 * 1000; // 1 hour
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer || typeof setInterval === "undefined") return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    buckets.forEach((v, k) => {
      if (now - v.lastRefill > STALE_AFTER) buckets.delete(k);
    });
  }, CLEANUP_INTERVAL);
  // Don't keep process alive
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window in milliseconds */
  windowMs: number;
  /** Custom key prefix to scope buckets */
  prefix?: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Token-bucket rate limit check.
 * Identifier should uniquely identify the caller (user id, IP, etc.).
 */
export function checkRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  ensureCleanup();
  const key = `${config.prefix ?? "default"}:${identifier}`;
  const now = Date.now();
  const refillRate = config.limit / config.windowMs; // tokens per ms

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.limit, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = elapsed * refillRate;
  bucket.tokens = Math.min(config.limit, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + Math.ceil((config.limit - bucket.tokens) / refillRate),
    };
  }

  return {
    ok: false,
    remaining: 0,
    resetAt: now + Math.ceil((1 - bucket.tokens) / refillRate),
  };
}

/**
 * Get a stable identifier for the request.
 * Prefer user id, fallback to IP from headers.
 */
export function getRateLimitIdentifier(req: NextRequest, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  // Try common proxy headers
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return `ip:${fwd.split(",")[0].trim()}`;
  const real = req.headers.get("x-real-ip");
  if (real) return `ip:${real.trim()}`;
  return "ip:unknown";
}

/**
 * Apply rate limit to a request. Returns null if allowed,
 * or a NextResponse with 429 if blocked.
 */
export function enforceRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  userId?: string | null
): NextResponse | null {
  const id = getRateLimitIdentifier(req, userId);
  const result = checkRateLimit(id, { ...config, prefix: config.prefix ?? "api" });

  if (!result.ok) {
    log.warn("enforceRateLimit", "Rate limit exceeded", { id, prefix: config.prefix });
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
        },
      }
    );
  }
  return null;
}

// Test helpers
export function _resetBuckets() {
  buckets.clear();
}
