import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockBrowserClient = { auth: { getUser: vi.fn() } };
const mockCreateBrowserClient = vi.fn<(...args: unknown[]) => typeof mockBrowserClient>(
  () => mockBrowserClient,
);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => mockCreateBrowserClient(...args),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getSupabaseBrowser } from "@/lib/supabase-browser";

describe("supabase-browser", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockCreateBrowserClient.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates a browser client with env vars", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    const client = getSupabaseBrowser();

    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key-123",
    );
    expect(client).toBe(mockBrowserClient);
  });

  it("throws when SUPABASE_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    expect(() => getSupabaseBrowser()).toThrow(
      "Supabase env vars not configured",
    );
  });

  it("throws when SUPABASE_ANON_KEY is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => getSupabaseBrowser()).toThrow(
      "Supabase env vars not configured",
    );
  });

  it("throws when both env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => getSupabaseBrowser()).toThrow(
      "Supabase env vars not configured",
    );
  });

  it("creates a fresh client on each call (no singleton)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    getSupabaseBrowser();
    getSupabaseBrowser();
    getSupabaseBrowser();

    expect(mockCreateBrowserClient).toHaveBeenCalledTimes(3);
  });

  it("returns object with auth namespace", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    const client = getSupabaseBrowser();

    expect(client).toHaveProperty("auth");
  });
});
