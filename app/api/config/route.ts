// app/api/config/route.ts
//
// Public endpoint yang memberi tahu frontend apakah server-side AI
// config sudah ter-set. Frontend pakai ini untuk hide/disable field
// API Key + Base URL di Settings.
//
// TIDAK return value secret apapun (no apiKey).

import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const aiConfigured = Boolean(process.env.AI_BASE_URL?.trim());
  const usageConfigured = Boolean(process.env.DMRXAI_API_URL?.trim());

  return NextResponse.json({
    aiConfigured,
    usageConfigured,
    // Hint baseUrl supaya frontend bisa fetch /models tanpa user input.
    // TIDAK include apiKey.
    aiBaseUrlHint: aiConfigured
      ? process.env.AI_BASE_URL?.trim() ?? null
      : null,
  });
}
