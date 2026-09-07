import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockClient = { auth: { getUser: vi.fn() }, from: vi.fn() };
const mockCreateClient = vi.fn<(...args: unknown[]) => typeof mockClient>(() => mockClient);

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getSupabaseClient, getSupabaseAdmin } from "@/lib/supabase";

describe("supabase", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockCreateClient.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getSupabaseClient", () => {
    it("creates client with anon key", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

      const client = getSupabaseClient();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "https://example.supabase.co",
        "anon-key",
      );
      expect(client).toBe(mockClient);
    });

    it("throws when env URL missing", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

      expect(() => getSupabaseClient()).toThrow(
        "Supabase env vars not configured",
      );
    });

    it("throws when anon key missing", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      expect(() => getSupabaseClient()).toThrow(
        "Supabase env vars not configured",
      );
    });
  });

  describe("getSupabaseAdmin", () => {
    it("creates admin client with service role key", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      const admin = getSupabaseAdmin();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "https://example.supabase.co",
        "service-role-key",
      );
      expect(admin).toBe(mockClient);
    });

    it("throws when service role key missing", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => getSupabaseAdmin()).toThrow(
        "Supabase admin env vars not configured",
      );
    });

    it("throws when URL missing", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      expect(() => getSupabaseAdmin()).toThrow(
        "Supabase admin env vars not configured",
      );
    });

    it("throws when both env vars missing", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => getSupabaseAdmin()).toThrow(
        "Supabase admin env vars not configured",
      );
    });

    it("uses service role key, not anon key", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      getSupabaseAdmin();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "https://example.supabase.co",
        "service-role-key",
      );
    });

    it("creates a new client per call (no singleton in current impl)", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      getSupabaseAdmin();
      getSupabaseAdmin();

      expect(mockCreateClient).toHaveBeenCalledTimes(2);
    });
  });
});
