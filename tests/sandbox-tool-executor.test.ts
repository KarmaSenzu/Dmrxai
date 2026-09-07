import { describe, it, expect } from "vitest";
import {
  executeToolOnSandbox,
  type ToolExecutionHooks,
} from "@/lib/sandbox-tool-executor";
import type { ToolCall } from "@/lib/agent-tools";
import type { E2BSandbox } from "@/lib/e2b-sandbox";

// ---------------------------------------------------------------------------
// In-memory fake sandbox implementing the E2BSandbox interface.
// ---------------------------------------------------------------------------

function makeFakeSandbox() {
  const fsStore = new Map<string, string>();
  const runLog: string[] = [];

  const sandbox: E2BSandbox = {
    sandboxId: "fake-sb",
    files: {
      async write(path, content) {
        fsStore.set(path, content);
      },
      async read(path) {
        const v = fsStore.get(path);
        if (v === undefined) throw new Error(`ENOENT: ${path}`);
        return v;
      },
      async remove(path) {
        fsStore.delete(path);
      },
      async list(dir) {
        return Array.from(fsStore.keys())
          .filter((p) => !dir || p.startsWith(dir.replace(/\/+$/, "")))
          .map((path) => ({ name: path.split("/").pop() ?? path, type: "file" as const, path }));
      },
    },
    process: {
      async start({ cmd, onStdout }) {
        runLog.push(cmd);
        onStdout?.(`$ ${cmd}\n`);
        return { exitCode: 0, stdout: `$ ${cmd}\n`, stderr: "" };
      },
    },
    getHost(port) {
      return `https://fake.dev:${port}`;
    },
    async kill() {},
  };

  return { sandbox, fsStore, runLog };
}

function toolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `tc-${name}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe("executeToolOnSandbox", () => {
  it("create_file writes to the sandbox filesystem", async () => {
    const { sandbox, fsStore } = makeFakeSandbox();
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("create_file", { path: "/src/App.tsx", content: "export default () => <div/>" }),
    );
    expect(res.success).toBe(true);
    expect(fsStore.get("/src/App.tsx")).toContain("export default");
  });

  it("read_file returns file content", async () => {
    const { sandbox, fsStore } = makeFakeSandbox();
    fsStore.set("/src/App.tsx", "hello");
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("read_file", { path: "/src/App.tsx" }),
    );
    expect(res.success).toBe(true);
    expect(res.result).toBe("hello");
  });

  it("read_file returns error when file missing", async () => {
    const { sandbox } = makeFakeSandbox();
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("read_file", { path: "/nope.tsx" }),
    );
    expect(res.success).toBe(false);
    expect(res.result).toContain("not found");
  });

  it("apply_diff edits an existing file", async () => {
    const { sandbox, fsStore } = makeFakeSandbox();
    fsStore.set("/src/App.tsx", "const a = 1;");
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("apply_diff", {
        path: "/src/App.tsx",
        diff: "<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE",
      }),
    );
    expect(res.success).toBe(true);
    expect(fsStore.get("/src/App.tsx")).toBe("const a = 2;");
  });

  it("delete_file removes a file", async () => {
    const { sandbox, fsStore } = makeFakeSandbox();
    fsStore.set("/src/App.tsx", "x");
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("delete_file", { path: "/src/App.tsx" }),
    );
    expect(res.success).toBe(true);
    expect(fsStore.has("/src/App.tsx")).toBe(false);
  });

  it("run_command streams output and returns exit code", async () => {
    const { sandbox, runLog } = makeFakeSandbox();
    const chunks: string[] = [];
    const hooks: ToolExecutionHooks = { onStdout: (c) => chunks.push(c) };
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("run_command", { command: "npm install" }),
      hooks,
    );
    expect(res.success).toBe(true);
    expect(runLog).toContain("npm install");
    expect(chunks.length).toBeGreaterThan(0);
    expect(res.result).toContain("exit code: 0");
  });

  it("done() sets isDone and returns summary", async () => {
    const { sandbox } = makeFakeSandbox();
    const res = await executeToolOnSandbox(
      sandbox,
      toolCall("done", { summary: "app selesai" }),
    );
    expect(res.isDone).toBe(true);
    expect(res.doneSummary).toBe("app selesai");
  });

  it("returns parse error for malformed tool call", async () => {
    const { sandbox } = makeFakeSandbox();
    const res = await executeToolOnSandbox(sandbox, {
      id: "tc-bad",
      type: "function",
      function: { name: "create_file", arguments: "not json" },
    });
    expect(res.success).toBe(false);
    expect(res.result).toContain("Could not parse");
  });
});
