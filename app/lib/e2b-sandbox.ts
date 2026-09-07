// app/lib/e2b-sandbox.ts
//
// Server-side E2B sandbox manager for the App Builder.
//
// This is the "real" runtime that makes the App Builder behave like Bolt /
// Google AI Studio: a persistent per-project sandbox where the agent actually
// writes files and runs commands (`npm install`, `npm run dev`). Unlike the
// StackBlitz client-side engine (which has no shell and no server state), every
// operation here is executed against a live E2B sandbox on the server, so:
//
//   - Files persist across turns (fixes "code starts over from scratch").
//   - `run_command` streams real stdout/stderr (fixes the silent "terminal").
//   - The dev server exposes a real preview URL (fixes the blank preview).
//
// IMPORTANT: this module is server-only. It lazily loads the `e2b` SDK so the
// Next.js client/Edge bundle never pulls it in (same trick as logger.ts uses
// for `fs`). It also accepts an injectable SDK adapter so tests can exercise
// the full lifecycle without a live E2B API key.

import "server-only";

import { createLogger } from "@/lib/logger";

const log = createLogger("e2b-sandbox");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape of the E2B filesystem API we depend on. */
export interface SandboxFs {
  write(path: string, content: string): Promise<unknown>;
  read(path: string): Promise<string>;
  remove(path: string): Promise<unknown>;
  list(dir?: string): Promise<Array<{ name: string; type: "file" | "dir"; path: string }>>;
}

/** Minimal shape of the E2B process API we depend on. */
export interface SandboxProcess {
  start(opts: {
    cmd: string;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

/** Minimal shape of a live E2B sandbox handle. */
export interface E2BSandbox {
  sandboxId: string;
  files: SandboxFs;
  process: SandboxProcess;
  /** Public preview URL (HTTPS) once the dev server is up. */
  getHost(port: number): string;
  kill(): Promise<unknown>;
}

/** Adapter interface the SDK loader must satisfy. */
export interface E2BSdkAdapter {
  create(
    template: string,
    opts?: { timeoutMs?: number; projectSlug?: string },
  ): Promise<E2BSandbox>;
  connect(sandboxId: string): Promise<E2BSandbox>;
}

// ---------------------------------------------------------------------------
// SDK loading (lazy + injectable for tests)
// ---------------------------------------------------------------------------

let injectedSdk: E2BSdkAdapter | null = null;
let sdkInitTried = false;
let loadedSdk: E2BSdkAdapter | null = null;

/**
 * Inject an SDK adapter into the manager. Used both in production (by
 * `sandbox-provider` to wire in the Docker adapter) and in tests (to inject a
 * fake). Passing null clears any injected adapter so `loadSdk()` falls back to
 * lazily loading the real E2B SDK.
 */
export function setSdkAdapter(sdk: E2BSdkAdapter | null): void {
  injectedSdk = sdk;
  sdkInitTried = false;
  loadedSdk = null;
}

/**
 * Load the real `e2b` SDK lazily via dynamic require (avoids bundling it into
 * the client/Edge build). Throws if the SDK is unavailable or unconfigured.
 */
function loadSdk(): E2BSdkAdapter {
  if (injectedSdk) return injectedSdk;
  if (sdkInitTried && loadedSdk) return loadedSdk;
  sdkInitTried = true;

  try {
    // Dynamic require so bundlers don't resolve `e2b` on the client bundle.
    const dynamicRequire = new Function("m", "return require(m)") as (
      m: string,
    ) => unknown;
    const e2bModule = dynamicRequire("e2b") as {
      Sandbox?: {
        create(template: string, opts?: { timeoutMs?: number }): Promise<E2BSandbox>;
        connect(sandboxId: string): Promise<E2BSandbox>;
      };
    };

    const Sandbox = e2bModule?.Sandbox;
    if (!Sandbox) {
      throw new Error('e2b SDK loaded but "Sandbox" class not found');
    }

    loadedSdk = {
      create: (template, opts) => Sandbox.create(template, opts),
      connect: (sandboxId) => Sandbox.connect(sandboxId),
    };
    return loadedSdk;
  } catch (e) {
    log.error("loadSdk", "Failed to load e2b SDK", { error: String(e) });
    throw new Error(
      "E2B SDK is not installed or unavailable. Run `npm install e2b`.",
    );
  }
}

// ---------------------------------------------------------------------------
// Sandbox manager
// ---------------------------------------------------------------------------

export interface SandboxEntry {
  sandbox: E2BSandbox;
  projectId: string;
  userId: string | null;
  createdAt: number;
  lastUsedAt: number;
}

export interface SandboxManagerOptions {
  /** Env var name holding the E2B API key. */
  apiKeyEnv?: string;
  /** Sandbox template id. */
  template?: string;
  /** Idle timeout in ms before a sandbox is auto-destroyed. */
  idleTimeoutMs?: number;
  /** Interval in ms for the TTL sweeper. 0 disables the sweeper. */
  sweepIntervalMs?: number;
}

const DEFAULT_TEMPLATE = "base";
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000; // 1 min

export class SandboxManager {
  private entries = new Map<string, SandboxEntry>();
  private template: string;
  private idleTimeoutMs: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: SandboxManagerOptions = {}) {
    this.template = opts.template ?? process.env.E2B_TEMPLATE ?? DEFAULT_TEMPLATE;
    this.idleTimeoutMs =
      opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    const sweepInterval =
      opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    if (sweepInterval > 0) {
      this.startSweeper(sweepInterval);
    }
  }

  private startSweeper(intervalMs: number): void {
    this.sweepTimer = setInterval(() => {
      this.sweepIdle().catch((e) =>
        log.warn("sweepIdle", "sweep error", { error: String(e) }),
      );
    }, intervalMs);
    // Don't keep the Node process alive just for the sweeper.
    if (typeof this.sweepTimer === "object" && this.sweepTimer) {
      (this.sweepTimer as { unref?: () => void }).unref?.();
    }
  }

  /** Stop the sweeper + destroy all sandboxes. Call on server shutdown. */
  async dispose(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    const entries = Array.from(this.entries.entries());
    await Promise.allSettled(
      entries.map(([, entry]) =>
        entry.sandbox.kill().catch(() => undefined),
      ),
    );
    this.entries.clear();
  }

  private keyFor(projectId: string, userId: string | null): string {
    // Sandboxes are per (user, project). A bare projectId would let one user
    // hijack another's sandbox if ids collide across accounts.
    return `${userId ?? "anon"}:${projectId}`;
  }

  /** Whether the E2B API key is configured at all. */
  isConfigured(): boolean {
    return Boolean(process.env.E2B_API_KEY?.trim());
  }

  /**
   * Get the live sandbox for a project, creating it if necessary.
   * Reuses an existing sandbox when present, otherwise spawns a fresh one.
   */
  async getOrCreate(
    projectId: string,
    userId: string | null,
  ): Promise<E2BSandbox> {
    const key = this.keyFor(projectId, userId);
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.sandbox;
    }

    const sdk = loadSdk();
    const sandbox = await sdk.create(this.template, {
      timeoutMs: this.idleTimeoutMs,
      projectSlug: projectId,
    });
    const entry: SandboxEntry = {
      sandbox,
      projectId,
      userId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    this.entries.set(key, entry);
    log.info("getOrCreate", "Sandbox created", {
      sandboxId: sandbox.sandboxId,
      projectId,
      userId,
    });
    return sandbox;
  }

  /** Get an existing sandbox without creating. Returns undefined if absent. */
  get(projectId: string, userId: string | null): E2BSandbox | undefined {
    const entry = this.entries.get(this.keyFor(projectId, userId));
    if (entry) entry.lastUsedAt = Date.now();
    return entry?.sandbox;
  }

  /** Destroy a project's sandbox (and forget it). */
  async destroy(projectId: string, userId: string | null): Promise<void> {
    const key = this.keyFor(projectId, userId);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    try {
      await entry.sandbox.kill();
      log.info("destroy", "Sandbox destroyed", {
        sandboxId: entry.sandbox.sandboxId,
        projectId,
        userId,
      });
    } catch (e) {
      log.warn("destroy", "Sandbox kill failed", { error: String(e) });
    }
  }

  /** Number of currently tracked sandboxes (useful for tests/metrics). */
  size(): number {
    return this.entries.size;
  }

  /** Destroy sandboxes idle longer than the timeout. */
  async sweepIdle(): Promise<number> {
    const now = Date.now();
    const stale: Array<[string, SandboxEntry]> = [];
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (now - entry.lastUsedAt > this.idleTimeoutMs) {
        stale.push([key, entry]);
      }
    }
    await Promise.allSettled(
      stale.map(async ([key, entry]) => {
        this.entries.delete(key);
        try {
          await entry.sandbox.kill();
        } catch (e) {
          log.warn("sweepIdle", "kill failed", {
            sandboxId: entry.sandbox.sandboxId,
            error: String(e),
          });
        }
      }),
    );
    if (stale.length > 0) {
      log.info("sweepIdle", "Swept idle sandboxes", { count: stale.length });
    }
    return stale.length;
  }
}

// ---------------------------------------------------------------------------
// File operations (convenience wrappers)
// ---------------------------------------------------------------------------

/** Normalise a user/agent-supplied path to a leading-slash, no `./` form. */
export function normalizeSandboxPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  // Collapse any run of slashes (leading or interior) to a single slash, then
  // ensure exactly one leading slash.
  const collapsed = trimmed.replace(/\/+/g, "/");
  const noLead = collapsed.replace(/^\/+/, "");
  return "/" + noLead;
}

export async function sandboxWriteFile(
  sandbox: E2BSandbox,
  path: string,
  content: string,
): Promise<void> {
  await sandbox.files.write(normalizeSandboxPath(path), content);
}

export async function sandboxReadFile(
  sandbox: E2BSandbox,
  path: string,
): Promise<string> {
  return sandbox.files.read(normalizeSandboxPath(path));
}

export async function sandboxDeleteFile(
  sandbox: E2BSandbox,
  path: string,
): Promise<void> {
  await sandbox.files.remove(normalizeSandboxPath(path));
}

export async function sandboxListFiles(
  sandbox: E2BSandbox,
  dir?: string,
): Promise<Array<{ name: string; type: "file" | "dir"; path: string }>> {
  return sandbox.files.list(dir ? normalizeSandboxPath(dir) : undefined);
}

export async function sandboxRunCommand(
  sandbox: E2BSandbox,
  command: string,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return sandbox.process.start({
    cmd: command,
    onStdout,
    onStderr,
  });
}

// ---------------------------------------------------------------------------
// Singleton for the API route layer
// ---------------------------------------------------------------------------

let defaultManager: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!defaultManager) {
    defaultManager = new SandboxManager();
  }
  return defaultManager;
}

/** Test-only: reset the singleton + any injected SDK. */
export function _resetSandboxManagerForTest(): void {
  defaultManager = null;
  setSdkAdapter(null);
}

export default SandboxManager;
