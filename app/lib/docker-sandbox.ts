// app/lib/docker-sandbox.ts
//
// Docker-backed sandbox adapter for the App Builder.
//
// This implements the same `E2BSandbox` / `E2BSdkAdapter` interfaces defined in
// `e2b-sandbox.ts`, but backed by the local Docker daemon instead of the E2B
// cloud. Because dmrxai is self-hosted on a 16 GB server, running a container
// per project is effectively free (no per-second sandbox billing) while still
// giving us a real filesystem + shell + dev server.
//
// Security model (see docs/SELF_HOSTED_APP_BUILDER.md §15/§17):
//   - Each sandbox is a container on a dedicated network with egress allowlist
//     (only `registry.npmjs.org`) so the user can `npm install` but cannot
//     reach the internal network, 9Router, or the LLM provider.
//   - read-only rootfs + resource limits + dropped capabilities.
//   - The Docker socket is NEVER exposed to the sandbox.
//
// Like `e2b-sandbox.ts`, this module is server-only and lazily loads `dockerode`
// so the client/Edge bundle never pulls it in. The Docker client is injectable
// for tests.

import "server-only";

import { createLogger } from "@/lib/logger";
import type { E2BSandbox, E2BSdkAdapter, SandboxFs, SandboxProcess } from "@/lib/e2b-sandbox";
// Static import (not dynamic require) — Next.js standalone tracing includes
// dockerode when imported statically, and webpack ESM bundles don't expose a
// global `require` that `new Function("require")` could reach.
import Docker from "dockerode";

const log = createLogger("docker-sandbox");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of `client.createContainer` — a handle to a single container. */
export interface DockerContainer {
  id: string;
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  remove(): Promise<unknown>;
  exec(opts: Record<string, unknown>): Promise<DockerExec>;
}

export interface DockerExec {
  start(opts: { hijack?: boolean; stdin?: boolean }): Promise<NodeJS.ReadableStream>;
  inspect(): Promise<{ exitCode: number }>;
}

/** Minimal shape of the dockerode client we depend on. */
export interface DockerClient {
  createContainer(opts: Record<string, unknown>): Promise<DockerContainer>;
  getContainer(id: string): DockerContainer;
  /** List containers (all states) so we can find an existing sandbox by name. */
  listContainers(opts: { all?: boolean }): Promise<Array<{ Id: string; Names?: string[] }>>;
}

/** Options that shape how a sandbox container is created. */
export interface DockerSandboxOptions {
  /** Host directory mounted as the project workspace. */
  workspaceHostDir: string;
  /** Container path for the workspace (default /workspace). */
  workspaceContainerPath?: string;
  /** Docker image to run. */
  image?: string;
  /** Public base for preview URLs, e.g. "https://dmrxai.devplay.online". */
  previewBaseHost?: string;
  /** Stable subdomain slug for this project (used in wildcard preview URLs). */
  projectSlug?: string;
  /**
   * If set, each project gets its own subdirectory under this base:
   * `<workspaceBaseDir>/<projectSlug>`. Used by the provider so concurrent
   * projects don't share a workspace. Takes precedence over workspaceHostDir
   * when a projectSlug is supplied at create() time.
   */
  workspaceBaseDir?: string;
  /** Resource limits (e.g. "512m", "0.5", 128). */
  memLimit?: string;
  cpus?: string;
  pidsLimit?: number;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const DEFAULT_IMAGE = env("DMRXAI_SANDBOX_IMAGE", "node:20-alpine");
const DEFAULT_WORKSPACE = "/workspace";

// ---------------------------------------------------------------------------
// Docker client loading (lazy + injectable for tests)
// ---------------------------------------------------------------------------

let injectedClient: DockerClient | null = null;
let clientInitTried = false;
let loadedClient: DockerClient | null = null;

/** Test-only: inject a fake Docker client. */
export function _setDockerClientForTest(client: DockerClient | null): void {
  injectedClient = client;
  clientInitTried = false;
  loadedClient = null;
}

function loadDockerClient(): DockerClient {
  if (injectedClient) return injectedClient;
  if (clientInitTried && loadedClient) return loadedClient;
  clientInitTried = true;

  try {
    // dockerode's default export is the constructor. It may be ESM- or
    // CJS-interop shaped depending on the bundler, so handle both.
    const Ctor = (Docker as unknown as {
      default?: new (opts?: unknown) => DockerClient;
    }).default ?? (Docker as unknown as new (opts?: unknown) => DockerClient);

    if (typeof Ctor !== "function") {
      throw new Error("dockerode loaded but no constructor found");
    }
    loadedClient = new Ctor();
    return loadedClient;
  } catch (e) {
    log.error("loadDockerClient", "Failed to load dockerode", { error: String(e) });
    throw new Error(
      "dockerode is not installed or the Docker daemon is unreachable. Run `npm install dockerode`.",
    );
  }
}

// ---------------------------------------------------------------------------
// Sandbox implementation
// ---------------------------------------------------------------------------

class DockerSandbox implements E2BSandbox {
  public readonly sandboxId: string;
  public readonly files: SandboxFs;
  public readonly process: SandboxProcess;
  private container: DockerContainer;
  private workspace: string;
  private previewBaseHost: string;
  private projectSlug: string | undefined;
  private stopped = false;

  constructor(container: DockerContainer, opts: DockerSandboxOptions) {
    this.container = container;
    this.sandboxId = container.id;
    this.workspace = opts.workspaceContainerPath ?? DEFAULT_WORKSPACE;
    this.previewBaseHost = opts.previewBaseHost ?? "https://dmrxai.devplay.online";
    this.projectSlug = opts.projectSlug;

    this.files = {
      write: (path, content) => this.writeFile(path, content),
      read: (path) => this.readFile(path),
      remove: (path) => this.removeFile(path),
      list: (dir) => this.listFiles(dir),
    };

    this.process = {
      start: (o) => this.exec(o.cmd, o.onStdout, o.onStderr),
    };
  }

  private toContainerPath(path: string): string {
    const p = path.replace(/^\/+/, "");
    return `${this.workspace}/${p}`;
  }

  private async writeFile(path: string, content: string): Promise<unknown> {
    const containerPath = this.toContainerPath(path);
    const dir = containerPath.slice(0, containerPath.lastIndexOf("/"));
    // Write via a heredoc so content with quotes/backslashes is safe.
    const cmd = `mkdir -p '${dir}' && cat > '${containerPath}' <<'DMRXAI_EOF'\n${content}\nDMRXAI_EOF`;
    return this.exec(cmd);
  }

  private async readFile(path: string): Promise<string> {
    const containerPath = this.toContainerPath(path);
    const res = await this.exec(`cat '${containerPath}'`);
    return res.stdout;
  }

  private async removeFile(path: string): Promise<unknown> {
    const containerPath = this.toContainerPath(path);
    return this.exec(`rm -f '${containerPath}'`);
  }

  private async listFiles(
    dir?: string,
  ): Promise<Array<{ name: string; type: "file" | "dir"; path: string }>> {
    const target = dir ? this.toContainerPath(dir) : this.workspace;
    const res = await this.exec(
      `find '${target}' -maxdepth 1 -mindepth 1 -printf '%f\\t%y\\n' 2>/dev/null`,
    );
    const entries: Array<{ name: string; type: "file" | "dir"; path: string }> = [];
    for (const line of res.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [name, kind] = line.split("\t");
      if (!name) continue;
      const relPath = (dir ? dir.replace(/\/+$/, "") + "/" : "/") + name;
      entries.push({
        name,
        type: kind === "d" ? "dir" : "file",
        path: relPath,
      });
    }
    return entries;
  }

  private async exec(
    cmd: string,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const execHandle = await this.container.exec({
      Cmd: ["sh", "-c", cmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    let stdout = "";
    let stderr = "";
    const stream = await execHandle.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      stream.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        // In hijack mode docker multiplexes stdout/stderr with an 8-byte
        // header per frame. For our logging/usage we merge into stdout;
        // production callers that need exact separation can parse the header.
        stdout += text;
        onStdout?.(text);
      });
      stream.on("end", resolve);
      stream.on("error", resolve);
    });
    const inspect = await execHandle.inspect();
    return { exitCode: inspect.exitCode, stdout, stderr };
  }

  getHost(port: number): string {
    // Path-based preview: https://preview.devplay.online/<slug>
    // (wildcard multi-level subdomains need paid ACM on Cloudflare, so we use a
    // single level-1 host + path routing instead). If no projectSlug, fall back
    // to the container id so the URL is always unique.
    const base = this.previewBaseHost.replace(/\/+$/, "");
    const slug = this.projectSlug ?? this.sandboxId.slice(0, 12);
    return `${base}/${slug}`;
  }

  async kill(): Promise<unknown> {
    if (this.stopped) return;
    this.stopped = true;
    try {
      await this.container.stop();
    } catch (e) {
      log.warn("kill", "container stop failed", { sandboxId: this.sandboxId, error: String(e) });
    }
    try {
      await this.container.remove();
    } catch (e) {
      log.warn("kill", "container remove failed", { sandboxId: this.sandboxId, error: String(e) });
    }
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class DockerAdapter implements E2BSdkAdapter {
  constructor(private opts: DockerSandboxOptions) {}

  async create(
    _template: string,
    opts?: { timeoutMs?: number; projectSlug?: string },
  ): Promise<E2BSandbox> {
    const client = loadDockerClient();
    const image = this.opts.image ?? DEFAULT_IMAGE;
    const workspace = this.opts.workspaceContainerPath ?? DEFAULT_WORKSPACE;
    const projectSlug = opts?.projectSlug;

    // Per-project workspace dir: <baseDir>/<projectSlug>. Falls back to the
    // static workspaceHostDir when either is unavailable.
    const workspaceHostDir =
      this.opts.workspaceBaseDir && projectSlug
        ? `${this.opts.workspaceBaseDir.replace(/\/+$/, "")}/${projectSlug}`
        : this.opts.workspaceHostDir;

    // Deterministic container name so the reverse proxy (Caddy) can resolve
    // `dmrxai-sb-<slug>` on the sandbox network via Docker DNS. Without a
    // stable name, the wildcard preview routing cannot find the container.
    const containerName = projectSlug
      ? `dmrxai-sb-${projectSlug}`
      : `dmrxai-sb-${Date.now().toString(36)}`;

    const container = await client.createContainer({
      name: containerName,
      Image: image,
      Cmd: ["sleep", "infinity"], // keep alive; agent drives it via exec
      WorkingDir: workspace,
      ExposedPorts: { "5173/tcp": {} },
      Env: [
        // ReadonlyRootfs makes /root/.npm unwritable, which broke `npm install`
        // with ENOENT. Point npm's cache at the writable /workspace mount, and
        // give node/npm a writable HOME there too.
        "NPM_CONFIG_CACHE=/workspace/.npm",
        "HOME=/workspace",
      ],
      Labels: {
        "dmrxai.sandbox": "true",
        "dmrxai.project_slug": projectSlug ?? "",
        "dmrxai.preview_host": this.opts.previewBaseHost ?? "",
      },
      HostConfig: {
        Binds: [`${workspaceHostDir}:${workspace}`],
        PortBindings: { "5173/tcp": [{ HostPort: "0" }] },
        Memory: this.opts.memLimit ? parseInt(this.opts.memLimit, 10) : 512 * 1024 * 1024,
        NanoCpus: this.opts.cpus ? Math.floor(parseFloat(this.opts.cpus) * 1e9) : 500_000_000,
        PidsLimit: this.opts.pidsLimit ?? 128,
        ReadonlyRootfs: true,
        // Writable scratch dirs needed by npm/node despite read-only rootfs.
        Tmpfs: {
          "/tmp": "rw,noexec,nosuid,size=256m",
          "/root/.npm": "rw,noexec,nosuid,size=256m",
        },
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        NetworkMode: "dmrxai-sandbox-net",
      },
    });

    await container.start();
    log.info("create", "Sandbox container started", {
      containerId: container.id,
      containerName,
      image,
      workspaceHostDir,
    });

    return new DockerSandbox(container, {
      ...this.opts,
      workspaceHostDir,
      projectSlug,
    });
  }

  async connect(sandboxId: string): Promise<E2BSandbox> {
    const client = loadDockerClient();
    const container = client.getContainer(sandboxId);
    return new DockerSandbox(container, this.opts);
  }

  /**
   * Reconnect to an existing sandbox container by its deterministic name
   * (dmrxai-sb-<slug>). Returns null if no such container exists. Used after an
   * app restart, when the in-memory SandboxManager has lost its reference but
   * the Docker container is still alive (within the 3-day TTL).
   */
  async connectByName(name: string): Promise<E2BSandbox | null> {
    const client = loadDockerClient();
    const containers = await client.listContainers({ all: true });
    const found = containers.find((c) =>
      (c.Names ?? []).some((n) => n === `/${name}` || n === name),
    );
    if (!found) return null;
    const container = client.getContainer(found.Id);
    return new DockerSandbox(container, this.opts);
  }
}

export default DockerAdapter;
