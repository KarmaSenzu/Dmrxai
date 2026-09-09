import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PassThrough } from "stream";
import {
  DockerAdapter,
  _setDockerClientForTest,
  type DockerClient,
  type DockerContainer,
  type DockerExec,
} from "@/lib/docker-sandbox";

// ---------------------------------------------------------------------------
// Fake Docker client for tests (no real Docker daemon needed).
// ---------------------------------------------------------------------------

function makeFakeContainer(id: string, files: Map<string, string>) {
  const container: DockerContainer = {
    id,
    async start() {},
    async stop() {},
    async remove() {},
    async exec(opts): Promise<DockerExec> {
      const cmd = (opts.Cmd as string[]).join(" ");
      // Parse simple `cat 'path'` / `rm -f 'path'` / `find ...` commands for
      // assertions, but mostly just emit a deterministic stdout.
      const stream = new PassThrough();
      const execHandle: DockerExec = {
        async start() {
          // Emit a couple of frames then end, so stream consumers resolve.
          queueMicrotask(() => {
            stream.write(`$ ${cmd}\n`);
            stream.end();
          });
          return stream;
        },
        async inspect() {
          return { exitCode: 0 };
        },
      };
      return execHandle;
    },
  };
  return container;
}

function makeFakeClient(): DockerClient & { created: string[] } {
  const created: string[] = [];
  let counter = 0;
  return {
    created,
    async createContainer(opts) {
      const id = `container-${++counter}`;
      created.push(id);
      return makeFakeContainer(id, new Map());
    },
    getContainer(id) {
      return makeFakeContainer(id, new Map());
    },
    async listContainers() {
      return [];
    },
  };
}

describe("DockerAdapter", () => {
  let client: ReturnType<typeof makeFakeClient>;

  beforeEach(() => {
    client = makeFakeClient();
    _setDockerClientForTest(client);
  });

  afterEach(() => {
    _setDockerClientForTest(null);
  });

  it("creates a sandbox with a container id and starts it", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
    });
    const sandbox = await adapter.create("node", {});
    expect(sandbox.sandboxId).toMatch(/^container-/);
    expect(client.created.length).toBe(1);
  });

  it("exposes files.write/read/remove/list", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
    });
    const sandbox = await adapter.create("node", {});

    await expect(sandbox.files.write("/src/App.tsx", "x")).resolves.toBeDefined();
    await expect(sandbox.files.read("/src/App.tsx")).resolves.toBeTypeOf("string");
    await expect(sandbox.files.remove("/src/App.tsx")).resolves.toBeDefined();
    const list = await sandbox.files.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it("runs a command and returns exit code + stdout", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
    });
    const sandbox = await adapter.create("node", {});
    const out: string[] = [];
    const res = await sandbox.process.start({
      cmd: "npm run dev",
      onStdout: (d) => out.push(d),
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("npm run dev");
    expect(out.length).toBeGreaterThan(0);
  });

  it("builds a path-based preview URL from projectSlug", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
      previewBaseHost: "https://preview.devplay.online",
    });
    const sandbox = await adapter.create("node", { projectSlug: "proj1" });
    expect(sandbox.getHost(5173)).toBe("https://preview.devplay.online/proj1");
  });

  it("falls back to container id path when no projectSlug", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
      previewBaseHost: "https://preview.devplay.online",
    });
    const sandbox = await adapter.create("node", {});
    // Without projectSlug, the path segment is derived from the container id.
    expect(sandbox.getHost(5173)).toMatch(/^https:\/\/preview\.devplay\.online\/container-\d+$/);
  });

  it("connect() returns a sandbox for an existing container id", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
    });
    const sandbox = await adapter.connect("existing-container");
    expect(sandbox.sandboxId).toBe("existing-container");
  });

  it("kill() stops and removes without throwing", async () => {
    const adapter = new DockerAdapter({
      workspaceHostDir: "/srv/dmrxai/sandboxes/proj1",
    });
    const sandbox = await adapter.create("node", {});
    await expect(sandbox.kill()).resolves.toBeUndefined();
  });
});
