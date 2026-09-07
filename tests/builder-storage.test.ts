import { describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  syncFiles,
  getFiles,
  getProjectData,
  getProjects,
  deleteProject,
  updateProject,
} from "@/lib/builder-storage";

describe("builder-storage syncFiles", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("syncFiles behavior", () => {
    it("REPLACES existing files when called directly (this is the documented behavior)", () => {
      // syncFiles is the LOW-LEVEL replacer.
      // Callers MUST merge themselves before calling syncFiles for partial updates.
      // This test documents the contract.
      const proj = createProject("test");

      syncFiles(proj.id, { "/a.js": "1", "/b.js": "2", "/c.js": "3" });
      expect(Object.keys(getFiles(proj.id)).sort()).toEqual([
        "/a.js",
        "/b.js",
        "/c.js",
      ]);

      // Calling syncFiles with partial map REPLACES (does not merge)
      syncFiles(proj.id, { "/a.js": "X" });
      expect(getFiles(proj.id)).toEqual({ "/a.js": "X" });
    });

    it("merging via spread { ...existing, ...new } preserves unchanged files", () => {
      // This is the PATTERN that consumers must use for partial updates.
      const proj = createProject("test");

      syncFiles(proj.id, { "/a.js": "1", "/b.js": "2", "/c.js": "3" });

      // Simulate the done handler: merge new files with existing
      const existing = getFiles(proj.id);
      const newFiles = { "/a.js": "X" };
      syncFiles(proj.id, { ...existing, ...newFiles });

      expect(getFiles(proj.id)).toEqual({
        "/a.js": "X", // updated
        "/b.js": "2", // preserved
        "/c.js": "3", // preserved
      });
    });
  });

  describe("REGRESSION: build-then-continue must preserve files", () => {
    it("partial sync after first build does not wipe files (merge pattern)", () => {
      const proj = createProject("OTPHub");

      // Simulate first build: 30 files created
      const initialFiles: Record<string, string> = {};
      for (let i = 1; i <= 30; i++) {
        initialFiles[`/src/file${i}.js`] = `content ${i}`;
      }
      syncFiles(proj.id, initialFiles);
      expect(Object.keys(getFiles(proj.id))).toHaveLength(30);

      // Simulate "lanjutkan" run: AI only emits 2 changed files
      const partialFromAI = {
        "/src/file1.js": "updated content 1",
        "/src/newfile.js": "new content",
      };

      // BUG (old behavior): syncFiles directly with partial → wipes 28 files
      // FIX (new behavior): caller must merge first
      const existing = getFiles(proj.id);
      syncFiles(proj.id, { ...existing, ...partialFromAI });

      const final = getFiles(proj.id);
      expect(Object.keys(final)).toHaveLength(31); // 30 + 1 new
      expect(final["/src/file1.js"]).toBe("updated content 1");
      expect(final["/src/newfile.js"]).toBe("new content");
      expect(final["/src/file30.js"]).toBe("content 30"); // preserved
    });

    it("incremental tool_result sync (RC1 pattern) preserves all files across calls", () => {
      const proj = createProject("test");

      // Initial: 5 files
      syncFiles(proj.id, {
        "/a.js": "a",
        "/b.js": "b",
        "/c.js": "c",
        "/d.js": "d",
        "/e.js": "e",
      });

      // Simulate AI creating 1 file at a time via incremental syncs
      const incrementalUpdates = ["/f.js", "/g.js", "/h.js"];
      for (const path of incrementalUpdates) {
        const current = getFiles(proj.id);
        syncFiles(proj.id, { ...current, [path]: "new" });
      }

      const final = getFiles(proj.id);
      expect(Object.keys(final).sort()).toEqual([
        "/a.js",
        "/b.js",
        "/c.js",
        "/d.js",
        "/e.js",
        "/f.js",
        "/g.js",
        "/h.js",
      ]);
    });
  });

  describe("project isolation", () => {
    it("syncFiles to project A does not affect project B", () => {
      const a = createProject("A");
      const b = createProject("B");

      syncFiles(a.id, { "/a.js": "1" });
      syncFiles(b.id, { "/b.js": "2" });

      expect(getFiles(a.id)).toEqual({ "/a.js": "1" });
      expect(getFiles(b.id)).toEqual({ "/b.js": "2" });
    });

    it("delete project A does not affect project B files", () => {
      const a = createProject("A");
      const b = createProject("B");

      syncFiles(a.id, { "/a.js": "1" });
      syncFiles(b.id, { "/b.js": "2" });

      deleteProject(a.id);

      expect(getFiles(a.id)).toEqual({});
      expect(getFiles(b.id)).toEqual({ "/b.js": "2" });
    });
  });

  describe("edge cases", () => {
    it("getFiles returns empty object for non-existent project", () => {
      expect(getFiles("does-not-exist")).toEqual({});
    });

    it("getProjectData returns null for non-existent project", () => {
      expect(getProjectData("does-not-exist")).toBeNull();
    });

    it("file count cap at MAX_FILES_PER_PROJECT (100)", () => {
      const proj = createProject("test");
      const files: Record<string, string> = {};
      for (let i = 1; i <= 150; i++) {
        files[`/file${i}.js`] = `content ${i}`;
      }
      syncFiles(proj.id, files);
      expect(Object.keys(getFiles(proj.id))).toHaveLength(100);
    });

    it("file size cap truncates content over MAX_FILE_SIZE", () => {
      const proj = createProject("test");
      const longContent = "x".repeat(150_000); // > 100KB
      syncFiles(proj.id, { "/big.js": longContent });
      const stored = getFiles(proj.id)["/big.js"];
      expect(stored.length).toBeLessThan(longContent.length);
      expect(stored).toContain("[truncated for storage]");
    });
  });

  describe("pruning by updatedAt", () => {
    it("when over MAX_PROJECTS, drops the projects with the OLDEST updatedAt", () => {
      // Create 32 projects with monotonically increasing updatedAt so the
      // oldest 2 are well-defined. saveAll() trims to MAX_PROJECTS=30 by
      // sorting on updatedAt desc, so the first two we create should be
      // the ones evicted.
      const projects = [];
      for (let i = 0; i < 32; i++) {
        const p = createProject(`p${i}`);
        // Bump updatedAt explicitly so insertion order isn't ambiguous.
        updateProject(p.id, { title: `p${i}` });
        projects.push(p);
      }

      const remaining = getProjects();
      expect(remaining).toHaveLength(30);
      const remainingIds = new Set(remaining.map((p) => p.id));
      // The first two created (oldest updatedAt) should be gone.
      expect(remainingIds.has(projects[0].id)).toBe(false);
      expect(remainingIds.has(projects[1].id)).toBe(false);
      // The most recent one should definitely still be there.
      expect(remainingIds.has(projects[31].id)).toBe(true);
    });
  });
});
