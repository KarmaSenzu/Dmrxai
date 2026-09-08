import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  SandboxManager,
  normalizeSandboxPath,
  setSdkAdapter,
  _resetSandboxManagerForTest,
  type E2BSdkAdapter,
  type E2BSandbox,
} from "@/lib/e2b-sandbox";

// ---------------------------------------------------------------------------
// Fake E2B sandbox + SDK for tests (no live API key needed).
// ---------------------------------------------------------------------------

function makeFakeSandbox(id: string): E2BSandbox {
  const fsStore = new Map<string, string>();
  return {
    sandboxId: id,
    files: {
      async write(path, content) {
        fsStore.set(path, content);
      },
      async read(path) {
        const v = fsStore.get(path);
        if (v === undefined) throw new Error(`ENOENT: ${path}`);
        return v;
      },
      async remove(path) {
        fsStore.delete(path);
      },
      async list() {
        return Array.from(fsStore.keys()).map((path) => ({
          name: path.split("/").pop() ?? path,
          type: "file" as const,
          path,
        }));
      },
    },
    process: {
      async start({ cmd, onStdout, onStderr }) {
        onStdout?.(`$ ${cmd}\n`);
        onStdout?.("ok\n");
        return { exitCode: 0, stdout: "ok\n", stderr: "" };
      },
    },
    getHost(port) {
      return `https://${id}.e2b.dev:${port}`;
    },
    async kill() {
      /* noop */
    },
  };
}

function makeFakeSdk(): E2BSdkAdapter & {
  created: string[];
  killed: string[];
} {
  const created: string[] = [];
  const killed: string[] = [];
  let counter = 0;
  return {
    created,
    killed,
    async create(_template, _opts) {
      const id = `sb-${++counter}`;
      created.push(id);
      return makeFakeSandbox(id);
    },
    async connect(id) {
      return makeFakeSandbox(id);
    },
  };
}

describe("e2b-sandbox normalizeSandboxPath", () => {
  it("normalises relative paths to leading-slash", () => {
    expect(normalizeSandboxPath("src/App.tsx")).toBe("/src/App.tsx");
    expect(normalizeSandboxPath("./src/App.tsx")).toBe("/src/App.tsx");
  });

  it("collapses redundant leading slashes", () => {
    expect(normalizeSandboxPath("//src//App.tsx")).toBe("/src/App.tsx");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSandboxPath("  package.json  ")).toBe("/package.json");
  });
});

describe("SandboxManager", () => {
  let sdk: ReturnType<typeof makeFakeSdk>;

  beforeEach(() => {
    sdk = makeFakeSdk();
    setSdkAdapter(sdk);
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetSandboxManagerForTest();
    vi.useRealTimers();
  });

  it("creates a sandbox once and reuses it for the same project+user", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0 });
    const a = await mgr.getOrCreate("p1", "u1");
    const b = await mgr.getOrCreate("p1", "u1");
    expect(a.sandboxId).toBe(b.sandboxId);
    expect(sdk.created.length).toBe(1);
    expect(mgr.size()).toBe(1);
    await mgr.dispose();
  });

  it("isolates sandboxes across users for the same project id", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0 });
    const u1 = await mgr.getOrCreate("p1", "u1");
    const u2 = await mgr.getOrCreate("p1", "u2");
    expect(u1.sandboxId).not.toBe(u2.sandboxId);
    expect(mgr.size()).toBe(2);
    await mgr.dispose();
  });

  it("isolates sandboxes across projects for the same user", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0 });
    const p1 = await mgr.getOrCreate("p1", "u1");
    const p2 = await mgr.getOrCreate("p2", "u1");
    expect(p1.sandboxId).not.toBe(p2.sandboxId);
    expect(mgr.size()).toBe(2);
    await mgr.dispose();
  });

  it("destroys a sandbox and forgets it", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0 });
    await mgr.getOrCreate("p1", "u1");
    expect(mgr.size()).toBe(1);
    await mgr.destroy("p1", "u1");
    expect(mgr.size()).toBe(0);
  });

  it("destroying a non-existent sandbox is a no-op", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0 });
    await expect(mgr.destroy("nope", "u1")).resolves.toBeUndefined();
    expect(mgr.size()).toBe(0);
  });

  it("sweeps idle sandboxes after the timeout", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0, idleTimeoutMs: 1000 });
    await mgr.getOrCreate("p1", "u1");
    expect(mgr.size()).toBe(1);

    // Advance past the idle timeout.
    vi.advanceTimersByTime(2000);
    const swept = await mgr.sweepIdle();
    expect(swept).toBe(1);
    expect(mgr.size()).toBe(0);
    await mgr.dispose();
  });

  it("does not sweep recently-used sandboxes", async () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0, idleTimeoutMs: 5000 });
    await mgr.getOrCreate("p1", "u1");
    vi.advanceTimersByTime(1000);
    const swept = await mgr.sweepIdle();
    expect(swept).toBe(0);
    expect(mgr.size()).toBe(1);
    await mgr.dispose();
  });

  it("isConfigured reflects E2B_API_KEY presence", () => {
    const mgr = new SandboxManager({ sweepIntervalMs: 0 });
    expect(mgr.isConfigured()).toBe(false);
    // E2B_API_KEY is not set in the happy-dom test env.
  });
});
