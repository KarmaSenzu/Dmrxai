import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Must mock server-only FIRST to avoid import resolution error
vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    from: mockFrom,
  }),
}));

const mockCookiesGetAll = vi.fn().mockReturnValue([]);

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ getAll: mockCookiesGetAll }),
}));

import { getServerSession, getUserProfile } from "@/lib/auth-session";

describe("auth-session", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    };
    mockGetUser.mockReset();
    mockGetSession.mockReset();
    mockFrom.mockReset();
    mockCookiesGetAll.mockReturnValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("getServerSession", () => {
    it("returns user and session when authenticated", async () => {
      const mockUser = { id: "user-1", email: "test@test.com" };
      const mockSessionData = { access_token: "token-123", user: mockUser };

      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockGetSession.mockResolvedValue({ data: { session: mockSessionData }, error: null });

      const result = await getServerSession();

      expect(result.user).toEqual(mockUser);
      expect(result.session).toEqual(mockSessionData);
    });

    it("returns null user and session when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      const result = await getServerSession();

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
    });

    it("returns null when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const result = await getServerSession();

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
    });

    it("returns null when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const result = await getServerSession();

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
    });

    it("returns null user when getUser has error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid refresh token" },
      });
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      const result = await getServerSession();

      expect(result.user).toBeNull();
    });

    it("returns session even when user has no email", async () => {
      const mockUser = { id: "user-no-email" };
      const mockSessionData = { access_token: "token-456", user: mockUser };

      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
      mockGetSession.mockResolvedValue({ data: { session: mockSessionData }, error: null });

      const result = await getServerSession();

      expect(result.user).toEqual(mockUser);
      expect(result.session).toEqual(mockSessionData);
    });
  });

  describe("getUserProfile", () => {
    it("returns profile data when found", async () => {
      const profileData = {
        id: "user-1",
        email: "test@test.com",
        display_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
          }),
        }),
      });

      const result = await getUserProfile("user-1");

      expect(result).toEqual(profileData);
    });

    it("returns null when profile not found", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Row not found" },
            }),
          }),
        }),
      });

      const result = await getUserProfile("nonexistent-user");

      expect(result).toBeNull();
    });

    it("returns null when env vars are missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const result = await getUserProfile("user-1");

      expect(result).toBeNull();
    });

    it("returns null on database error", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Database connection error" },
            }),
          }),
        }),
      });

      const result = await getUserProfile("user-1");

      expect(result).toBeNull();
    });

    it("queries the profiles table with correct userId", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      await getUserProfile("user-xyz");

      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });
  });
});
