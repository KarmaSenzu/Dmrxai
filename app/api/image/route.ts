import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
    } = body;

    // Server-side override kalau env di-set, kalau tidak fallback ke body.
    const { apiKey, baseUrl } = resolveAIConfig({
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
    });

    // Validate required fields
    if (!prompt || !apiKey || !baseUrl || !model) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: prompt, apiKey, baseUrl, model" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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
        JSON.stringify({ error: `Image generation failed (${response.status}): ${errorMessage}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // OpenAI format: { data: [{ url: "...", b64_json: "..." }] }
    const images = data.data?.map((img: any) => ({
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
    console.error("Image API error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
