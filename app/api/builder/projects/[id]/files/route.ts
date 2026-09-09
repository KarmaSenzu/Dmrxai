export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getProject } from "@/lib/supabase-projects";
import { getSandboxForBuilder } from "@/lib/sandbox-provider";
import { sandboxListFiles, sandboxReadFile } from "@/lib/e2b-sandbox";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/builder-files");

interface Ctx {
  params: { id: string };
}

// GET /api/builder/projects/:id/files
// Returns the project's files read fresh from the live sandbox (the source of
// truth). Used on project open/refresh so the UI reflects what's actually in
// the container, not a possibly-stale localStorage cache.
export async function GET(req: NextRequest, { params }: Ctx) {
  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  const projectId = params.id;
  if (!projectId) return Response.json({ error: "id required" }, { status: 400 });

  try {
    const project = await getProject(projectId, user.id);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const manager = getSandboxForBuilder();
    // Reconnect if needed (this also recovers the sandbox after an app restart).
    const sandbox = await manager.getOrCreate(projectId, user.id);

    const entries = await sandboxListFiles(sandbox);
    const files: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.type !== "file") continue;
      try {
        files[entry.path] = await sandboxReadFile(sandbox, entry.path);
      } catch {
        // skip unreadable file
      }
    }

    log.info("GET", "Fetched project files", { projectId, count: Object.keys(files).length });
    return Response.json({ files });
  } catch (e) {
    log.error("GET", "fetch files failed", { error: String(e), projectId });
    return Response.json({ error: "Failed to fetch files" }, { status: 500 });
  }
}
