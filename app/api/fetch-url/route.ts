import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { createLogger } from "@/lib/logger";
import { validateUrl, UrlGuardError } from "@/lib/url-guard";
import { enforceRateLimit } from "@/lib/rate-limit";

const log = createLogger("api/fetch-url");

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 20_000;
const FETCH_TIMEOUT_MS = 10_000;

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
    log.info("POST", "Request received");

    // Auth gate — URL fetcher is a protected route (also avoids being used as
    // an open SSRF proxy for unauthenticated traffic).
    let user;
    try {
      user = await requireUser(req);
    } catch (response) {
      return response as Response;
    }

    // Rate limit: fetcher reaches out to arbitrary external hosts; cap usage.
    const limited = enforceRateLimit(
      req,
      { limit: 30, windowMs: 60_000, prefix: "fetch-url" },
      user.id,
    );
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const rawUrl: unknown = body?.url;

    if (typeof rawUrl !== "string" || !rawUrl) {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // SSRF guard via shared utility. Allows http+https (since user-fetched
    // URLs may legitimately be plain http for some sites), blocks the full
    // private/loopback/link-local set including IPv6 and decimal IPs.
    let parsed: URL;
    try {
      parsed = validateUrl(rawUrl, {
        protocols: ["https:"],
        allowHttp: true,
      });
    } catch (e) {
      if (e instanceof UrlGuardError) {
        log.warn("POST", "URL blocked by guard", { code: e.code });
        return new Response(
          JSON.stringify({ error: "Invalid URL" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      throw e;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    log.debug("POST", "Fetching external URL", { url: parsed.toString() });

    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DmrxAI-Bot/1.0)",
          Accept: "text/html,text/plain,application/json,*/*",
        },
        signal: controller.signal,
        // SSRF defense: do NOT follow redirects automatically. validateUrl()
        // only checks the initial host, so a 3xx Location pointing at a
        // private/loopback/link-local target would otherwise silently
        // bypass the guard. Surface the redirect to the caller instead.
        redirect: "manual",
      });
    } finally {
      clearTimeout(timeout);
    }

    // Reject redirect responses up front so the caller never receives
    // content fetched from an unvalidated host.
    if (response.status >= 300 && response.status < 400) {
      return new Response(
        JSON.stringify({ error: "URL redirects, refusing to follow" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Pre-flight size check via Content-Length if the server sent one.
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const len = Number(contentLengthHeader);
      if (Number.isFinite(len) && len > MAX_BYTES) {
        return new Response(
          JSON.stringify({ error: "Response too large" }),
          { status: 413, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();

    // Stream the body with a hard byte limit. Reading the full body into
    // memory before the size check lets a malicious server blow past
    // MAX_BYTES on transports that don't set Content-Length (chunked,
    // compressed, etc). Cancel the read as soon as we cross the threshold.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) {
            await reader.cancel().catch(() => {});
            return new Response(
              JSON.stringify({ error: "Response too large" }),
              { status: 413, headers: { "Content-Type": "application/json" } },
            );
          }
          chunks.push(value);
        }
      }
    }

    // Concatenate chunks into a single Uint8Array, then decode as UTF-8.
    // Avoid Buffer here — this route runs on the Edge runtime where
    // Node's Buffer isn't always polyfilled.
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(merged);

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
    log.error("POST", "Failed to fetch URL", { error: String(error) });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
