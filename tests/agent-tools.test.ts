import { describe, it, expect } from "vitest";
import {
  detectMode,
  parseToolCall,
  applyDiffToContent,
} from "@/lib/agent-tools";

describe("detectMode", () => {
  it("returns architect for new project (no files, no plan)", () => {
    expect(
      detectMode({ hasFiles: false, prompt: "buatkan todo app", hasPlan: false }),
    ).toBe("architect");
  });

  it("returns code for existing project with normal request", () => {
    expect(
      detectMode({
        hasFiles: true,
        prompt: "tambahkan dark mode",
        hasPlan: true,
      }),
    ).toBe("code");
  });

  it("returns debug when error keywords present + files exist", () => {
    expect(
      detectMode({
        hasFiles: true,
        prompt: "error: cannot find module",
        hasPlan: true,
      }),
    ).toBe("debug");
  });

  it("REGRESSION: 'lanjutkan' with files returns code (not architect)", () => {
    // This was the bug: ambiguous prompts going to architect mode
    expect(
      detectMode({ hasFiles: true, prompt: "lanjutkan", hasPlan: true }),
    ).toBe("code");
  });

  it("REGRESSION: 'continue' with files returns code", () => {
    expect(
      detectMode({
        hasFiles: true,
        prompt: "continue building",
        hasPlan: true,
      }),
    ).toBe("code");
  });
});

describe("applyDiffToContent", () => {
  it("applies simple SEARCH/REPLACE block", () => {
    const content = "hello world";
    const diff = "<<<<<<< SEARCH\nhello\n=======\nbye\n>>>>>>> REPLACE";
    const { result, applied } = applyDiffToContent(content, diff);
    expect(applied).toBe(1);
    expect(result).toBe("bye world");
  });

  it("returns 0 applied when SEARCH block not found", () => {
    const content = "hello world";
    const diff = "<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE";
    const { applied, failed } = applyDiffToContent(content, diff);
    expect(applied).toBe(0);
    expect(failed.length).toBeGreaterThan(0);
  });

  it("applies multiple SEARCH/REPLACE blocks", () => {
    const content = "a\nb\nc";
    const diff = `<<<<<<< SEARCH
a
=======
A
>>>>>>> REPLACE
<<<<<<< SEARCH
c
=======
C
>>>>>>> REPLACE`;
    const { result, applied } = applyDiffToContent(content, diff);
    expect(applied).toBe(2);
    expect(result).toBe("A\nb\nC");
  });
});

describe("parseToolCall", () => {
  it("parses create_file with path and content", () => {
    const call = {
      id: "tc-1",
      type: "function" as const,
      function: {
        name: "create_file",
        arguments: JSON.stringify({ path: "/foo.js", content: "x" }),
      },
    };
    const parsed = parseToolCall(call);
    expect(parsed?.name).toBe("create_file");
    if (parsed?.name === "create_file") {
      expect(parsed.args.path).toBe("/foo.js");
      expect(parsed.args.content).toBe("x");
    }
  });

  it("returns null for invalid arguments JSON", () => {
    const call = {
      id: "tc-1",
      type: "function" as const,
      function: { name: "create_file", arguments: "not json" },
    };
    expect(parseToolCall(call)).toBeNull();
  });

  it("handles empty arguments string for list_files", () => {
    const call = {
      id: "tc-1",
      type: "function" as const,
      function: { name: "list_files", arguments: "" },
    };
    const parsed = parseToolCall(call);
    expect(parsed?.name).toBe("list_files");
  });

  it("parses run_command with command", () => {
    const call = {
      id: "tc-1",
      type: "function" as const,
      function: {
        name: "run_command",
        arguments: JSON.stringify({ command: "npm install" }),
      },
    };
    const parsed = parseToolCall(call);
    expect(parsed?.name).toBe("run_command");
    if (parsed?.name === "run_command") {
      expect(parsed.args.command).toBe("npm install");
    }
  });

  it("returns null for run_command without command", () => {
    const call = {
      id: "tc-1",
      type: "function" as const,
      function: { name: "run_command", arguments: "{}" },
    };
    expect(parseToolCall(call)).toBeNull();
  });
});
