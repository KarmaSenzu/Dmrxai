import { NextRequest } from "next/server";

export const runtime = "edge";

// Internal usage/dashboard server URL (configured via DMRXAI_API_URL).
// Read at request time so docker-compose env injection works at runtime.
function getUsageServerUrl(): string {
  return (process.env.DMRXAI_API_URL || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const AI_SERVER_URL = getUsageServerUrl();

    // If usage tracking endpoint isn't configured (e.g. when AI is "managed
    // by server" via 9router but no separate usage server is wired up),
    // return 503 with a polite message instead of trying localhost:1430.
    if (!AI_SERVER_URL) {
      return new Response(
        JSON.stringify({
          error: "Usage tracking not configured",
          configured: false,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { apiKey } = body;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API Key diperlukan." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
