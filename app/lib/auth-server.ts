import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-server");

/**
 * Get authenticated user from a Route Handler request.
 * Returns null if not authenticated.
 */
export async function getUser(req: NextRequest): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    log.warn("getUser", "Supabase env vars missing");
    return null;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll() {
        // Route handlers can't set cookies on response easily;
        // session refresh is handled by middleware
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    log.debug("getUser", "No authenticated user", { error: error?.message });
    return null;
  }
  log.debug("getUser", "User authenticated", { userId: data.user.id });
  return data.user;
}

/**
 * Require authenticated user; throws a NextResponse with 401 if not.
 *
 * NextResponse plays nicer with the App Router runtime than a raw Response
 * (it carries the framework-specific cookie/redirect helpers callers may
 * inspect). Callers keep the existing try/catch pattern:
 *
 *   try {
 *     const user = await requireUser(req);
 *   } catch (response) {
 *     return response as NextResponse;
 *   }
 *
 * NextResponse extends Response, so existing `instanceof Response` checks
 * keep working.
 */
export async function requireUser(req: NextRequest): Promise<User> {
  const user = await getUser(req);
  if (!user) {
    log.warn("requireUser", "Authentication required but no user found");
    throw NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  return user;
}
