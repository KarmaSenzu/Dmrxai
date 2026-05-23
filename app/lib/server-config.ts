// app/lib/server-config.ts
//
// Helper untuk resolve API endpoint + key dari server env saat server-side
// dikonfigurasi (mode "managed by server"). Kalau env tidak di-set, fallback
// ke value yang user kirim di body (mode "user-supplied", legacy).
//
// IMPORTANT: process.env reads happen INSIDE the function body so the value
// is evaluated per request. Edge runtime in self-hosted Next.js (node) reads
// env vars at runtime which is what we want for docker-compose injection.

export function isServerConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL?.trim());
}

export interface ResolvedAIConfig {
  apiKey: string;
  baseUrl: string;
  source: "server" | "client";
}

export function resolveAIConfig(userBody: {
  apiKey?: string;
  baseUrl?: string;
}): ResolvedAIConfig {
  const envKey = process.env.AI_API_KEY?.trim() ?? "";
  const envBaseUrl = process.env.AI_BASE_URL?.trim();

  if (envBaseUrl) {
    return {
      apiKey: envKey,
      baseUrl: envBaseUrl,
      source: "server",
    };
  }

  return {
    apiKey: userBody.apiKey?.trim() ?? "",
    baseUrl: userBody.baseUrl?.trim() ?? "",
    source: "client",
  };
}
