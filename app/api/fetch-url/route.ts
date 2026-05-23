import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 20_000;
const FETCH_TIMEOUT_MS = 10_000;

// SSRF guard: reject hostnames pointing at localhost / private networks /
// link-local. We do a string-prefix check after lowercasing the hostname,
// which catches the common cases without doing real DNS resolution (edge
// runtime can't resolve hostnames anyway, but the fetch will).
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("169.254.")) return true;

  // 172.16.0.0/12 → 172.16.x.x through 172.31.x.x
  const m = h.match(/^172\.(\d{1,3})\./);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  const title = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return title || undefined;
}

function htmlToText(html: string): string {
  // Strip <script> and <style> blocks first.
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  // Strip remaining tags.
  s = s.replace(/<[^>]+>/g, " ");
  // Decode common entities.
  s = decodeEntities(s);
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl: unknown = body?.url;

    if (typeof rawUrl !== "string" || !rawUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isBlockedHost(parsed.hostname)) {
      return new Response(
        JSON.stringify({ error: "Blocked host" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DmrxAI-Bot/1.0)",
          Accept: "text/html,text/plain,application/json,*/*",
        },
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timeout);
    }

    // Pre-flight size check via Content-Length if the server sent one.
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const len = Number(contentLengthHeader);
      if (Number.isFinite(len) && len > MAX_BYTES) {
        return new Response(
          JSON.stringify({ error: "Response too large" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const raw = await response.text();

    // Belt-and-suspenders byte-size check (UTF-8 char count is not bytes,
    // but this catches obvious blow-ups when no Content-Length was sent).
    if (raw.length > MAX_BYTES) {
      return new Response(
        JSON.stringify({ error: "Response too large" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let title: string | undefined;
    let text: string;

    if (contentType.startsWith("text/html")) {
      title = extractTitle(raw);
      text = htmlToText(raw);
    } else {
      text = raw;
    }

    let truncated = false;
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]";
      truncated = true;
    }

    return new Response(
      JSON.stringify({
        url: parsed.toString(),
        title,
        contentType,
        text,
        truncated,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch URL";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
