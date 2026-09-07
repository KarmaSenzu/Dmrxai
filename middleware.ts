import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public paths — accessible without auth.
// `/` is the marketing landing (exact match only). Other public sections are
// matched by prefix so that nested routes like `/auth/callback` stay public.
const PUBLIC_PATHS_EXACT = ["/"];
const PUBLIC_PATHS_PREFIX = ["/login", "/signup", "/auth", "/features", "/models"];

const AUTH_PATHS = ["/login", "/signup", "/auth"];

// Auth pages that legitimately need to render even for an authenticated user
// (e.g. completing OAuth callback, finishing a password reset, or setting a
// new password after a recovery email). These are skipped when redirecting
// authed users away from /login & friends.
const AUTH_EXCLUDED_PATHS = ["/auth/callback", "/auth/reset", "/auth/update-password"];

// Explicitly protected app sections. Anything not listed here that is also
// not public falls through as "protected by default" via the `!isPublic` check.
const PROTECTED_PATHS = ["/chat", "/builder", "/dashboard", "/profile"];

function isPublicPath(path: string): boolean {
  if (path === "/favicon.ico") return true;
  if (path.startsWith("/_next")) return true;
  if (PUBLIC_PATHS_EXACT.includes(path)) return true;
  return PUBLIC_PATHS_PREFIX.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // CRITICAL: refresh session on every request
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = isPublicPath(path);
  const isProtected = !isPublic;
  const isAuthPage = AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // Redirect unauthenticated users away from protected pages
  if (isProtected && !user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth pages → straight into chat,
  // except for pages that genuinely need to run while the user is already
  // signed in (callback exchange, password reset / update flows).
  if (isAuthPage && user && !AUTH_EXCLUDED_PATHS.includes(path)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/chat";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - api routes (handled per-route via requireUser)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};

// Re-export so the list is reachable for tests / debugging if ever needed.
export { PROTECTED_PATHS };
