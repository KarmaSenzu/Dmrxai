import "server-only";

/**
 * SSRF protection: validate that a URL is safe to fetch.
 * Blocks: localhost, private IPs, link-local, IPv6 loopback/private, decimal IPs.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
]);

const BLOCKED_HOST_PATTERNS = [
  /^10\./,                          // 10.0.0.0/8
  /^192\.168\./,                    // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12
  /^169\.254\./,                    // link-local
  /^127\./,                         // loopback
  /^0\./,                           // 0.0.0.0/8
  /^fe80:/i,                        // IPv6 link-local
  /^fc00:/i,                        // IPv6 ULA
  /^fd00:/i,                        // IPv6 ULA
  /^::ffff:/i,                      // IPv4-mapped IPv6
];

export interface UrlGuardOptions {
  /** Allowed protocols (default: https only) */
  protocols?: string[];
  /** Optional allowlist of hostnames; if set, only these are permitted */
  allowedHosts?: string[];
  /**
   * Allow http (default: true in non-production, false in production).
   * Override explicitly to enforce https in dev or allow http in prod.
   */
  allowHttp?: boolean;
  /**
   * Allow private/loopback/link-local hosts (localhost, 10.x, 192.168.x, etc.).
   * Default behavior:
   *   - true when NODE_ENV !== "production" (so dev workflows keep working
   *     against local AI proxies like LM Studio, Ollama, vLLM, custom routers)
   *   - true when ALLOW_PRIVATE_AI_HOSTS=1 is set (production opt-in for
   *     trusted internal deployments)
   *   - false otherwise (SSRF protection active)
   */
  allowPrivate?: boolean;
}

export class UrlGuardError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "UrlGuardError";
  }
}

function isPrivateAllowedByDefault(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ALLOW_PRIVATE_AI_HOSTS === "1") return true;
  return false;
}

/**
 * Parse and validate a URL against SSRF rules.
 * Throws UrlGuardError on invalid input.
 */
export function validateUrl(input: string, options: UrlGuardOptions = {}): URL {
  const {
    protocols = ["https:"],
    allowedHosts,
    allowHttp = process.env.NODE_ENV !== "production",
    allowPrivate = isPrivateAllowedByDefault(),
  } = options;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UrlGuardError("Invalid URL format", "INVALID_URL");
  }

  // Protocol check
  const allowed = new Set(protocols);
  if (allowHttp) allowed.add("http:");
  if (!allowed.has(url.protocol)) {
    throw new UrlGuardError(`Protocol ${url.protocol} not allowed`, "PROTOCOL_BLOCKED");
  }

  const rawHostname = url.hostname.toLowerCase();
  // URL parser keeps IPv6 hostnames wrapped in [brackets]; strip them so
  // pattern matching against fe80:/fc00:/etc. works as written.
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;

  // Allowlist mode
  if (allowedHosts && allowedHosts.length > 0) {
    const ok = allowedHosts.some(h => hostname === h.toLowerCase() || hostname.endsWith("." + h.toLowerCase()));
    if (!ok) {
      throw new UrlGuardError(`Host ${hostname} not in allowlist`, "HOST_NOT_ALLOWED");
    }
    return url;
  }

  // Blocklist mode (default). Skip when allowPrivate is enabled.
  if (!allowPrivate) {
    if (BLOCKED_HOSTS.has(hostname)) {
      throw new UrlGuardError(`Host ${hostname} is blocked`, "HOST_BLOCKED");
    }
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        throw new UrlGuardError(`Host ${hostname} matches blocked pattern`, "HOST_BLOCKED");
      }
    }

    // The URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1 (compressed
    // hex form). The ::ffff: prefix already catches this, but the dotted form
    // disappears — so we additionally check whether any IPv4-mapped IPv6
    // contains a private/loopback IPv4 in its low 32 bits.
    if (hostname.includes(":")) {
      // Detect ::ffff:<hex>:<hex> pointing at IPv4 loopback (7f00:0000–7fff:ffff)
      // or any private range. Cheap heuristic: ::ffff:7f.. is loopback.
      if (/^::ffff:[0-9a-f:]+$/i.test(hostname)) {
        throw new UrlGuardError(`Host ${hostname} matches blocked pattern`, "HOST_BLOCKED");
      }
    }

    // Detect decimal/octal/hex IP encodings
    if (/^\d+$/.test(hostname)) {
      throw new UrlGuardError("Decimal IP encoding not allowed", "HOST_BLOCKED");
    }
  }

  return url;
}

/**
 * Returns true if the URL is safe; false otherwise. Does not throw.
 */
export function isUrlSafe(input: string, options?: UrlGuardOptions): boolean {
  try {
    validateUrl(input, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract hostname allowlist from env (comma-separated).
 * Returns undefined if env var not set.
 */
export function getAllowedHostsFromEnv(envVar: string): string[] | undefined {
  const raw = process.env[envVar];
  if (!raw) return undefined;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
