import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFrom = vi.fn();

const mockSupabase = {
  from: mockFrom,
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mockSupabase,
}));

import {
  createProject,
  getProject,
  getUserProjects,
  updateProject,
  deleteProject,
  getProjectFiles,
  syncProjectFiles,
  getProjectMessages,
  addProjectMessage,
} from "@/lib/supabase-projects";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

// Builder for the `projects.select().eq("id", ...).eq("user_id", ...).single()`
// chain used by getProject. Tracks the eq() calls so tests can assert both
// id and user_id filters were applied.
function buildProjectsSelectChain(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn();
  eq.mockImplementation((column: string, value: unknown) => {
    eqCalls.push({ column, value });
    return { eq, single };
  });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, single, eqCalls };
}

// Builder for the `projects.update(...).eq().eq()` chain used by updateProject.
function buildUpdateChain(finalResult: { error: unknown }) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const eq = vi.fn();
  // The last .eq() in the chain resolves to the final result; intermediate
  // .eq() calls return the same chainable object.
  eq.mockImplementation((column: string, value: unknown) => {
    eqCalls.push({ column, value });
    // Make the chainable object thenable by spreading the final result onto
    // it, so `await update().eq().eq()` resolves to { error }.
    return Object.assign({ eq }, finalResult);
  });
  const update = vi.fn().mockReturnValue({ eq });
  return { update, eq, eqCalls };
}

// Builder for the `projects.delete().eq().eq()` chain used by deleteProject.
function buildDeleteChain(finalResult: { error: unknown }) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const eq = vi.fn();
  eq.mockImplementation((column: string, value: unknown) => {
    eqCalls.push({ column, value });
    return Object.assign({ eq }, finalResult);
  });
  const del = vi.fn().mockReturnValue({ eq });
  return { delete: del, eq, eqCalls };
}

// Helper: wires mockFrom to return different shapes for sequential calls.
// Most ownership-checked functions call from("projects") first, then the
// child table.
function queueFrom(...handlers: Array<() => unknown>) {
  let i = 0;
  mockFrom.mockImplementation(() => {
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i++;
    return handler();
  });
}

const ownerProject = {
  id: "proj-1",
  user_id: "user-1",
  title: "Test",
};

describe("supabase-projects", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // createProject
  // -------------------------------------------------------------------------

  describe("createProject", () => {
    it("creates a project with title", async () => {
      const projectData = { id: "proj-1", user_id: "user-1", title: "My Project" };
      const single = vi.fn().mockResolvedValue({ data: projectData, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      mockFrom.mockReturnValue({ insert });

      const result = await createProject("user-1", "My Project");

      expect(result).toEqual(projectData);
      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(insert).toHaveBeenCalledWith({ user_id: "user-1", title: "My Project" });
    });

    it("uses 'Untitled' when no title provided", async () => {
      const projectData = { id: "proj-2", user_id: "user-1", title: "Untitled" };
      const single = vi.fn().mockResolvedValue({ data: projectData, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      mockFrom.mockReturnValue({ insert });

      const result = await createProject("user-1");

      expect(result).toEqual(projectData);
      expect(insert).toHaveBeenCalledWith({ user_id: "user-1", title: "Untitled" });
    });

    it("throws on database error", async () => {
      const single = vi.fn().mockResolvedValue({ data: null, error: { message: "Insert failed" } });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      mockFrom.mockReturnValue({ insert });

      await expect(createProject("user-1", "Test")).rejects.toThrow("createProject: Insert failed");
    });
  });

  // -------------------------------------------------------------------------
  // getProject (now requires userId)
  // -------------------------------------------------------------------------

  describe("getProject", () => {
    it("returns project when found and applies both id + user_id filters", async () => {
      const chain = buildProjectsSelectChain({ data: ownerProject, error: null });
      mockFrom.mockReturnValue({ select: chain.select });

      const result = await getProject("proj-1", "user-1");

      expect(result).toEqual(ownerProject);
      // Authorization: must filter by BOTH id AND user_id.
      expect(chain.eqCalls).toEqual([
        { column: "id", value: "proj-1" },
        { column: "user_id", value: "user-1" },
      ]);
    });

    it("returns null when project belongs to a different user", async () => {
      // Supabase returns an error when .single() finds zero rows because of
      // the user_id filter — getProject treats that as "not found".
      const chain = buildProjectsSelectChain({
        data: null,
        error: { message: "Row not found" },
      });
      mockFrom.mockReturnValue({ select: chain.select });

      const result = await getProject("proj-1", "attacker-user");

      expect(result).toBeNull();
      expect(chain.eqCalls).toEqual([
        { column: "id", value: "proj-1" },
        { column: "user_id", value: "attacker-user" },
      ]);
    });

    it("returns null when project not found", async () => {
      const chain = buildProjectsSelectChain({
        data: null,
        error: { message: "Row not found" },
      });
      mockFrom.mockReturnValue({ select: chain.select });

      const result = await getProject("nonexistent", "user-1");

      expect(result).toBeNull();
    });

    it("returns null on database error", async () => {
      const chain = buildProjectsSelectChain({
        data: null,
        error: { message: "Connection error" },
      });
      mockFrom.mockReturnValue({ select: chain.select });

      const result = await getProject("proj-1", "user-1");

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getUserProjects (already userId-scoped)
  // -------------------------------------------------------------------------

  describe("getUserProjects", () => {
    it("returns list of user projects", async () => {
      const projects = [
        { id: "proj-1", title: "Project 1" },
        { id: "proj-2", title: "Project 2" },
      ];
      const order = vi.fn().mockReturnValue({ data: projects, error: null });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });
      mockFrom.mockReturnValue({ select });

      const result = await getUserProjects("user-1");

      expect(result).toEqual(projects);
      expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("returns empty array when no projects", async () => {
      const order = vi.fn().mockReturnValue({ data: null, error: null });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });
      mockFrom.mockReturnValue({ select });

      const result = await getUserProjects("user-1");

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      const order = vi.fn().mockReturnValue({ data: null, error: { message: "Query failed" } });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });
      mockFrom.mockReturnValue({ select });

      await expect(getUserProjects("user-1")).rejects.toThrow("getUserProjects: Query failed");
    });
  });

  // -------------------------------------------------------------------------
  // updateProject (now requires userId)
  // -------------------------------------------------------------------------

  describe("updateProject", () => {
    it("updates project successfully and applies user_id filter", async () => {
      const chain = buildUpdateChain({ error: null });
      mockFrom.mockReturnValue({ update: chain.update });

      await expect(
        updateProject("proj-1", "user-1", { title: "New Title" }),
      ).resolves.toBeUndefined();

      // Authorization: must filter by BOTH id AND user_id so a foreign user
      // cannot poison another user's row.
      expect(chain.eqCalls).toEqual([
        { column: "id", value: "proj-1" },
        { column: "user_id", value: "user-1" },
      ]);
    });

    it("throws on database error", async () => {
      const chain = buildUpdateChain({ error: { message: "Update failed" } });
      mockFrom.mockReturnValue({ update: chain.update });

      await expect(
        updateProject("proj-1", "user-1", { title: "X" }),
      ).rejects.toThrow("updateProject: Update failed");
    });
  });

  // -------------------------------------------------------------------------
  // deleteProject (now requires userId)
  // -------------------------------------------------------------------------

  describe("deleteProject", () => {
    it("deletes project successfully and applies user_id filter", async () => {
      const chain = buildDeleteChain({ error: null });
      mockFrom.mockReturnValue({ delete: chain.delete });

      await expect(deleteProject("proj-1", "user-1")).resolves.toBeUndefined();

      expect(chain.eqCalls).toEqual([
        { column: "id", value: "proj-1" },
        { column: "user_id", value: "user-1" },
      ]);
    });

    it("throws on database error", async () => {
      const chain = buildDeleteChain({ error: { message: "Delete failed" } });
      mockFrom.mockReturnValue({ delete: chain.delete });

      await expect(deleteProject("proj-1", "user-1")).rejects.toThrow("deleteProject: Delete failed");
    });
  });

  // -------------------------------------------------------------------------
  // getProjectFiles (verifies project ownership first)
  // -------------------------------------------------------------------------

  describe("getProjectFiles", () => {
    it("returns project files when caller owns project", async () => {
      const files = [{ id: "f1", project_id: "proj-1", path: "/index.ts", content: "code" }];
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });

      // Second from() call is for project_files.
      const filesEq = vi.fn().mockReturnValue({ data: files, error: null });
      const filesSelect = vi.fn().mockReturnValue({ eq: filesEq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select: filesSelect }),
      );

      const result = await getProjectFiles("proj-1", "user-1");

      expect(result).toEqual(files);
      expect(mockFrom).toHaveBeenNthCalledWith(1, "projects");
      expect(mockFrom).toHaveBeenNthCalledWith(2, "project_files");
      expect(filesEq).toHaveBeenCalledWith("project_id", "proj-1");
    });

    it("returns empty array when caller does NOT own project (ownership check fails)", async () => {
      const ownership = buildProjectsSelectChain({
        data: null,
        error: { message: "Not found" },
      });
      mockFrom.mockReturnValue({ select: ownership.select });

      const result = await getProjectFiles("proj-1", "attacker");

      expect(result).toEqual([]);
      // Critical: must NEVER touch project_files when ownership fails.
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith("projects");
    });

    it("returns empty array when no files", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const filesEq = vi.fn().mockReturnValue({ data: null, error: null });
      const filesSelect = vi.fn().mockReturnValue({ eq: filesEq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select: filesSelect }),
      );

      const result = await getProjectFiles("proj-1", "user-1");

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const filesEq = vi.fn().mockReturnValue({
        data: null,
        error: { message: "Files query failed" },
      });
      const filesSelect = vi.fn().mockReturnValue({ eq: filesEq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select: filesSelect }),
      );

      await expect(getProjectFiles("proj-1", "user-1")).rejects.toThrow(
        "getProjectFiles: Files query failed",
      );
    });
  });

  // -------------------------------------------------------------------------
  // syncProjectFiles (verifies project ownership first)
  // -------------------------------------------------------------------------

  describe("syncProjectFiles", () => {
    it("upserts files and deletes removed ones via parameterized .in()", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const existingRows = [
        { path: "/a.ts" },
        { path: "/b.ts" },
        { path: "/stale.ts" },
      ];
      const inFn = vi.fn().mockReturnValue({ error: null });
      const deleteEq = vi.fn().mockReturnValue({ in: inFn });
      const localDelete = vi.fn().mockReturnValue({ eq: deleteEq });
      const fetchEq = vi.fn().mockReturnValue({ data: existingRows, error: null });
      const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });
      const localUpsert = vi.fn().mockReturnValue({ error: null });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ upsert: localUpsert }),
        () => ({ select: fetchSelect }),
        () => ({ delete: localDelete }),
      );

      await expect(
        syncProjectFiles("proj-1", "user-1", { "/a.ts": "content a", "/b.ts": "content b" }),
      ).resolves.toBeUndefined();

      // Stale file should be the only one passed to .in()
      expect(inFn).toHaveBeenCalledWith("path", ["/stale.ts"]);
    });

    it("is a no-op when caller does NOT own project", async () => {
      const ownership = buildProjectsSelectChain({
        data: null,
        error: { message: "Not found" },
      });
      mockFrom.mockReturnValue({ select: ownership.select });

      await expect(
        syncProjectFiles("proj-1", "attacker", { "/a.ts": "code" }),
      ).resolves.toBeUndefined();

      // Must not touch project_files at all.
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith("projects");
    });

    it("skips delete when nothing changed", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const existingRows = [{ path: "/a.ts" }];
      const fetchEq = vi.fn().mockReturnValue({ data: existingRows, error: null });
      const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });
      const localUpsert = vi.fn().mockReturnValue({ error: null });
      const localDelete = vi.fn();

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ upsert: localUpsert }),
        () => ({ select: fetchSelect }),
        () => ({ delete: localDelete }),
      );

      await expect(
        syncProjectFiles("proj-1", "user-1", { "/a.ts": "code" }),
      ).resolves.toBeUndefined();

      expect(localDelete).not.toHaveBeenCalled();
    });

    it("skips upsert when files map is empty but still reconciles deletes", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const existingRows = [{ path: "/old.ts" }];
      const inFn = vi.fn().mockReturnValue({ error: null });
      const deleteEq = vi.fn().mockReturnValue({ in: inFn });
      const localDelete = vi.fn().mockReturnValue({ eq: deleteEq });
      const fetchEq = vi.fn().mockReturnValue({ data: existingRows, error: null });
      const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select: fetchSelect }),
        () => ({ delete: localDelete }),
      );

      await expect(
        syncProjectFiles("proj-1", "user-1", {}),
      ).resolves.toBeUndefined();

      expect(inFn).toHaveBeenCalledWith("path", ["/old.ts"]);
    });

    it("throws on upsert error", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const localUpsert = vi.fn().mockReturnValue({ error: { message: "Upsert failed" } });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ upsert: localUpsert }),
      );

      await expect(
        syncProjectFiles("proj-1", "user-1", { "/a.ts": "code" }),
      ).rejects.toThrow("syncProjectFiles: Upsert failed");
    });
  });

  // -------------------------------------------------------------------------
  // getProjectMessages (verifies project ownership first)
  // -------------------------------------------------------------------------

  describe("getProjectMessages", () => {
    it("returns messages ordered by created_at when caller owns project", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const messages = [
        { id: "m1", project_id: "proj-1", role: "user", content: "Hello" },
        { id: "m2", project_id: "proj-1", role: "assistant", content: "Hi" },
      ];
      const order = vi.fn().mockReturnValue({ data: messages, error: null });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select }),
      );

      const result = await getProjectMessages("proj-1", "user-1");

      expect(result).toEqual(messages);
      expect(mockFrom).toHaveBeenNthCalledWith(2, "project_messages");
    });

    it("returns empty array when caller does NOT own project", async () => {
      const ownership = buildProjectsSelectChain({
        data: null,
        error: { message: "Not found" },
      });
      mockFrom.mockReturnValue({ select: ownership.select });

      const result = await getProjectMessages("proj-1", "attacker");

      expect(result).toEqual([]);
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith("projects");
    });

    it("returns empty array when no messages", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const order = vi.fn().mockReturnValue({ data: null, error: null });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select }),
      );

      const result = await getProjectMessages("proj-1", "user-1");

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const order = vi.fn().mockReturnValue({
        data: null,
        error: { message: "Messages query failed" },
      });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ select }),
      );

      await expect(getProjectMessages("proj-1", "user-1")).rejects.toThrow(
        "getProjectMessages: Messages query failed",
      );
    });
  });

  // -------------------------------------------------------------------------
  // addProjectMessage (verifies project ownership first)
  // -------------------------------------------------------------------------

  describe("addProjectMessage", () => {
    it("adds a message and returns it when caller owns project", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const message = {
        id: "m1",
        project_id: "proj-1",
        role: "user",
        content: "Hello",
        metadata: {},
      };
      const single = vi.fn().mockResolvedValue({ data: message, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ insert }),
      );

      const result = await addProjectMessage("proj-1", "user-1", "user", "Hello");

      expect(result).toEqual(message);
    });

    it("adds a message with metadata", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const metadata = { model: "gpt-4", tokens: 100 };
      const message = {
        id: "m2",
        project_id: "proj-1",
        role: "assistant",
        content: "Hi",
        metadata,
      };
      const single = vi.fn().mockResolvedValue({ data: message, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ insert }),
      );

      const result = await addProjectMessage("proj-1", "user-1", "assistant", "Hi", metadata);

      expect(result).toEqual(message);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: "proj-1", role: "assistant", metadata }),
      );
    });

    it("returns null when caller does NOT own project", async () => {
      const ownership = buildProjectsSelectChain({
        data: null,
        error: { message: "Not found" },
      });
      mockFrom.mockReturnValue({ select: ownership.select });

      const result = await addProjectMessage("proj-1", "attacker", "user", "Hello");

      expect(result).toBeNull();
      // Must not touch project_messages.
      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalledWith("projects");
    });

    it("throws on database error", async () => {
      const ownership = buildProjectsSelectChain({ data: ownerProject, error: null });
      const single = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Insert message failed" },
      });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });

      queueFrom(
        () => ({ select: ownership.select }),
        () => ({ insert }),
      );

      await expect(
        addProjectMessage("proj-1", "user-1", "user", "Hello"),
      ).rejects.toThrow("addProjectMessage: Insert message failed");
    });
  });
});
