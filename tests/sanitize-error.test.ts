import { describe, it, expect } from "vitest";
import { sanitizeUpstreamError } from "@/lib/sanitize-error";

describe("sanitize-error", () => {
  describe("sanitizeUpstreamError", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeUpstreamError("")).toBe("");
    });

    it("returns empty string for falsy input", () => {
      // @ts-expect-error — exercising defensive branch
      expect(sanitizeUpstreamError(undefined)).toBe("");
      // @ts-expect-error — exercising defensive branch
      expect(sanitizeUpstreamError(null)).toBe("");
    });

    it("passes through plain text unchanged", () => {
      const msg = "Something went wrong";
      expect(sanitizeUpstreamError(msg)).toBe(msg);
    });

    it("redacts http URLs", () => {
      const msg = "Failed to fetch http://internal.api/v1/chat";
      const out = sanitizeUpstreamError(msg);
      expect(out).not.toContain("http://internal.api");
      expect(out).toContain("[url]");
    });

    it("redacts https URLs", () => {
      const msg = "Got 500 from https://provider.example.com/secret/endpoint?key=abc";
      const out = sanitizeUpstreamError(msg);
      expect(out).not.toContain("provider.example.com");
      expect(out).not.toContain("key=abc");
      expect(out).toContain("[url]");
    });

    it("redacts multiple URLs in a single message", () => {
      const msg =
        "Tried https://a.example.com then http://b.internal both failed";
      const out = sanitizeUpstreamError(msg);
      expect(out.match(/\[url\]/g)?.length).toBe(2);
      expect(out).not.toContain("a.example.com");
      expect(out).not.toContain("b.internal");
    });

    it("redacts absolute file paths", () => {
      const msg = "Error in /Users/secret/project/src/foo.ts at line 42";
      const out = sanitizeUpstreamError(msg);
      expect(out).not.toContain("/Users/secret");
      expect(out).toContain("[path]");
    });

    it("redacts multiple paths", () => {
      const msg = "Reading /etc/passwd failed; /var/log/app.log empty";
      const out = sanitizeUpstreamError(msg);
      expect(out).not.toContain("/etc/passwd");
      expect(out).not.toContain("/var/log/app.log");
      expect(out.match(/\[path\]/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it("redacts both URLs and paths in the same message", () => {
      const msg = "Fetch from https://api.example.com hit /tmp/cache/foo";
      const out = sanitizeUpstreamError(msg);
      expect(out).toContain("[url]");
      expect(out).toContain("[path]");
      expect(out).not.toContain("api.example.com");
      expect(out).not.toContain("/tmp/cache");
    });

    it("clamps length to 200 chars", () => {
      const msg = "x".repeat(5000);
      const out = sanitizeUpstreamError(msg);
      expect(out.length).toBeLessThanOrEqual(200);
    });

    it("clamps after substitution so long URLs don't blow the budget", () => {
      const longUrl = "https://example.com/" + "a".repeat(5000);
      const msg = `Error: ${longUrl}`;
      const out = sanitizeUpstreamError(msg);
      expect(out.length).toBeLessThanOrEqual(200);
      expect(out).toContain("[url]");
    });

    it("preserves error type prefixes when present", () => {
      const msg = "TypeError: Cannot read properties of undefined";
      const out = sanitizeUpstreamError(msg);
      expect(out).toContain("TypeError");
    });
  });
});
