"use client";

import { getSupabaseBrowser } from "./supabase-browser";

// ---- Types ----

export interface BuilderProject {
  id: string;
  title: string;
  sandboxId: string | null;
  sandboxStatus: "idle" | "running" | "paused" | "destroyed";
  createdAt: number;
  updatedAt: number;
  /** Outcome of the most recent agent run. Used by the UI / mode detection
   * to decide whether the next prompt should resume an interrupted build
   * instead of going back into architect mode. Optional for backwards
   * compatibility with existing localStorage payloads. */
  lastRunStatus?: "ok" | "interrupted" | "error";
  lastRunAt?: number;
  /** User-selected agent mode for this project. "auto" lets the server
   * detect; "architect" forces planning, "code" forces build. Defaults to
   * "auto" when missing for backwards compatibility. */
  preferredMode?: "auto" | "architect" | "code";
  /** Per-project model id override. Falls back to the user-default model
   * from `useSettings` when missing. */
  model?: string;
}

export interface BuilderProjectMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: string;
    success?: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

export interface BuilderProjectData {
  project: BuilderProject;
  messages: BuilderProjectMessage[];
  files: Record<string, string>; // path → content
}

// ---- Constants ----

// localStorage keys are namespaced per authenticated user so one user's cached
// chat/projects can't leak to another user sharing the same browser.
const BASE_KEY = "dmrxai:builder";
let currentUserId: string | null = null;

/** Set the active user id. All subsequent localStorage reads/writes are scoped
 *  to this user. Call this as soon as the authenticated user is known. */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}

function storageKey(): string {
  return currentUserId
    ? `${BASE_KEY}:${currentUserId}:projects`
    : `${BASE_KEY}:projects`;
}

function lastOpenedKey(): string {
  return currentUserId
    ? `${BASE_KEY}:${currentUserId}:lastOpenedProjectId`
    : `${BASE_KEY}:lastOpenedProjectId`;
}

const MAX_PROJECTS = 30;
const MAX_FILES_PER_PROJECT = 100;
const MAX_FILE_SIZE = 100_000; // 100KB per file

// ---- Core CRUD ----

function loadAll(): BuilderProjectData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

// Approx browser localStorage cap (most browsers: 5MB total per origin).
// Warn before we get there so the user can react before a write actually
// throws QuotaExceededError mid-session.
const LOCAL_STORAGE_WARN_KB = 4500;

function saveAll(data: BuilderProjectData[]): boolean {
  if (typeof window === "undefined") return false;
  // Sort by updatedAt desc before slicing so the oldest projects are the
  // ones dropped, not whatever happened to be at the end of the array.
  const sorted = data.slice().sort(
    (a, b) => (b.project.updatedAt ?? 0) - (a.project.updatedAt ?? 0),
  );
  let trimmed = sorted.slice(0, MAX_PROJECTS);

  let json = JSON.stringify(trimmed);
  // Pre-write size check. If the payload is already near the localStorage
  // cap, prune to ~70% of entries (still ordered by recency) so the next
  // write has headroom instead of throwing QuotaExceededError under us.
  const sizeKB = json.length * 2 / 1024; // UTF-16 worst case
  if (sizeKB > LOCAL_STORAGE_WARN_KB && trimmed.length > 1) {
    const keep = Math.max(1, Math.floor(trimmed.length * 0.7));
    console.warn(
      `[BUILDER-STORAGE] Payload ${Math.round(sizeKB)}KB near localStorage cap, pruning ${trimmed.length - keep} project(s)`,
    );
    trimmed = trimmed.slice(0, keep);
    json = JSON.stringify(trimmed);
  }

  try {
    localStorage.setItem(storageKey(), json);
    return true;
  } catch (e) {
    // Quota exceeded — prune oldest 30% (by updatedAt, since trimmed is
    // already sorted desc) and retry.
    const isQuota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
    if (isQuota && trimmed.length > 1) {
      const dropCount = Math.max(1, Math.floor(trimmed.length * 0.3));
      const pruned = trimmed.slice(0, trimmed.length - dropCount);
      try {
        localStorage.setItem(storageKey(), JSON.stringify(pruned));
        console.warn(`[BUILDER-STORAGE] Quota hit, pruned ${dropCount} oldest projects`);
        return true;
      } catch {
        console.error("[BUILDER-STORAGE] Cannot save even after pruning");
        return false;
      }
    }
    console.error("[BUILDER-STORAGE] Save failed:", e);
    return false;
  }
}

// ---- Public API ----

export function getProjects(): BuilderProject[] {
  return loadAll()
    .map((d) => d.project)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProjectData(projectId: string): BuilderProjectData | null {
  const all = loadAll();
  return all.find((d) => d.project.id === projectId) ?? null;
}

export function createProject(title?: string): BuilderProject {
  const project: BuilderProject = {
    id: crypto.randomUUID(),
    title: title || "New Project",
    sandboxId: null,
    sandboxStatus: "idle",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = loadAll();
  all.unshift({ project, messages: [], files: {} });
  saveAll(all);
  return project;
}

export function updateProject(
  projectId: string,
  updates: Partial<
    Pick<
      BuilderProject,
      | "title"
      | "sandboxId"
      | "sandboxStatus"
      | "lastRunStatus"
      | "lastRunAt"
      | "preferredMode"
      | "model"
    >
  >,
): void {
  const all = loadAll();
  const idx = all.findIndex((d) => d.project.id === projectId);
  if (idx < 0) return;
  all[idx].project = { ...all[idx].project, ...updates, updatedAt: Date.now() };
  saveAll(all);
}

export function deleteProject(projectId: string): void {
  const all = loadAll();
  const filtered = all.filter((d) => d.project.id !== projectId);
  saveAll(filtered);
}

// ---- Messages ----

export function getMessages(projectId: string): BuilderProjectMessage[] {
  const data = getProjectData(projectId);
  return data?.messages ?? [];
}

export function addMessage(projectId: string, message: BuilderProjectMessage): void {
  const all = loadAll();
  const idx = all.findIndex((d) => d.project.id === projectId);
  if (idx < 0) return;
  all[idx].messages.push(message);
  all[idx].project.updatedAt = Date.now();
  saveAll(all);
}

export function setMessages(projectId: string, messages: BuilderProjectMessage[]): void {
  const all = loadAll();
  const idx = all.findIndex((d) => d.project.id === projectId);
  if (idx < 0) return;
  all[idx].messages = messages;
  all[idx].project.updatedAt = Date.now();
  saveAll(all);
}

// ---- Files ----

export function getFiles(projectId: string): Record<string, string> {
  const data = getProjectData(projectId);
  return data?.files ?? {};
}

export function syncFiles(projectId: string, files: Record<string, string>): void {
  const all = loadAll();
  const idx = all.findIndex((d) => d.project.id === projectId);
  if (idx < 0) return;
  // Cap file count and size
  const capped: Record<string, string> = {};
  let count = 0;
  for (const [path, content] of Object.entries(files)) {
    if (count >= MAX_FILES_PER_PROJECT) break;
    capped[path] = content.length > MAX_FILE_SIZE
      ? content.slice(0, MAX_FILE_SIZE) + "\n// [truncated for storage]"
      : content;
    count++;
  }
  all[idx].files = capped;
  all[idx].project.updatedAt = Date.now();
  saveAll(all);
}

// ---- Utility ----

export function getStorageSize(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(storageKey()) ?? "";
    return raw.length * 2; // UTF-16
  } catch {
    return 0;
  }
}

export function clearAllProjects(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey());
  } catch {
    // ignore
  }
}

export function getLastOpenedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(lastOpenedKey());
  } catch {
    return null;
  }
}

export function setLastOpenedProjectId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      localStorage.setItem(lastOpenedKey(), id);
    } else {
      localStorage.removeItem(lastOpenedKey());
    }
  } catch {
    // ignore
  }
}

/**
 * Derive title from first user message if title is generic.
 */
export function deriveTitle(messages: BuilderProjectMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Project";
  const text = first.content.trim().replace(/\s+/g, " ");
  return text.length > 50 ? text.slice(0, 47) + "…" : text;
}

// ---- Supabase sync ----
//
// localStorage stays the source of truth for instant UI paint, but when the
// user is authed we mirror writes to Supabase so projects are durable across
// devices and survive cache clears. Failures are non-fatal — the UI keeps
// working off the local cache.

/**
 * Upsert project + replace its messages and files in Supabase.
 * Best-effort: errors are logged and swallowed.
 */
export async function syncProjectToDB(
  userId: string,
  project: BuilderProject,
  messages: BuilderProjectMessage[],
  files: Record<string, string>,
): Promise<void> {
  if (!userId) return;
  if (typeof window === "undefined") return;

  let supabase;
  try {
    supabase = getSupabaseBrowser();
  } catch (e) {
    console.error("[BUILDER-STORAGE] Supabase client unavailable:", e);
    return;
  }

  try {
    // Upsert project row
    const { error: projErr } = await supabase.from("projects").upsert({
      id: project.id,
      user_id: userId,
      title: project.title,
      sandbox_id: project.sandboxId,
      sandbox_status: project.sandboxStatus,
    });
    if (projErr) {
      console.error("[BUILDER-STORAGE] project upsert failed:", projErr.message);
      return;
    }

    // Race-condition fix: previously this did delete-then-insert which
    // wipes a concurrent writer's data if two saves overlap. Switch to
    // fetch-diff-delete + upsert so the table converges without a
    // destructive intermediate window.
    const { data: existingMsgs } = await supabase
      .from("project_messages")
      .select("id")
      .eq("project_id", project.id);
    const existingMsgIds = (existingMsgs ?? []).map((r: { id: string }) => r.id);
    const incomingMsgIds = new Set(messages.map((m) => m.id));
    const msgsToDelete = existingMsgIds.filter((id) => !incomingMsgIds.has(id));

    if (messages.length > 0) {
      const rows = messages.map((m) => ({
        id: m.id,
        project_id: project.id,
        role: m.role,
        content: m.content,
        metadata: {
          tool_calls: m.toolCalls ?? [],
          ...(m.metadata ?? {}),
        },
      }));
      const { error: msgErr } = await supabase
        .from("project_messages")
        .upsert(rows, { onConflict: "id" });
      if (msgErr) {
        console.error(
          "[BUILDER-STORAGE] message upsert failed:",
          msgErr.message,
        );
      }
    }

    if (msgsToDelete.length > 0) {
      const { error: delMsgErr } = await supabase
        .from("project_messages")
        .delete()
        .eq("project_id", project.id)
        .in("id", msgsToDelete);
      if (delMsgErr) {
        console.error(
          "[BUILDER-STORAGE] message prune failed:",
          delMsgErr.message,
        );
      }
    }

    // Files: same fetch-diff-delete + upsert pattern, keyed on
    // (project_id, path).
    const { data: existingFiles } = await supabase
      .from("project_files")
      .select("path")
      .eq("project_id", project.id);
    const existingPaths = (existingFiles ?? []).map(
      (r: { path: string }) => r.path,
    );
    const incomingPaths = new Set(Object.keys(files));
    const pathsToDelete = existingPaths.filter((p) => !incomingPaths.has(p));

    const fileRows = Object.entries(files).map(([path, content]) => ({
      project_id: project.id,
      path,
      content,
    }));
    if (fileRows.length > 0) {
      const { error: fileErr } = await supabase
        .from("project_files")
        .upsert(fileRows, { onConflict: "project_id,path" });
      if (fileErr) {
        console.error(
          "[BUILDER-STORAGE] file upsert failed:",
          fileErr.message,
        );
      }
    }

    if (pathsToDelete.length > 0) {
      const { error: delFileErr } = await supabase
        .from("project_files")
        .delete()
        .eq("project_id", project.id)
        .in("path", pathsToDelete);
      if (delFileErr) {
        console.error(
          "[BUILDER-STORAGE] file prune failed:",
          delFileErr.message,
        );
      }
    }
  } catch (e) {
    console.error("[BUILDER-STORAGE] DB sync failed:", e);
    // Non-fatal — localStorage still works.
  }
}

/**
 * Load all of the user's projects (with messages + files) from Supabase.
 * Returns [] on failure so callers can fall back to localStorage.
 */
export async function loadProjectsFromDB(
  userId: string,
): Promise<BuilderProjectData[]> {
  if (!userId) return [];
  if (typeof window === "undefined") return [];

  let supabase;
  try {
    supabase = getSupabaseBrowser();
  } catch (e) {
    console.error("[BUILDER-STORAGE] Supabase client unavailable:", e);
    return [];
  }

  try {
    const { data: projects, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (projErr) {
      console.error("[BUILDER-STORAGE] load projects failed:", projErr.message);
      return [];
    }
    if (!projects || projects.length === 0) return [];

    const result: BuilderProjectData[] = [];
    for (const p of projects) {
      const [{ data: messages }, { data: files }] = await Promise.all([
        supabase
          .from("project_messages")
          .select("*")
          .eq("project_id", p.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("project_files")
          .select("path, content")
          .eq("project_id", p.id),
      ]);

      const filesMap: Record<string, string> = {};
      for (const f of files ?? []) {
        if (typeof f.path === "string" && typeof f.content === "string") {
          filesMap[f.path] = f.content;
        }
      }

      const projectRow = p as {
        id: string;
        title: string;
        sandbox_id: string | null;
        sandbox_status: string | null;
        created_at: string;
        updated_at: string;
      };

      const builderProject: BuilderProject = {
        id: projectRow.id,
        title: projectRow.title,
        sandboxId: projectRow.sandbox_id,
        sandboxStatus:
          (projectRow.sandbox_status as BuilderProject["sandboxStatus"]) ??
          "idle",
        createdAt: new Date(projectRow.created_at).getTime(),
        updatedAt: new Date(projectRow.updated_at).getTime(),
      };

      const builderMessages: BuilderProjectMessage[] = (messages ?? []).map(
        (m) => {
          const meta = ((m as { metadata?: unknown }).metadata ??
            {}) as Record<string, unknown>;
          const rawTools = meta.tool_calls;
          const toolCalls = Array.isArray(rawTools)
            ? (rawTools as BuilderProjectMessage["toolCalls"])
            : undefined;
          return {
            id: (m as { id: string }).id,
            role: (m as { role: string }).role as BuilderProjectMessage["role"],
            content: (m as { content: string }).content,
            timestamp: new Date(
              (m as { created_at: string }).created_at,
            ).getTime(),
            toolCalls,
            metadata: meta,
          };
        },
      );

      result.push({
        project: builderProject,
        messages: builderMessages,
        files: filesMap,
      });
    }

    return result;
  } catch (e) {
    console.error("[BUILDER-STORAGE] Load from DB failed:", e);
    return [];
  }
}

/**
 * Merge DB data into localStorage so the cached view matches what the user
 * sees on other devices. DB is authoritative for project metadata + content.
 * Local-only projects (e.g. created while offline) are preserved.
 */
export function mergeDBIntoLocal(dbProjects: BuilderProjectData[]): void {
  if (typeof window === "undefined") return;
  const local = loadAll();
  const localById = new Map(local.map((d) => [d.project.id, d] as const));
  for (const dbProj of dbProjects) {
    localById.set(dbProj.project.id, dbProj);
  }
  const merged = Array.from(localById.values()).sort(
    (a, b) => b.project.updatedAt - a.project.updatedAt,
  );
  saveAll(merged);
}

/**
 * Convenience: read the full data for a project from local cache so callers
 * can pass it to {@link syncProjectToDB}.
 */
export function getFullProjectData(
  projectId: string,
): BuilderProjectData | null {
  return getProjectData(projectId);
}
