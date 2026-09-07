import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockServerClient = { auth: { getUser: vi.fn() } };
const mockCreateServerClient = vi.fn<(...args: unknown[]) => typeof mockServerClient>(
  () => mockServerClient,
);

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn().mockReturnValue([]),
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getSupabaseServer } from "@/lib/supabase-server";

describe("supabase-server", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockCreateServerClient.mockClear();
    mockCookieStore.get.mockClear();
    mockCookieStore.set.mockClear();
    mockCookieStore.getAll.mockClear().mockReturnValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates a server client using env vars", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    const client = await getSupabaseServer();

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key-123",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(client).toBe(mockServerClient);
  });

  it("throws when SUPABASE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    await expect(getSupabaseServer()).rejects.toThrow(
      "Supabase env vars not configured",
    );
  });

  it("throws when SUPABASE_ANON_KEY is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    await expect(getSupabaseServer()).rejects.toThrow(
      "Supabase env vars not configured",
    );
  });

  it("cookies.getAll delegates to cookieStore.getAll", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";
    mockCookieStore.getAll.mockReturnValue([
      { name: "sb", value: "v" },
    ]);

    await getSupabaseServer();
    const opts = mockCreateServerClient.mock.calls[0][2] as {
      cookies: { getAll: () => unknown[] };
    };

    expect(opts.cookies.getAll()).toEqual([{ name: "sb", value: "v" }]);
    expect(mockCookieStore.getAll).toHaveBeenCalled();
  });

  it("cookies.setAll forwards each cookie to cookieStore.set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    await getSupabaseServer();
    const opts = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        setAll: (
          cookies: Array<{ name: string; value: string; options: unknown }>,
        ) => void;
      };
    };

    opts.cookies.setAll([
      { name: "sb-access", value: "tok1", options: { path: "/" } },
      { name: "sb-refresh", value: "tok2", options: { path: "/" } },
    ]);

    expect(mockCookieStore.set).toHaveBeenCalledTimes(2);
    expect(mockCookieStore.set).toHaveBeenCalledWith("sb-access", "tok1", {
      path: "/",
    });
    expect(mockCookieStore.set).toHaveBeenCalledWith("sb-refresh", "tok2", {
      path: "/",
    });
  });

  it("cookies.setAll swallows errors from cookieStore.set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";
    mockCookieStore.set.mockImplementation(() => {
      throw new Error("Cannot set cookies in Server Component");
    });

    await getSupabaseServer();
    const opts = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        setAll: (
          cookies: Array<{ name: string; value: string; options: unknown }>,
        ) => void;
      };
    };

    expect(() =>
      opts.cookies.setAll([
        { name: "sb", value: "v", options: {} },
      ]),
    ).not.toThrow();
  });

  it("creates a fresh client on each call", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

    await getSupabaseServer();
    await getSupabaseServer();

    expect(mockCreateServerClient).toHaveBeenCalledTimes(2);
  });
});
