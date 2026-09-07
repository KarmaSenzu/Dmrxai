import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createLogger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/safe-redirect";

const log = createLogger("auth/callback");

export async function GET(req: NextRequest) {
  log.info("GET", "Request received");

  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/chat");

  if (!code) {
    log.warn("GET", "Missing code parameter in callback");
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    log.error("GET", "Supabase config missing");
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  // Build response first so we can mutate cookies
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    log.error("GET", "Failed to exchange code for session", { error: error.message });
    // Do not reflect the upstream error message in the redirect URL — use a
    // generic, opaque code so user-controlled / provider-controlled strings
    // can't be injected into the URL.
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  log.debug("GET", "Auth callback successful, redirecting", { next });
  return response;
}
