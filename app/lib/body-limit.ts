import "server-only";
import { NextRequest } from "next/server";

export const DEFAULT_MAX_BODY = 1024 * 1024; // 1 MB
export const LARGE_MAX_BODY = 10 * 1024 * 1024; // 10 MB (for builder agent with files)

/**
 * Read the request body as JSON, enforcing a maximum size.
 * Throws Response with 413 if exceeded, 400 if invalid JSON.
 */
export async function readJsonWithLimit<T = unknown>(
  req: NextRequest,
  maxBytes: number = DEFAULT_MAX_BODY,
): Promise<T> {
  // Check Content-Length header first (fast path)
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const len = parseInt(contentLength, 10);
    if (Number.isFinite(len) && len > maxBytes) {
      throw bodyTooLarge(maxBytes);
    }
  }

  // Read the body as text with a size limit
  const text = await req.text();
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maxBytes) {
    throw bodyTooLarge(maxBytes);
  }

  if (text.length === 0) {
    throw new Response(JSON.stringify({ error: "Empty body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}

function bodyTooLarge(max: number): Response {
  return new Response(
    JSON.stringify({ error: `Request body too large (max ${max} bytes)` }),
    { status: 413, headers: { "content-type": "application/json" } },
  );
}
