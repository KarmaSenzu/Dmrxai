export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { requireUser } from "@/lib/auth-server";
import { getProject } from "@/lib/supabase-projects";
import { getSandboxForBuilder } from "@/lib/sandbox-provider";
import { sandboxListFiles, sandboxReadFile } from "@/lib/e2b-sandbox";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/builder-export");

interface Ctx {
  params: { id: string };
}

// GET /api/builder/projects/:id/export
// Downloads the project's files (from the live sandbox) as a .zip. This is the
// "bring your work home" part of the kelas+PR model: users export before the
// 3-day sandbox TTL expires so they can re-import later.
export async function GET(req: NextRequest, { params }: Ctx) {
  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  const projectId = params.id;
  if (!projectId) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  try {
    // Ownership check (non-owner gets 404, not a leak).
    const project = await getProject(projectId, user.id);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const manager = getSandboxForBuilder();
    const sandbox = manager.get(projectId, user.id);
    if (!sandbox) {
      return Response.json(
        { error: "Sandbox tidak aktif. Jalankan build dulu sebelum export." },
        { status: 409 },
      );
    }

    const entries = await sandboxListFiles(sandbox);
    const zip = new AdmZip();
    let fileCount = 0;

    for (const entry of entries) {
      if (entry.type !== "file") continue;
      // Strip the leading slash so the zip has clean relative paths.
      const relPath = entry.path.replace(/^\/+/, "");
      if (!relPath) continue;
      const content = await sandboxReadFile(sandbox, entry.path);
      zip.addFile(relPath, Buffer.from(content, "utf8"));
      fileCount++;
    }

    if (fileCount === 0) {
      return Response.json(
        { error: "Belum ada file untuk di-export." },
        { status: 404 },
      );
    }

    const buffer = zip.toBuffer();
    const slug = project.title?.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || projectId;
    const filename = `${slug}.zip`;

    log.info("GET", "Exported project", { projectId, fileCount });
    // Convert Buffer → Uint8Array so it satisfies Response's BodyInit type.
    const bytes = new Uint8Array(buffer);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    log.error("GET", "export failed", { error: String(e), projectId });
    return Response.json({ error: "Failed to export project" }, { status: 500 });
  }
}
