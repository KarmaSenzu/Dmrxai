// app/lib/sandbox-provider.ts
//
// Selects the sandbox backend (Docker or E2B) at runtime based on env vars,
// and wires it into the shared `SandboxManager`.
//
// The App Builder agent needs a live sandbox to execute tools (create_file,
// run_command, etc.). Historically this was E2B (cloud) or StackBlitz
// (client-side). For self-hosting, the default is now a local Docker daemon
// via `DockerAdapter`. Both backends implement the same `E2BSdkAdapter`
// interface, so the rest of the code is backend-agnostic.
//
// Env vars:
//   DMRXAI_SANDBOX_PROVIDER   "docker" (default) | "e2b"
//   DMRXAI_SANDBOX_DIR        host dir for sandbox workspaces (Docker only)
//   DMRXAI_PREVIEW_HOST       public preview base (Docker only)
//   DMRXAI_SANDBOX_IMAGE      sandbox image (Docker only, default node:20-alpine)
//   E2B_API_KEY               required when provider=e2b
//   E2B_TEMPLATE              sandbox template (E2B only)

import "server-only";

import { createLogger } from "@/lib/logger";
import { getSandboxManager, setSdkAdapter, type E2BSdkAdapter } from "@/lib/e2b-sandbox";
import { DockerAdapter } from "@/lib/docker-sandbox";

const log = createLogger("sandbox-provider");

export type SandboxProvider = "docker" | "e2b";

function resolveProvider(): SandboxProvider {
  const raw = process.env.DMRXAI_SANDBOX_PROVIDER?.trim().toLowerCase();
  if (raw === "e2b") return "e2b";
  // Default to Docker for self-hosting; fall back to E2B only if explicitly
  // requested AND an E2B API key is present (backwards compat).
  return "docker";
}

/**
 * Build the E2BSdkAdapter for the configured provider.
 * For Docker, this constructs a DockerAdapter from env-derived options.
 * For E2B, this returns null (the SandboxManager will lazy-load the E2B SDK).
 */
function buildAdapter(provider: SandboxProvider): E2BSdkAdapter | null {
  if (provider === "e2b") {
    // Let SandboxManager lazy-load the real E2B SDK.
    return null;
  }

  const workspaceBaseDir =
    process.env.DMRXAI_SANDBOX_DIR?.trim() || "/srv/dmrxai/sandboxes";
  const previewBaseHost =
    process.env.DMRXAI_PREVIEW_HOST?.trim() || "https://dmrxai.devplay.online";
  const image = process.env.DMRXAI_SANDBOX_IMAGE?.trim() || "node:20-alpine";

  log.info("buildAdapter", "Using Docker sandbox backend", {
    workspaceBaseDir,
    previewBaseHost,
    image,
  });

  return new DockerAdapter({
    workspaceHostDir: workspaceBaseDir, // fallback (static), overridden per-project via workspaceBaseDir
    workspaceBaseDir,
    previewBaseHost,
    image,
  });
}

let initialized = false;

/**
 * Configure the shared SandboxManager with the active backend.
 * Idempotent — safe to call on every request; only initialises once.
 */
export function initSandboxProvider(): void {
  if (initialized) return;
  const provider = resolveProvider();
  const adapter = buildAdapter(provider);
  if (adapter) {
    setSdkAdapter(adapter);
  }
  initialized = true;
  log.info("initSandboxProvider", "Sandbox provider initialised", { provider });
}

/** Test-only: reset provider state + injected SDK. */
export function _resetSandboxProviderForTest(): void {
  initialized = false;
  setSdkAdapter(null);
}

/**
 * Convenience: get the shared sandbox manager (initialising the provider if
 * needed). Callers can then use getOrCreate(projectId, userId) to obtain a
 * live sandbox for a project.
 */
export function getSandboxForBuilder() {
  initSandboxProvider();
  return getSandboxManager();
}

export default initSandboxProvider;
