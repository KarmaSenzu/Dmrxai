export const runtime = "nodejs";

import { NextRequest } from "next/server";
import {
  getProject,
  deleteProject,
  getProjectFiles,
  getProjectMessages,
} from "@/lib/supabase-projects";
import { requireUser } from "@/lib/auth-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/builder-projects-id");

interface Ctx {
  params: { id: string };
}

// GET /api/builder/projects/:id?include=messages,files
export async function GET(req: NextRequest, { params }: Ctx) {
  log.info("GET", "Request received");

  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  const { id } = params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const url = new URL(req.url);
  const include = (url.searchParams.get("include") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    log.debug("GET", "Fetching project", { projectId: id, include });
    // getProject filters by user_id internally, so a non-owner gets null
    // and we surface a 404 — never leak that the project exists.
    const project = await getProject(id, user.id);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    const result: Record<string, unknown> = { project };
    if (include.includes("messages")) {
      result.messages = await getProjectMessages(id, user.id);
    }
    if (include.includes("files")) {
      result.files = await getProjectFiles(id, user.id);
    }
    return Response.json(result);
  } catch (e) {
    log.error("GET", "Failed to fetch project", { error: String(e), projectId: id });
    return Response.json(
      { error: "Failed to fetch project" },
      { status: 500 },
    );
  }
}

// DELETE /api/builder/projects/:id
export async function DELETE(req: NextRequest, { params }: Ctx) {
  log.info("DELETE", "Request received");

  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  const { id } = params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    log.debug("DELETE", "Deleting project", { projectId: id });
    // getProject filters by user_id; non-owner sees the same response as
    // "no such project" (idempotent {ok:true}) so existence isn't leaked.
    const project = await getProject(id, user.id);
    if (!project) {
      return Response.json({ ok: true });
    }
    await deleteProject(id, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    log.error("DELETE", "delete project failed", { error: String(e), projectId: id });
    return Response.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
