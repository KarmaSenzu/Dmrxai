import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { apiKey: userApiKey, baseUrl: userBaseUrl } = body ?? {};

    // Server-side override kalau env di-set, kalau tidak fallback ke body.
    const { apiKey, baseUrl } = resolveAIConfig({
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
    });

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required field: baseUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize base URL
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl}/models`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      return new Response(
        JSON.stringify({ error: `Failed to fetch models (${response.status}): ${errorMessage}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Normalize various provider response shapes into { data: [{ id }] }.
    // - OpenAI-compatible: { data: [{ id, ... }, ...] }
    // - Some providers: a flat array of objects/strings
    // - Anthropic-style: { models: [...] } (defensive)
    let ids: string[] = [];

    if (data && Array.isArray(data.data)) {
      ids = data.data
        .map((m: any) => m?.id || m?.name || (typeof m === "string" ? m : ""))
        .filter((id: string) => id && id.length > 0);
    } else if (Array.isArray(data)) {
      ids = data
        .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name || ""))
        .filter((id: string) => id && id.length > 0);
    } else if (data && Array.isArray(data.models)) {
      ids = data.models
        .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name || ""))
        .filter((id: string) => id && id.length > 0);
    }

    ids.sort((a, b) => a.localeCompare(b));

    return new Response(
      JSON.stringify({ data: ids.map((id) => ({ id })) }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
