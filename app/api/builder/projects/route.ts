export const runtime = "nodejs";

import { NextRequest } from "next/server";
import {
  createProject,
  getUserProjects,
} from "@/lib/supabase-projects";
import { requireUser } from "@/lib/auth-server";
import { createLogger } from "@/lib/logger";
import { readJsonWithLimit, DEFAULT_MAX_BODY } from "@/lib/body-limit";

const log = createLogger("api/builder-projects");

// GET /api/builder/projects
// Returns the projects belonging to the authenticated user.
export async function GET(req: NextRequest) {
  log.info("GET", "Request received");

  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  try {
    log.debug("GET", "Fetching user projects", { userId: user.id });
    const projects = await getUserProjects(user.id);
    return Response.json({ projects });
  } catch (e) {
    log.error("GET", "Failed to fetch projects", { error: String(e) });
    return Response.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}

// POST /api/builder/projects { title? }
// Creates a project owned by the authenticated user.
export async function POST(req: NextRequest) {
  log.info("POST", "Request received");

  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  try {
    let body: { title?: unknown } = {};
    try {
      body = await readJsonWithLimit<{ title?: unknown }>(req, DEFAULT_MAX_BODY);
    } catch (err) {
      // Tolerate empty / invalid JSON for backward compat — POST without body
      // is a common way to create a project. Only propagate size-limit (413).
      if (err instanceof Response) {
        if (err.status === 413) return err;
        body = {};
      } else {
        throw err;
      }
    }
    const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
    // Allow no title (creates with default), but reject malformed/oversized
    // values to keep the projects table sane.
    if (titleRaw && titleRaw.length > 200) {
      return Response.json(
        { error: "Title must be 1-200 characters" },
        { status: 400 },
      );
    }
    const title = titleRaw || undefined;
    log.debug("POST", "Creating project", { userId: user.id, title });
    const project = await createProject(user.id, title);
    return Response.json({ project });
  } catch (e) {
    log.error("POST", "Failed to create project", { error: String(e) });
    return Response.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
