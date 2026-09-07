/**
 * Sanitize a free-form upstream error string before relaying it to the client.
 *
 * Strips URLs and absolute paths that may leak provider endpoints / internal
 * file paths, and clamps length so a chatty 5KB stack trace can't bloat the
 * client response. The result is safe to embed in user-facing error JSON.
 */
export function sanitizeUpstreamError(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/https?:\/\/[^\s]+/g, "[url]")
    .replace(/\/[\w/.-]+/g, "[path]")
    .slice(0, 200);
}
