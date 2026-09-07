import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";
import { requireUser } from "@/lib/auth-server";
import { createLogger } from "@/lib/logger";
import { validateUrl, UrlGuardError, getAllowedHostsFromEnv } from "@/lib/url-guard";
import { readJsonWithLimit, DEFAULT_MAX_BODY } from "@/lib/body-limit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeUpstreamError } from "@/lib/sanitize-error";

const log = createLogger("api/image");

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    log.info("POST", "Request received");

    // Auth gate — image generation is a protected route.
    let user;
    try {
      user = await requireUser(req);
    } catch (response) {
      return response as Response;
    }

    // Rate limit: image generation is expensive, lower per-user budget.
    const limited = enforceRateLimit(
      req,
      { limit: 20, windowMs: 60_000, prefix: "image" },
      user.id,
    );
    if (limited) return limited;

    let body: Record<string, unknown>;
    try {
      body = await readJsonWithLimit<Record<string, unknown>>(req, DEFAULT_MAX_BODY);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
    const {
      prompt,
      negativePrompt,
      model,
      size,
      quality,
      style,
      n,
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
    } = body as {
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      size?: string;
      quality?: string;
      style?: string;
      n?: number;
      apiKey?: string;
      baseUrl?: string;
    };

    // Server-side override kalau env di-set, kalau tidak fallback ke body.
    let apiKey: string;
    let baseUrl: string;
    try {
      const cfg = resolveAIConfig({
        apiKey: userApiKey,
        baseUrl: userBaseUrl,
      });
      apiKey = cfg.apiKey;
      baseUrl = cfg.baseUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid AI config";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate required fields
    if (!prompt || !apiKey || !baseUrl || !model) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: prompt, apiKey, baseUrl, model" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // SSRF guard: validate baseUrl points to a public AI provider host.
    try {
      validateUrl(baseUrl, {
        allowedHosts: getAllowedHostsFromEnv("ALLOWED_AI_HOSTS"),
      });
    } catch (e) {
      if (e instanceof UrlGuardError) {
        return new Response(
          JSON.stringify({ error: "Invalid baseUrl: " + e.code }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      throw e;
    }

    // Normalize base URL
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl}/images/generations`;

    // Build request body based on model capabilities
    const requestBody: Record<string, unknown> = {
      model,
      prompt: negativePrompt ? `${prompt}\n\nNegative prompt: ${negativePrompt}` : prompt,
      n: n || 1,
      size: size || "1024x1024",
    };

    // Add quality and style for DALL-E 3 / gpt-image models
    if (model.includes("dall-e-3") || model.includes("gpt-image")) {
      requestBody.quality = quality || "standard";
      requestBody.style = style || "natural";
    }
    // Some providers support response_format
    requestBody.response_format = "b64_json";

    log.debug("POST", "Calling image generation API", { model, endpoint });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
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
        JSON.stringify({ error: `Image generation failed (${response.status}): ${sanitizeUpstreamError(errorMessage)}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // OpenAI format: { data: [{ url: "...", b64_json: "..." }] }
    type ImageData = { url?: string; b64_json?: string; revised_prompt?: string };
    const images = (data.data as ImageData[] | undefined)?.map((img) => ({
      url: img.url || null,
      b64Data: img.b64_json || null,
      revisedPrompt: img.revised_prompt || null,
    })) || [];

    return new Response(
      JSON.stringify({ images }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    log.error("POST", "Image API error", { error: String(error) });
    return new Response(
      JSON.stringify({ error: sanitizeUpstreamError(message) || "Image generation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
