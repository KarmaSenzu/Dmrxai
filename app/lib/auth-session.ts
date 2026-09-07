import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Session, User } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-session");

/**
 * Read the current Supabase session server-side.
 * Use in Server Components or Server Actions to gate UI / data.
 *
 * Returns { user, session } or { user: null, session: null } if unauthenticated
 * (also when Supabase env vars are missing).
 *
 * This is the "Session Layer" entrypoint — call this in a server component
 * shell so the client receives initial auth-derived data with no flicker.
 */
export async function getServerSession(): Promise<{
  user: User | null;
  session: Session | null;
}> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    log.warn("getServerSession", "Supabase env vars missing");
    return { user: null, session: null };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components can't set cookies; middleware refreshes the session.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  log.debug("getServerSession", "Session resolved", { hasUser: !!user, hasSession: !!session });
  return { user, session };
}

/**
 * Fetch the user's row from the `profiles` table.
 * Returns null when not found, on error, or when env is missing.
 */
export async function getUserProfile(userId: string): Promise<{
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
} | null> {
  log.debug("getUserProfile", "Fetching profile", { userId });
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    log.warn("getUserProfile", "Supabase env vars missing");
    return null;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .eq("id", userId)
    .single();

  if (error || !data) {
    log.warn("getUserProfile", "Profile not found", { userId, error: error?.message });
    return null;
  }
  return data;
}
