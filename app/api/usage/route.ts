import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { createLogger } from "@/lib/logger";
import { readJsonWithLimit, DEFAULT_MAX_BODY } from "@/lib/body-limit";
import { enforceRateLimit } from "@/lib/rate-limit";

const log = createLogger("api/usage");

export const runtime = "edge";

// Internal usage/dashboard server URL (configured via DMRXAI_API_URL).
// Read at request time so docker-compose env injection works at runtime.
function getUsageServerUrl(): string {
  return (process.env.DMRXAI_API_URL || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    log.info("POST", "Request received");

    // Auth gate — usage data is per-user and not public.
    let user;
    try {
      user = await requireUser(req);
    } catch (response) {
      return response as Response;
    }

    // Rate limit: dashboard polling can be chatty, but a per-user cap is fine.
    const limited = enforceRateLimit(
      req,
      { limit: 60, windowMs: 60_000, prefix: "usage" },
      user.id,
    );
    if (limited) return limited;

    const AI_SERVER_URL = getUsageServerUrl();

    // If usage tracking endpoint isn't configured (e.g. when AI is "managed
    // by server" via 9router but no separate usage server is wired up),
    // return 503 with a polite message instead of trying localhost:1430.
    if (!AI_SERVER_URL) {
      log.warn("POST", "Usage tracking not configured, DMRXAI_API_URL is empty");
      return new Response(
        JSON.stringify({
          error: "Usage tracking not configured",
          configured: false,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    let body: { apiKey?: unknown };
    try {
      body = await readJsonWithLimit<{ apiKey?: unknown }>(req, DEFAULT_MAX_BODY);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
    const { apiKey } = body;

    // Validate API key format before forwarding to internal server.
    // Reject anything that doesn't look like a credential token (length and
    // character set) — keeps malformed input from reaching the upstream.
    if (
      typeof apiKey !== "string" ||
      apiKey.length < 10 ||
      apiKey.length > 500 ||
      !/^[a-zA-Z0-9_\-.]+$/.test(apiKey)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid API key format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    log.debug("POST", "Fetching usage data from endpoints", { serverUrl: AI_SERVER_URL });

    // Try to fetch usage/dashboard data from configured server
    // Common endpoints: /usage, /dashboard, /me, /billing/usage
    const endpoints = ["/usage", "/dashboard", "/me"];
    let usageData = null;
    let lastError = "";

    for (const ep of endpoints) {
      try {
        const response = await fetch(`${AI_SERVER_URL}${ep}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          usageData = await response.json();
          break;
        }
      } catch {
        // Try next endpoint
      }
    }

    // If no endpoint worked, try to at least validate the key via /models
    if (!usageData) {
      try {
        const modelsResponse = await fetch(`${AI_SERVER_URL}/models`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (modelsResponse.ok) {
          // Key is valid but no usage endpoint available
          // Return basic info
          usageData = {
            active: true,
            tokensUsed: 0,
            tokenLimit: null,
            conversations: 0,
            plan: "Active",
            message: "Lisensi valid. Detail penggunaan tidak tersedia dari server.",
          };
        } else {
          return new Response(
            JSON.stringify({ error: "Lisensi tidak valid atau sudah expired. Periksa kembali API Key Anda." }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Tidak dapat terhubung ke server. Coba lagi nanti." }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify(usageData),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
    log.error("POST", "Usage API error", { error: String(error) });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
