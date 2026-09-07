import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { isServerConfigured, resolveAIConfig } from "@/lib/server-config";

describe("server-config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("isServerConfigured", () => {
    it("returns true when AI_BASE_URL is set", () => {
      process.env.AI_BASE_URL = "https://api.openai.com/v1";
      expect(isServerConfigured()).toBe(true);
    });

    it("returns false when AI_BASE_URL is not set", () => {
      delete process.env.AI_BASE_URL;
      expect(isServerConfigured()).toBe(false);
    });

    it("returns false when AI_BASE_URL is empty string", () => {
      process.env.AI_BASE_URL = "";
      expect(isServerConfigured()).toBe(false);
    });

    it("returns false when AI_BASE_URL is only whitespace", () => {
      process.env.AI_BASE_URL = "   ";
      expect(isServerConfigured()).toBe(false);
    });

    it("returns true when AI_BASE_URL has leading/trailing whitespace but content", () => {
      process.env.AI_BASE_URL = "  https://api.example.com  ";
      expect(isServerConfigured()).toBe(true);
    });
  });

  describe("resolveAIConfig", () => {
    describe("server-managed mode (AI_BASE_URL set)", () => {
      it("returns server source with env values", () => {
        process.env.AI_BASE_URL = "https://api.openai.com/v1";
        process.env.AI_API_KEY = "sk-server-key";

        const result = resolveAIConfig({ apiKey: "sk-client", baseUrl: "https://client.com" });

        expect(result).toEqual({
          apiKey: "sk-server-key",
          baseUrl: "https://api.openai.com/v1",
          source: "server",
        });
      });

      it("ignores client-supplied values when server is configured", () => {
        process.env.AI_BASE_URL = "https://server.com/v1";
        process.env.AI_API_KEY = "sk-server";

        const result = resolveAIConfig({ apiKey: "sk-client", baseUrl: "https://client.com" });

        expect(result.baseUrl).toBe("https://server.com/v1");
        expect(result.apiKey).toBe("sk-server");
        expect(result.source).toBe("server");
      });

      it("trims whitespace from env values", () => {
        process.env.AI_BASE_URL = "  https://api.example.com  ";
        process.env.AI_API_KEY = "  sk-key-123  ";

        const result = resolveAIConfig({});

        expect(result.baseUrl).toBe("https://api.example.com");
        expect(result.apiKey).toBe("sk-key-123");
      });

      it("returns empty apiKey when AI_API_KEY is not set", () => {
        process.env.AI_BASE_URL = "https://api.example.com";
        delete process.env.AI_API_KEY;

        const result = resolveAIConfig({});

        expect(result.apiKey).toBe("");
        expect(result.baseUrl).toBe("https://api.example.com");
        expect(result.source).toBe("server");
      });
    });

    describe("client-managed mode (AI_BASE_URL not set)", () => {
      beforeEach(() => {
        delete process.env.AI_BASE_URL;
        delete process.env.AI_API_KEY;
      });

      it("returns client source with user-supplied values", () => {
        const result = resolveAIConfig({
          apiKey: "sk-client-key",
          baseUrl: "https://client-api.com/v1",
        });

        expect(result).toEqual({
          apiKey: "sk-client-key",
          baseUrl: "https://client-api.com/v1",
          source: "client",
        });
      });

      it("trims whitespace from client values", () => {
        const result = resolveAIConfig({
          apiKey: "  sk-key  ",
          baseUrl: "  https://api.com  ",
        });

        expect(result.apiKey).toBe("sk-key");
        expect(result.baseUrl).toBe("https://api.com");
      });

      it("throws when client provides no apiKey", () => {
        expect(() => resolveAIConfig({})).toThrow(/API key required/);
      });

      it("throws when apiKey is undefined", () => {
        expect(() =>
          resolveAIConfig({ apiKey: undefined, baseUrl: undefined }),
        ).toThrow(/API key required/);
      });

      it("throws when apiKey is whitespace only", () => {
        expect(() =>
          resolveAIConfig({ apiKey: "   ", baseUrl: "https://api.com" }),
        ).toThrow(/API key required/);
      });

      it("throws when AI_BASE_URL is empty and no apiKey supplied", () => {
        process.env.AI_BASE_URL = "";

        expect(() =>
          resolveAIConfig({ baseUrl: "https://user.com" }),
        ).toThrow(/API key required/);
      });

      it("falls back to client mode when AI_BASE_URL is empty but apiKey present", () => {
        process.env.AI_BASE_URL = "";

        const result = resolveAIConfig({ apiKey: "sk-user", baseUrl: "https://user.com" });

        expect(result.source).toBe("client");
        expect(result.apiKey).toBe("sk-user");
        expect(result.baseUrl).toBe("https://user.com");
      });
    });
  });
});
