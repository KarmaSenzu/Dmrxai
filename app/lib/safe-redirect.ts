/**
 * Validate a redirect path is safe (relative, no protocol, no //).
 * Returns the safe path or a fallback if unsafe.
 */
export function safeRedirectPath(input: string | null | undefined, fallback = "/"): string {
  if (!input) return fallback;
  // Must start with single /
  if (!input.startsWith("/")) return fallback;
  // Block protocol-relative URLs (//evil.com)
  if (input.startsWith("//")) return fallback;
  // Block embedded protocols (e.g., /https://evil.com, /javascript:alert)
  if (/^\/+(https?:|ftp:|javascript:|data:)/i.test(input)) return fallback;
  // Block whitespace control chars
  if (/[\s\r\n\t]/.test(input)) return fallback;
  return input;
}
