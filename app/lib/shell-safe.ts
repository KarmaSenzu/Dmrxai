/**
 * Shell argument escaping utilities for safe command construction.
 * Use shellQuote() to escape any user-supplied path or argument before
 * embedding in a shell command.
 */

/**
 * Quote a string for safe use as a single shell argument (POSIX sh/bash).
 * Wraps in single quotes and escapes embedded single quotes.
 */
export function shellQuote(s: string): string {
  // Empty string → ''
  if (s.length === 0) return "''";
  // Replace each single quote with: '\''
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Validate that a path does not contain dangerous shell metacharacters.
 * Throws if invalid. Returns the path unchanged if valid.
 */
export function validatePath(path: string): string {
  if (typeof path !== "string") {
    throw new Error("Path must be a string");
  }
  if (path.length === 0) {
    throw new Error("Path cannot be empty");
  }
  if (path.length > 4096) {
    throw new Error("Path too long");
  }
  // Block null bytes
  if (path.includes("\0")) {
    throw new Error("Path contains null byte");
  }
  // Block shell metacharacters that could escape quoting in unusual contexts.
  // We allow only safe characters: alphanumeric, /, -, _, ., space.
  const SAFE_PATH = /^[a-zA-Z0-9/_.\- ]+$/;
  if (!SAFE_PATH.test(path)) {
    throw new Error("Path contains unsafe characters");
  }
  // Block path traversal
  if (path.includes("..")) {
    throw new Error("Path traversal not allowed");
  }
  return path;
}

/**
 * Validate a directory path is safe to pass to shell commands.
 * More permissive than validatePath - allows leading slash patterns.
 */
export function validateDir(dir: string): string {
  return validatePath(dir);
}

/**
 * Build a safe shell command by quoting all arguments.
 * Example: buildCommand("rm", ["-f", userPath]) → "rm '-f' '/safe/path'"
 */
export function buildCommand(cmd: string, args: string[]): string {
  return [cmd, ...args.map(shellQuote)].join(" ");
}
