import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

import { getUser, requireUser } from "@/lib/auth-server";

describe("auth-server", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    };
    mockGetUser.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createMockRequest(): NextRequest {
    return new NextRequest("http://localhost:3000/api/test", {
      headers: { cookie: "sb-access-token=test" },
    });
  }

  describe("getUser", () => {
    it("returns user when authenticated", async () => {
      const mockUser = { id: "user-123", email: "test@example.com" };
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const req = createMockRequest();
      const user = await getUser(req);

      expect(user).toEqual(mockUser);
    });

    it("returns null when no user in session", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const req = createMockRequest();
      const user = await getUser(req);

      expect(user).toBeNull();
    });

    it("returns null when auth error occurs", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid token" },
      });

      const req = createMockRequest();
      const user = await getUser(req);

      expect(user).toBeNull();
    });

    it("returns null when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const req = createMockRequest();
      const user = await getUser(req);

      expect(user).toBeNull();
    });

    it("returns null when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const req = createMockRequest();
      const user = await getUser(req);

      expect(user).toBeNull();
    });
  });

  describe("requireUser", () => {
    it("returns user when authenticated", async () => {
      const mockUser = { id: "user-456", email: "admin@example.com" };
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const req = createMockRequest();
      const user = await requireUser(req);

      expect(user).toEqual(mockUser);
    });

    it("throws 401 NextResponse when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const req = createMockRequest();

      try {
        await requireUser(req);
        expect.fail("Should have thrown");
      } catch (e) {
        // NextResponse extends Response, so existing `instanceof Response`
        // checks in callers keep working.
        expect(e).toBeInstanceOf(NextResponse);
        expect(e).toBeInstanceOf(Response);
        const response = e as NextResponse;
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toBe("Authentication required");
      }
    });

    it("throws 401 with JSON content-type", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const req = createMockRequest();

      try {
        await requireUser(req);
        expect.fail("Should have thrown");
      } catch (e) {
        const response = e as NextResponse;
        const ct = response.headers.get("Content-Type") ?? "";
        // NextResponse.json sets a JSON content type; assert just the prefix
        // so charset variants don't break the test.
        expect(ct).toMatch(/^application\/json/);
      }
    });

    it("throws 401 when env vars are missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const req = createMockRequest();

      try {
        await requireUser(req);
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(NextResponse);
        const response = e as NextResponse;
        expect(response.status).toBe(401);
      }
    });

    it("throws 401 when auth returns error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Token expired" },
      });

      const req = createMockRequest();

      try {
        await requireUser(req);
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(NextResponse);
        const response = e as NextResponse;
        expect(response.status).toBe(401);
      }
    });
  });
});
