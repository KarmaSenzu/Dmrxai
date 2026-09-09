export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { requireUser } from "@/lib/auth-server";
import { createProject } from "@/lib/supabase-projects";
import { getSandboxForBuilder } from "@/lib/sandbox-provider";
import { sandboxWriteFile } from "@/lib/e2b-sandbox";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/builder-import");

const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB cap

// POST /api/builder/projects/import
// Accepts an uploaded .zip (multipart form field "file"), creates a new project
// and writes the extracted files into its sandbox. Returns the new project so
// the client can open it. This is the "bring your homework back" part of the
// kelas+PR model.
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch (response) {
    return response as Response;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  if (file.size > MAX_ZIP_BYTES) {
    return Response.json({ error: "ZIP terlalu besar (max 25 MB)" }, { status: 413 });
  }

  let title = "";
  const titleField = form.get("title");
  if (typeof titleField === "string") title = titleField.trim().slice(0, 200);

  try {
    const buf = Buffer.from(await file.arrayBuffer());

    // Parse + validate the zip before creating anything.
    let zip: AdmZip;
    try {
      zip = new AdmZip(buf);
    } catch {
      return Response.json({ error: "File ZIP tidak valid" }, { status: 400 });
    }

    const entries = zip.getEntries();
    const fileEntries = entries.filter((e) => !e.isDirectory);

    // Cap number of files to avoid a zip bomb.
    if (fileEntries.length > 500) {
      return Response.json({ error: "Terlalu banyak file (max 500)" }, { status: 400 });
    }

    // Create project + sandbox.
    const project = await createProject(user.id, title || "Imported project");
    const manager = getSandboxForBuilder();
    const sandbox = await manager.getOrCreate(project.id, user.id);

    let written = 0;
    for (const entry of fileEntries) {
      // Normalise path: strip leading slash/./ and reject path traversal.
      let relPath = entry.entryName.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
      if (!relPath || relPath.includes("..")) continue;
      const content = entry.getData().toString("utf8");
      await sandboxWriteFile(sandbox, "/" + relPath, content);
      written++;
    }

    log.info("POST", "Imported project", { projectId: project.id, written });
    return Response.json({ project, filesWritten: written });
  } catch (e) {
    log.error("POST", "import failed", { error: String(e) });
    return Response.json({ error: "Failed to import project" }, { status: 500 });
  }
}
