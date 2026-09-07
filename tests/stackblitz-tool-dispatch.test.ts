import { describe, it, expect } from "vitest";

import { executeToolOnFileMap } from "@/lib/stackblitz-tool-dispatch";
import type { ToolCall } from "@/lib/agent-tools";

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `tc-${name}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("stackblitz-tool-dispatch", () => {
  describe("parsing errors", () => {
    it("returns failure when arguments are not valid JSON", () => {
      const call: ToolCall = {
        id: "x",
        type: "function",
        function: { name: "create_file", arguments: "not-json" },
      };
      const res = executeToolOnFileMap({}, call);
      expect(res.success).toBe(false);
      expect(res.result).toMatch(/Could not parse tool arguments/);
      expect(res.filesChanged).toEqual([]);
    });

    it("returns failure for unknown tool name", () => {
      const res = executeToolOnFileMap({}, makeToolCall("nope", {}));
      expect(res.success).toBe(false);
    });
  });

  describe("create_file", () => {
    it("creates a file with a normalised leading-slash path", () => {
      const res = executeToolOnFileMap(
        {},
        makeToolCall("create_file", { path: "src/App.tsx", content: "x" }),
      );
      expect(res.success).toBe(true);
      expect(res.filesChanged).toEqual([
        { path: "/src/App.tsx", content: "x" },
      ]);
    });

    it("strips an existing leading slash rather than doubling it", () => {
      const res = executeToolOnFileMap(
        {},
        makeToolCall("create_file", { path: "/index.html", content: "<x>" }),
      );
      expect(res.filesChanged[0].path).toBe("/index.html");
    });
  });

  describe("read_file", () => {
    it("reads existing content", () => {
      const res = executeToolOnFileMap(
        { "/a.txt": "hello" },
        makeToolCall("read_file", { path: "a.txt" }),
      );
      expect(res.success).toBe(true);
      expect(res.result).toBe("hello");
    });

    it("fails for a missing file", () => {
      const res = executeToolOnFileMap(
        {},
        makeToolCall("read_file", { path: "missing.txt" }),
      );
      expect(res.success).toBe(false);
      expect(res.result).toMatch(/not found/);
    });

    it("caps content at 10K chars", () => {
      const big = "y".repeat(20000);
      const res = executeToolOnFileMap(
        { "/big.txt": big },
        makeToolCall("read_file", { path: "big.txt" }),
      );
      expect(res.result.length).toBe(10000);
    });
  });

  describe("apply_diff", () => {
    it("applies a SEARCH/REPLACE block", () => {
      const original = "const a = 1;\n";
      const diff =
        "<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE";
      const res = executeToolOnFileMap(
        { "/x.ts": original },
        makeToolCall("apply_diff", { path: "x.ts", diff }),
      );
      expect(res.success).toBe(true);
      expect(res.filesChanged[0].content).toContain("const a = 2;");
    });

    it("fails when the file does not exist", () => {
      const res = executeToolOnFileMap(
        {},
        makeToolCall("apply_diff", { path: "x.ts", diff: "whatever" }),
      );
      expect(res.success).toBe(false);
      expect(res.result).toMatch(/not found/);
    });

    it("reports failure when SEARCH text is not found", () => {
      const diff =
        "<<<<<<< SEARCH\nNOPE\n=======\nyes\n>>>>>>> REPLACE";
      const res = executeToolOnFileMap(
        { "/x.ts": "const a = 1;" },
        makeToolCall("apply_diff", { path: "x.ts", diff }),
      );
      expect(res.success).toBe(false);
    });
  });

  describe("delete_file", () => {
    it("marks an existing file deleted", () => {
      const res = executeToolOnFileMap(
        { "/gone.ts": "x" },
        makeToolCall("delete_file", { path: "gone.ts" }),
      );
      expect(res.success).toBe(true);
      expect(res.filesChanged[0]).toEqual({
        path: "/gone.ts",
        content: "",
        deleted: true,
      });
    });

    it("fails for a missing file", () => {
      const res = executeToolOnFileMap(
        {},
        makeToolCall("delete_file", { path: "missing.ts" }),
      );
      expect(res.success).toBe(false);
    });
  });

  describe("list_files", () => {
    it("lists all files for root", () => {
      const res = executeToolOnFileMap(
        { "/a.ts": "1", "/src/b.ts": "2" },
        makeToolCall("list_files", {}),
      );
      expect(res.result).toBe("/a.ts\n/src/b.ts");
    });

    it("filters by directory prefix", () => {
      const res = executeToolOnFileMap(
        { "/a.ts": "1", "/src/b.ts": "2", "/src/c.ts": "3" },
        makeToolCall("list_files", { directory: "src" }),
      );
      expect(res.result).toBe("/src/b.ts\n/src/c.ts");
    });

    it("returns placeholder for an empty directory", () => {
      const res = executeToolOnFileMap(
        { "/a.ts": "1" },
        makeToolCall("list_files", { directory: "nope" }),
      );
      expect(res.result).toBe("(empty directory)");
    });
  });

  describe("done", () => {
    it("signals completion and carries the summary", () => {
      const res = executeToolOnFileMap(
        {},
        makeToolCall("done", { summary: "all done" }),
      );
      expect(res.isDone).toBe(true);
      expect(res.doneSummary).toBe("all done");
      expect(res.filesChanged).toEqual([]);
    });
  });
});
