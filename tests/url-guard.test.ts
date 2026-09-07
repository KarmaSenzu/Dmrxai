import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  validateUrl,
  isUrlSafe,
  getAllowedHostsFromEnv,
  UrlGuardError,
} from "@/lib/url-guard";

describe("url-guard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Default to production for the SSRF blocking tests so the dev-mode
    // private-host allowance does not mask the blocking behavior. Tests
    // that need the dev-mode behavior set NODE_ENV explicitly.
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_PRIVATE_AI_HOSTS;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("validateUrl", () => {
    describe("valid URLs", () => {
      it("accepts a public HTTPS URL", () => {
        const url = validateUrl("https://api.openai.com/v1/chat/completions");
        expect(url.hostname).toBe("api.openai.com");
        expect(url.protocol).toBe("https:");
      });

      it("accepts a public HTTPS URL with port and path", () => {
        const url = validateUrl("https://example.com:8443/path?q=1");
        expect(url.hostname).toBe("example.com");
      });

      it("accepts a non-localhost subdomain", () => {
        const url = validateUrl("https://api.example.org");
        expect(url.hostname).toBe("api.example.org");
      });
    });

    describe("protocol enforcement", () => {
      it("blocks http:// in production", () => {
        expect(() => validateUrl("http://example.com")).toThrow(UrlGuardError);
        try {
          validateUrl("http://example.com");
        } catch (e) {
          expect((e as UrlGuardError).code).toBe("PROTOCOL_BLOCKED");
        }
      });

      it("allows http:// outside production", () => {
        vi.stubEnv("NODE_ENV", "development");
        const url = validateUrl("http://example.com");
        expect(url.protocol).toBe("http:");
      });

      it("allows http:// when allowHttp is true", () => {
        const url = validateUrl("http://example.com", { allowHttp: true });
        expect(url.protocol).toBe("http:");
      });

      it("blocks file:// scheme", () => {
        expect(() => validateUrl("file:///etc/passwd")).toThrow(UrlGuardError);
      });

      it("blocks ftp:// scheme", () => {
        expect(() => validateUrl("ftp://example.com")).toThrow(UrlGuardError);
      });

      it("blocks gopher:// scheme", () => {
        expect(() => validateUrl("gopher://example.com:70/")).toThrow(UrlGuardError);
      });
    });

    describe("invalid URL format", () => {
      it("throws INVALID_URL for non-URL string", () => {
        try {
          validateUrl("not a url");
          throw new Error("expected throw");
        } catch (e) {
          expect(e).toBeInstanceOf(UrlGuardError);
          expect((e as UrlGuardError).code).toBe("INVALID_URL");
        }
      });

      it("throws INVALID_URL for empty string", () => {
        expect(() => validateUrl("")).toThrow(UrlGuardError);
      });
    });

    describe("blocked hostnames", () => {
      it("blocks localhost", () => {
        expect(() => validateUrl("https://localhost/x")).toThrow(/blocked/i);
      });

      it("blocks 127.0.0.1", () => {
        expect(() => validateUrl("https://127.0.0.1/x")).toThrow(UrlGuardError);
      });

      it("blocks 127.x.x.x range", () => {
        expect(() => validateUrl("https://127.10.20.30/x")).toThrow(UrlGuardError);
      });

      it("blocks 0.0.0.0", () => {
        expect(() => validateUrl("https://0.0.0.0/x")).toThrow(UrlGuardError);
      });

      it("blocks IPv6 loopback ::1", () => {
        expect(() => validateUrl("https://[::1]/x")).toThrow(UrlGuardError);
      });
    });

    describe("private IP ranges", () => {
      it("blocks 10.x.x.x", () => {
        expect(() => validateUrl("https://10.0.0.1/x")).toThrow(UrlGuardError);
        expect(() => validateUrl("https://10.255.255.255/x")).toThrow(UrlGuardError);
      });

      it("blocks 192.168.x.x", () => {
        expect(() => validateUrl("https://192.168.1.1/x")).toThrow(UrlGuardError);
      });

      it("blocks 172.16-31.x.x", () => {
        expect(() => validateUrl("https://172.16.0.1/x")).toThrow(UrlGuardError);
        expect(() => validateUrl("https://172.20.5.5/x")).toThrow(UrlGuardError);
        expect(() => validateUrl("https://172.31.255.255/x")).toThrow(UrlGuardError);
      });

      it("does NOT block 172.15.x.x or 172.32.x.x (outside private range)", () => {
        expect(() => validateUrl("https://172.15.0.1/x")).not.toThrow();
        expect(() => validateUrl("https://172.32.0.1/x")).not.toThrow();
      });

      it("blocks 169.254.x.x link-local", () => {
        expect(() => validateUrl("https://169.254.169.254/latest/meta-data/")).toThrow(UrlGuardError);
      });
    });

    describe("IPv6 ranges", () => {
      it("blocks IPv6 link-local fe80::", () => {
        expect(() => validateUrl("https://[fe80::1]/x")).toThrow(UrlGuardError);
      });

      it("blocks IPv6 ULA fc00::", () => {
        expect(() => validateUrl("https://[fc00::1]/x")).toThrow(UrlGuardError);
      });

      it("blocks IPv6 ULA fd00::", () => {
        expect(() => validateUrl("https://[fd00::1]/x")).toThrow(UrlGuardError);
      });

      it("blocks IPv4-mapped IPv6 ::ffff:127.0.0.1", () => {
        expect(() => validateUrl("https://[::ffff:127.0.0.1]/x")).toThrow(UrlGuardError);
      });
    });

    describe("decimal IP encoding", () => {
      it("blocks decimal-encoded IPs", () => {
        // 2130706433 = 127.0.0.1 in decimal
        expect(() => validateUrl("https://2130706433/x")).toThrow(UrlGuardError);
      });
    });

    describe("private host allowance (development / opt-in)", () => {
      it("permits localhost in development by default", () => {
        vi.stubEnv("NODE_ENV", "development");
        const url = validateUrl("http://localhost:1234/v1");
        expect(url.hostname).toBe("localhost");
      });

      it("permits 127.0.0.1 in development by default", () => {
        vi.stubEnv("NODE_ENV", "development");
        const url = validateUrl("http://127.0.0.1:8000/api");
        expect(url.hostname).toBe("127.0.0.1");
      });

      it("permits 192.168.x.x in development by default", () => {
        vi.stubEnv("NODE_ENV", "development");
        const url = validateUrl("http://192.168.1.50:8080/api");
        expect(url.hostname).toBe("192.168.1.50");
      });

      it("permits private hosts in production when ALLOW_PRIVATE_AI_HOSTS=1", () => {
        process.env.ALLOW_PRIVATE_AI_HOSTS = "1";
        const url = validateUrl("http://localhost:1234/api", { allowHttp: true });
        expect(url.hostname).toBe("localhost");
      });

      it("blocks private hosts when allowPrivate=false even in development", () => {
        vi.stubEnv("NODE_ENV", "development");
        expect(() =>
          validateUrl("http://localhost", { allowPrivate: false })
        ).toThrow(UrlGuardError);
      });

      it("explicit allowPrivate=true overrides production default", () => {
        const url = validateUrl("https://10.0.0.1/api", { allowPrivate: true });
        expect(url.hostname).toBe("10.0.0.1");
      });
    });

    describe("allowlist mode", () => {
      it("permits exact match", () => {
        const url = validateUrl("https://api.openai.com/v1", {
          allowedHosts: ["api.openai.com"],
        });
        expect(url.hostname).toBe("api.openai.com");
      });

      it("permits subdomain match", () => {
        const url = validateUrl("https://eu.api.openai.com/v1", {
          allowedHosts: ["openai.com"],
        });
        expect(url.hostname).toBe("eu.api.openai.com");
      });

      it("rejects host not in allowlist", () => {
        try {
          validateUrl("https://evil.com", {
            allowedHosts: ["api.openai.com"],
          });
          throw new Error("expected throw");
        } catch (e) {
          expect(e).toBeInstanceOf(UrlGuardError);
          expect((e as UrlGuardError).code).toBe("HOST_NOT_ALLOWED");
        }
      });

      it("does NOT match a partial suffix of a different domain", () => {
        // "openai.com" should NOT match "evilopenai.com"
        expect(() =>
          validateUrl("https://evilopenai.com", {
            allowedHosts: ["openai.com"],
          })
        ).toThrow(UrlGuardError);
      });

      it("ignores allowlist when empty array passed (falls through to blocklist)", () => {
        // Empty allowlist treated as "no allowlist" — uses default blocklist.
        const url = validateUrl("https://example.com", { allowedHosts: [] });
        expect(url.hostname).toBe("example.com");
      });
    });

    describe("error metadata", () => {
      it("UrlGuardError carries a code property", () => {
        try {
          validateUrl("https://localhost");
          throw new Error("expected throw");
        } catch (e) {
          expect(e).toBeInstanceOf(UrlGuardError);
          expect((e as UrlGuardError).code).toBe("HOST_BLOCKED");
          expect((e as UrlGuardError).name).toBe("UrlGuardError");
        }
      });
    });
  });

  describe("isUrlSafe", () => {
    it("returns true for valid public HTTPS URL", () => {
      expect(isUrlSafe("https://api.openai.com/v1")).toBe(true);
    });

    it("returns false for blocked host without throwing", () => {
      expect(isUrlSafe("https://127.0.0.1/x")).toBe(false);
    });

    it("returns false for invalid URL without throwing", () => {
      expect(isUrlSafe("garbage")).toBe(false);
    });

    it("respects allowedHosts option", () => {
      expect(
        isUrlSafe("https://evil.com", { allowedHosts: ["api.openai.com"] })
      ).toBe(false);
      expect(
        isUrlSafe("https://api.openai.com/v1", { allowedHosts: ["api.openai.com"] })
      ).toBe(true);
    });
  });

  describe("getAllowedHostsFromEnv", () => {
    it("returns undefined when env var is not set", () => {
      delete process.env.MY_ALLOWLIST;
      expect(getAllowedHostsFromEnv("MY_ALLOWLIST")).toBeUndefined();
    });

    it("returns undefined when env var is empty string", () => {
      process.env.MY_ALLOWLIST = "";
      expect(getAllowedHostsFromEnv("MY_ALLOWLIST")).toBeUndefined();
    });

    it("parses single hostname", () => {
      process.env.MY_ALLOWLIST = "api.openai.com";
      expect(getAllowedHostsFromEnv("MY_ALLOWLIST")).toEqual(["api.openai.com"]);
    });

    it("parses comma-separated hostnames and trims whitespace", () => {
      process.env.MY_ALLOWLIST = "api.openai.com, api.anthropic.com ,  generativelanguage.googleapis.com";
      expect(getAllowedHostsFromEnv("MY_ALLOWLIST")).toEqual([
        "api.openai.com",
        "api.anthropic.com",
        "generativelanguage.googleapis.com",
      ]);
    });

    it("filters out empty entries from trailing commas", () => {
      process.env.MY_ALLOWLIST = "api.openai.com,,";
      expect(getAllowedHostsFromEnv("MY_ALLOWLIST")).toEqual(["api.openai.com"]);
    });
  });
});
