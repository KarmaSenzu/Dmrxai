import { getSupabaseAdmin } from "./supabase";
import { createLogger } from "@/lib/logger";

const log = createLogger("supabase-projects");

export interface DBProject {
  id: string;
  user_id: string;
  title: string;
  sandbox_id: string | null;
  sandbox_status: string;
  plan_markdown: string | null;
  template: string;
  created_at: string;
  updated_at: string;
}

export interface DBProjectFile {
  id: string;
  project_id: string;
  path: string;
  content: string;
  updated_at: string;
}

export interface DBProjectMessage {
  id: string;
  project_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---- Projects ----

export async function createProject(userId: string, title?: string): Promise<DBProject> {
  log.debug("createProject", "Creating project", { userId, title });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("projects")
    .insert({ user_id: userId, title: title || "Untitled" })
    .select()
    .single();
  if (error) throw new Error(`createProject: ${error.message}`);
  log.info("createProject", "Project created", { projectId: data.id });
  return data;
}

// Authorization: every project lookup is scoped by user_id so a row owned by
// another user is treated as "not found" rather than leaking ownership.
export async function getProject(projectId: string, userId: string): Promise<DBProject | null> {
  log.debug("getProject", "Fetching project", { projectId, userId });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  if (error) {
    log.warn("getProject", "Project not found or error", { projectId, userId, error: error.message });
    return null;
  }
  return data;
}

export async function getUserProjects(userId: string): Promise<DBProject[]> {
  log.debug("getUserProjects", "Fetching user projects", { userId });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("projects")
    .select()
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`getUserProjects: ${error.message}`);
  return data ?? [];
}

// Authorization: filter by user_id so the update is a no-op when the caller
// doesn't own the row. The caller should treat zero matched rows as a 404.
export async function updateProject(
  projectId: string,
  userId: string,
  updates: Partial<Pick<DBProject, "title" | "sandbox_id" | "sandbox_status" | "plan_markdown">>,
): Promise<void> {
  log.debug("updateProject", "Updating project", { projectId, userId, updates });
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`updateProject: ${error.message}`);
}

// Authorization: filter by user_id so users cannot delete projects they
// don't own. Mismatches silently match zero rows.
export async function deleteProject(projectId: string, userId: string): Promise<void> {
  log.info("deleteProject", "Deleting project", { projectId, userId });
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteProject: ${error.message}`);
}

// ---- Project Files ----

// Authorization: project_files rows have no user_id of their own, so we
// verify ownership by reading the parent project first. If the caller
// doesn't own the project, return [] rather than leaking file existence.
export async function getProjectFiles(projectId: string, userId: string): Promise<DBProjectFile[]> {
  log.debug("getProjectFiles", "Fetching project files", { projectId, userId });
  const project = await getProject(projectId, userId);
  if (!project) {
    log.warn("getProjectFiles", "ownership check failed", { projectId, userId });
    return [];
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("project_files")
    .select()
    .eq("project_id", projectId);
  if (error) throw new Error(`getProjectFiles: ${error.message}`);
  return data ?? [];
}

// Authorization: verify the caller owns the project before mutating its
// files. A non-owner gets a no-op rather than a thrown error so we don't
// reveal whether the project exists.
export async function syncProjectFiles(
  projectId: string,
  userId: string,
  files: Record<string, string>,
): Promise<void> {
  const project = await getProject(projectId, userId);
  if (!project) {
    log.warn("syncProjectFiles", "ownership check failed", { projectId, userId });
    return;
  }

  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Upsert all files
  const rows = Object.entries(files).map(([path, content]) => ({
    project_id: projectId,
    path,
    content,
    updated_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await sb
      .from("project_files")
      .upsert(rows, { onConflict: "project_id,path" });
    if (error) throw new Error(`syncProjectFiles: ${error.message}`);
  }

  // Delete files that no longer exist.
  //
  // Security: previously we built a literal `not("path", "in", "(...)")`
  // expression by interpolating each path into the filter string. Any path
  // containing a quote or comma broke that quoting and was a SQL/PostgREST
  // injection vector. Instead, fetch existing paths and use the parameterized
  // `.in("path", paths)` form, which Supabase encodes safely.
  const currentPaths = new Set(Object.keys(files));

  const { data: existing, error: fetchErr } = await sb
    .from("project_files")
    .select("path")
    .eq("project_id", projectId);
  if (fetchErr) {
    log.warn("syncProjectFiles", "Fetch existing paths failed", {
      projectId,
      error: fetchErr.message,
    });
    return;
  }

  const toDelete = (existing ?? [])
    .map((row: { path: string }) => row.path)
    .filter((p: string) => !currentPaths.has(p));

  if (toDelete.length === 0) return;

  const { error: delError } = await sb
    .from("project_files")
    .delete()
    .eq("project_id", projectId)
    .in("path", toDelete);
  // Ignore delete errors for empty sets
  if (delError && !delError.message.includes("0 rows")) {
    log.warn("syncProjectFiles", "Delete warning", { projectId, error: delError.message });
  }
}

// ---- Project Messages ----

// Authorization: same pattern as getProjectFiles — verify project ownership
// before reading messages, and return [] on mismatch.
export async function getProjectMessages(projectId: string, userId: string): Promise<DBProjectMessage[]> {
  log.debug("getProjectMessages", "Fetching project messages", { projectId, userId });
  const project = await getProject(projectId, userId);
  if (!project) {
    log.warn("getProjectMessages", "ownership check failed", { projectId, userId });
    return [];
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("project_messages")
    .select()
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getProjectMessages: ${error.message}`);
  return data ?? [];
}

// Authorization: verify ownership before appending messages so a
// non-owner can't write into another user's project transcript.
export async function addProjectMessage(
  projectId: string,
  userId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: Record<string, unknown>,
): Promise<DBProjectMessage | null> {
  log.debug("addProjectMessage", "Adding message", { projectId, userId, role });
  const project = await getProject(projectId, userId);
  if (!project) {
    log.warn("addProjectMessage", "ownership check failed", { projectId, userId });
    return null;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("project_messages")
    .insert({ project_id: projectId, role, content, metadata: metadata ?? {} })
    .select()
    .single();
  if (error) throw new Error(`addProjectMessage: ${error.message}`);
  return data;
}
