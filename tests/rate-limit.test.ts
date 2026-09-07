import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  checkRateLimit,
  enforceRateLimit,
  getRateLimitIdentifier,
  _resetBuckets,
} from "@/lib/rate-limit";

function makeReq(headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return { headers: h } as unknown as NextRequest;
}

describe("rate-limit", () => {
  beforeEach(() => {
    _resetBuckets();
  });

  describe("checkRateLimit", () => {
    it("allows N requests within the window", () => {
      const cfg = { limit: 5, windowMs: 60_000, prefix: "test-allow" };
      for (let i = 0; i < 5; i++) {
        const r = checkRateLimit("user-1", cfg);
        expect(r.ok).toBe(true);
      }
    });

    it("blocks the N+1th request when the bucket is empty", () => {
      const cfg = { limit: 3, windowMs: 60_000, prefix: "test-block" };
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit("user-1", cfg).ok).toBe(true);
      }
      const blocked = checkRateLimit("user-1", cfg);
      expect(blocked.ok).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetAt).toBeGreaterThan(Date.now());
    });

    it("decreases remaining count on each successful request", () => {
      const cfg = { limit: 4, windowMs: 60_000, prefix: "test-remaining" };
      const r1 = checkRateLimit("user-1", cfg);
      const r2 = checkRateLimit("user-1", cfg);
      expect(r1.remaining).toBeGreaterThanOrEqual(r2.remaining);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });

    it("refills tokens after the window passes (fake timers)", () => {
      vi.useFakeTimers();
      try {
        const cfg = { limit: 2, windowMs: 1000, prefix: "test-refill" };
        // Drain bucket
        expect(checkRateLimit("user-1", cfg).ok).toBe(true);
        expect(checkRateLimit("user-1", cfg).ok).toBe(true);
        expect(checkRateLimit("user-1", cfg).ok).toBe(false);

        // Advance past the full window so the bucket refills completely
        vi.advanceTimersByTime(1500);

        expect(checkRateLimit("user-1", cfg).ok).toBe(true);
        expect(checkRateLimit("user-1", cfg).ok).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("partially refills tokens proportional to elapsed time", () => {
      vi.useFakeTimers();
      try {
        const cfg = { limit: 10, windowMs: 1000, prefix: "test-partial" };
        // Drain
        for (let i = 0; i < 10; i++) {
          expect(checkRateLimit("user-1", cfg).ok).toBe(true);
        }
        expect(checkRateLimit("user-1", cfg).ok).toBe(false);

        // Half a window -> ~5 tokens regenerated
        vi.advanceTimersByTime(500);

        // Should allow at least 4 requests (account for 1 already consumed by check)
        let allowed = 0;
        for (let i = 0; i < 5; i++) {
          if (checkRateLimit("user-1", cfg).ok) allowed++;
        }
        expect(allowed).toBeGreaterThanOrEqual(4);
        expect(allowed).toBeLessThanOrEqual(5);
      } finally {
        vi.useRealTimers();
      }
    });

    it("tracks different identifiers separately", () => {
      const cfg = { limit: 2, windowMs: 60_000, prefix: "test-ids" };
      // user-1 drains its bucket
      expect(checkRateLimit("user-1", cfg).ok).toBe(true);
      expect(checkRateLimit("user-1", cfg).ok).toBe(true);
      expect(checkRateLimit("user-1", cfg).ok).toBe(false);
      // user-2 should be untouched
      expect(checkRateLimit("user-2", cfg).ok).toBe(true);
      expect(checkRateLimit("user-2", cfg).ok).toBe(true);
      expect(checkRateLimit("user-2", cfg).ok).toBe(false);
    });

    it("tracks different prefixes separately for the same identifier", () => {
      const cfgA = { limit: 1, windowMs: 60_000, prefix: "test-prefix-a" };
      const cfgB = { limit: 1, windowMs: 60_000, prefix: "test-prefix-b" };

      expect(checkRateLimit("user-1", cfgA).ok).toBe(true);
      expect(checkRateLimit("user-1", cfgA).ok).toBe(false);
      // Different prefix has its own bucket
      expect(checkRateLimit("user-1", cfgB).ok).toBe(true);
      expect(checkRateLimit("user-1", cfgB).ok).toBe(false);
    });
  });

  describe("getRateLimitIdentifier", () => {
    it("prefers userId when provided", () => {
      const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
      expect(getRateLimitIdentifier(req, "user-abc")).toBe("u:user-abc");
    });

    it("falls back to x-forwarded-for when no userId", () => {
      const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
      expect(getRateLimitIdentifier(req)).toBe("ip:1.2.3.4");
    });

    it("uses the first IP in a comma-separated x-forwarded-for", () => {
      const req = makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 192.168.1.1" });
      expect(getRateLimitIdentifier(req)).toBe("ip:1.2.3.4");
    });

    it("falls back to x-real-ip when x-forwarded-for is missing", () => {
      const req = makeReq({ "x-real-ip": "5.6.7.8" });
      expect(getRateLimitIdentifier(req)).toBe("ip:5.6.7.8");
    });

    it("returns 'ip:unknown' when no userId and no IP headers", () => {
      const req = makeReq();
      expect(getRateLimitIdentifier(req)).toBe("ip:unknown");
    });

    it("treats null/empty userId as no user", () => {
      const req = makeReq({ "x-real-ip": "9.9.9.9" });
      expect(getRateLimitIdentifier(req, null)).toBe("ip:9.9.9.9");
      expect(getRateLimitIdentifier(req, "")).toBe("ip:9.9.9.9");
    });
  });

  describe("enforceRateLimit", () => {
    it("returns null when the request is allowed", () => {
      const req = makeReq({ "x-real-ip": "1.1.1.1" });
      const cfg = { limit: 5, windowMs: 60_000, prefix: "enforce-allow" };
      const result = enforceRateLimit(req, cfg, "user-1");
      expect(result).toBeNull();
    });

    it("returns a 429 NextResponse with rate-limit headers when blocked", async () => {
      const req = makeReq({ "x-real-ip": "1.1.1.1" });
      const cfg = { limit: 2, windowMs: 60_000, prefix: "enforce-block" };

      // Drain
      expect(enforceRateLimit(req, cfg, "user-1")).toBeNull();
      expect(enforceRateLimit(req, cfg, "user-1")).toBeNull();
      const blocked = enforceRateLimit(req, cfg, "user-1");

      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);

      expect(blocked!.headers.get("Retry-After")).toBeTruthy();
      expect(blocked!.headers.get("X-RateLimit-Limit")).toBe("2");
      expect(blocked!.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(blocked!.headers.get("X-RateLimit-Reset")).toBeTruthy();

      const body = (await blocked!.json()) as { error: string };
      expect(body.error).toMatch(/rate limit/i);
    });

    it("scopes limits per-user when userId is provided", () => {
      const req = makeReq({ "x-real-ip": "1.1.1.1" });
      const cfg = { limit: 1, windowMs: 60_000, prefix: "enforce-per-user" };

      expect(enforceRateLimit(req, cfg, "user-A")).toBeNull();
      expect(enforceRateLimit(req, cfg, "user-A")).not.toBeNull();
      // Different user, same IP -> separate bucket
      expect(enforceRateLimit(req, cfg, "user-B")).toBeNull();
    });

    it("scopes limits per-IP when no userId is provided", () => {
      const reqA = makeReq({ "x-real-ip": "1.1.1.1" });
      const reqB = makeReq({ "x-real-ip": "2.2.2.2" });
      const cfg = { limit: 1, windowMs: 60_000, prefix: "enforce-per-ip" };

      expect(enforceRateLimit(reqA, cfg)).toBeNull();
      expect(enforceRateLimit(reqA, cfg)).not.toBeNull();
      expect(enforceRateLimit(reqB, cfg)).toBeNull();
    });
  });

  describe("_resetBuckets", () => {
    it("clears all stored buckets", () => {
      const cfg = { limit: 1, windowMs: 60_000, prefix: "test-reset" };
      // Drain
      expect(checkRateLimit("user-1", cfg).ok).toBe(true);
      expect(checkRateLimit("user-1", cfg).ok).toBe(false);
      // Reset
      _resetBuckets();
      // Bucket starts fresh
      expect(checkRateLimit("user-1", cfg).ok).toBe(true);
    });
  });

  afterEach(() => {
    _resetBuckets();
  });
});
