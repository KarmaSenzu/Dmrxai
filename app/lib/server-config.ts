// app/lib/server-config.ts
//
// Helper untuk resolve API endpoint + key dari server env saat server-side
// dikonfigurasi (mode "managed by server"). Kalau env tidak di-set, fallback
// ke value yang user kirim di body (mode "user-supplied", legacy).
//
// IMPORTANT: process.env reads happen INSIDE the function body so the value
// is evaluated per request. Edge runtime in self-hosted Next.js (node) reads
// env vars at runtime which is what we want for docker-compose injection.

import { createLogger } from "@/lib/logger";

const log = createLogger("server-config");

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
    log.debug("resolveAIConfig", "Using server-managed config", { baseUrl: envBaseUrl });
    return {
      apiKey: envKey,
      baseUrl: envBaseUrl,
      source: "server",
    };
  }

  log.debug("resolveAIConfig", "Using client-supplied config", { baseUrl: userBody.baseUrl });
  // Client mode: the request is expected to carry an apiKey. Fail loudly
  // here rather than letting an empty key reach the upstream provider and
  // produce a confusing 401/403 deep in the stream pipeline.
  const apiKey = userBody.apiKey?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "API key required when server config (AI_BASE_URL) is not set",
    );
  }
  return {
    apiKey,
    baseUrl: userBody.baseUrl?.trim() ?? "",
    source: "client",
  };
}
