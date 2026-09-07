// app/lib/logger.ts
//
// Edge-safe structured logger.
//
// Behavior:
// - Always emits structured JSON to console (compatible with Edge runtime,
//   browser, and Node.js).
// - On Node.js runtime, ALSO appends each line to a per-level file in
//   ./logs/{debug,info,warn,error}.log. File writers are loaded lazily
//   via dynamic require so Edge bundling does not pull in `fs`/`path`.
// - In Edge runtime / browser, file writes are silently skipped; logs are
//   captured by stdout/stderr (PM2, Docker, or cloud log aggregator).

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: string;
  time: string;
  module: string;
  fn: string;
  msg: string;
  [k: string]: unknown;
}

interface FileWriters {
  debug: (line: string) => void;
  info: (line: string) => void;
  warn: (line: string) => void;
  error: (line: string) => void;
}

let fileWriters: FileWriters | null = null;
let fileInitTried = false;

function isNodeRuntime(): boolean {
  if (typeof process === "undefined") return false;
  // Next.js sets NEXT_RUNTIME to "edge" or "nodejs"
  if (process.env.NEXT_RUNTIME === "edge") return false;
  // Browsers don't have process.versions.node
  if (!process.versions || !process.versions.node) return false;
  return true;
}

function tryInitFileWriters(): void {
  if (fileInitTried) return;
  fileInitTried = true;
  if (!isNodeRuntime()) return;

  try {
    // Use Function constructor instead of static import to avoid webpack
    // resolving "fs"/"path" in Edge bundle.
    const dynamicRequire = new Function("m", "return require(m)") as (
      m: string
    ) => unknown;
    const fs = dynamicRequire("fs") as typeof import("fs");
    const path = dynamicRequire("path") as typeof import("path");

    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const open = (name: string) =>
      fs.createWriteStream(path.join(logsDir, name), { flags: "a" });

    const debugStream = open("debug.log");
    const infoStream = open("info.log");
    const warnStream = open("warn.log");
    const errorStream = open("error.log");

    fileWriters = {
      debug: (line) => {
        debugStream.write(line + "\n");
      },
      info: (line) => {
        infoStream.write(line + "\n");
      },
      warn: (line) => {
        warnStream.write(line + "\n");
      },
      error: (line) => {
        errorStream.write(line + "\n");
      },
    };
  } catch {
    // Filesystem unavailable (read-only fs, sandboxed env, etc.) — fall back
    // to console only.
    fileWriters = null;
  }
}

function emit(
  level: LogLevel,
  moduleName: string,
  fn: string,
  msg: string,
  data?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    level: level.toUpperCase(),
    time: new Date().toISOString(),
    module: moduleName,
    fn,
    msg,
    ...(data ?? {}),
  };

  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    // Defensive: data may contain circular refs.
    line = JSON.stringify({
      level: entry.level,
      time: entry.time,
      module: entry.module,
      fn: entry.fn,
      msg: entry.msg,
      _serializeError: true,
    });
  }

  // Always emit to console — captured by stdout/stderr in any runtime.
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }

  // Best-effort file write on Node.js.
  tryInitFileWriters();
  if (fileWriters) {
    try {
      fileWriters[level](line);
    } catch {
      // Swallow — never let logging crash the app.
    }
  }
}

export interface Logger {
  debug(fn: string, msg: string, data?: Record<string, unknown>): void;
  info(fn: string, msg: string, data?: Record<string, unknown>): void;
  warn(fn: string, msg: string, data?: Record<string, unknown>): void;
  error(fn: string, msg: string, data?: Record<string, unknown>): void;
}

/**
 * Create a logger scoped to a specific module.
 *
 * Usage:
 *   const log = createLogger("module-name");
 *   log.info("functionName", "message", { extra: "data" });
 */
export function createLogger(moduleName: string): Logger {
  return {
    debug(fn, msg, data) {
      emit("debug", moduleName, fn, msg, data);
    },
    info(fn, msg, data) {
      emit("info", moduleName, fn, msg, data);
    },
    warn(fn, msg, data) {
      emit("warn", moduleName, fn, msg, data);
    },
    error(fn, msg, data) {
      emit("error", moduleName, fn, msg, data);
    },
  };
}

// Test-only export — resets the lazy file-writer init so tests can re-trigger
// the runtime detection path.
export function _resetFileWritersForTest(): void {
  fileWriters = null;
  fileInitTried = false;
}

export default createLogger;
