// app/api/config/route.ts
//
// Public endpoint yang memberi tahu frontend apakah server-side AI
// config sudah ter-set. Frontend pakai ini untuk hide/disable field
// API Key + Base URL di Settings.
//
// TIDAK return value secret apapun (no apiKey, no aiBaseUrlHint —
// the base URL is server-only since this endpoint is unauthenticated).

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/config");

export const runtime = "edge";

export async function GET() {
  log.info("GET", "Request received");

  const aiConfigured = Boolean(process.env.AI_BASE_URL?.trim());
  const usageConfigured = Boolean(process.env.DMRXAI_API_URL?.trim());

  log.debug("GET", "Config status", { aiConfigured, usageConfigured });

  // NOTE: Do NOT leak `AI_BASE_URL` to unauthenticated callers. The
  // resolveAIConfig() helper on the server side already injects the
  // env-configured base URL on every protected route, so the client
  // doesn't need to know it. Returning aiBaseUrlHint=null preserves the
  // shape expected by useSettings without exposing the value.
  return NextResponse.json({
    aiConfigured,
    usageConfigured,
    aiBaseUrlHint: null,
  });
}
