// app/lib/sandbox-tool-executor.ts
//
// Server-side tool executor for the App Builder agent.
//
// This is the replacement for the client-side `stackblitz-tool-dispatch.ts`.
// Instead of mutating an in-memory file map in the browser, each tool call is
// executed against a live sandbox (E2B or Docker — both implement `E2BSandbox`)
// on the server, so files persist and `run_command` streams real output.
//
// This is what fixes the three core symptoms the user reported:
//   1. "code restarts from 0"  → files live in the sandbox, not localStorage
//   2. "preview blank"          → the dev server actually runs in the sandbox
//   3. "terminal silent"        → stdout/stderr streamed via `onStdout`
//
// The executor is intentionally sandbox-agnostic: it only talks to the
// `E2BSandbox` interface, so the same code works for E2B and Docker backends.

import { createLogger } from "@/lib/logger";
import {
  parseToolCall,
  applyDiffToContent,
  type ToolCall,
} from "@/lib/agent-tools";
import type { E2BSandbox } from "@/lib/e2b-sandbox";

const log = createLogger("sandbox-tool-executor");

export interface ToolExecutionResult {
  /** Human/LLM-readable result string pushed back as the tool message. */
  result: string;
  success: boolean;
  /** Set true when the AI called done(). The caller stops iterating. */
  isDone?: boolean;
  /** Summary text from a done() call, if any. */
  doneSummary?: string;
}

export interface ToolExecutionHooks {
  /** Called with each stdout chunk from run_command (for terminal streaming). */
  onStdout?: (chunk: string) => void;
  /** Called with each stderr chunk from run_command (for terminal streaming). */
  onStderr?: (chunk: string) => void;
}

/** Normalise a tool-supplied path to a leading-slash form. */
function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  const collapsed = trimmed.replace(/\/+/g, "/");
  const noLead = collapsed.replace(/^\/+/, "");
  return "/" + noLead;
}

/**
 * Execute a single tool call against a live sandbox.
 */
export async function executeToolOnSandbox(
  sandbox: E2BSandbox,
  toolCall: ToolCall,
  hooks: ToolExecutionHooks = {},
): Promise<ToolExecutionResult> {
  const parsed = parseToolCall(toolCall);
  if (!parsed) {
    return {
      result: "Error: Could not parse tool arguments. Please try again with valid JSON.",
      success: false,
    };
  }

  try {
    switch (parsed.name) {
      case "create_file": {
        const { path, content } = parsed.args;
        const key = normalizePath(path);
        if (key === "/") {
          return { result: `Error: invalid file path "${path}".`, success: false };
        }
        await sandbox.files.write(key, content);
        return { result: `File created: ${path}`, success: true };
      }

      case "apply_diff": {
        const { path, diff } = parsed.args;
        const key = normalizePath(path);
        let current: string;
        try {
          current = await sandbox.files.read(key);
        } catch {
          return {
            result: `Error: File "${path}" not found. Use create_file to create it first.`,
            success: false,
          };
        }
        const { result: newContent, applied, failed } = applyDiffToContent(current, diff);
        if (applied === 0 && failed.length > 0) {
          return {
            result:
              `Error: Could not find any SEARCH blocks in ${path}. Failed matches:\n` +
              `${failed.join("\n")}\n\n` +
              `Use read_file("${path}") to see current content, then retry with exact text.`,
            success: false,
          };
        }
        await sandbox.files.write(key, newContent);
        let result = `File edited: ${path} (${applied} change(s) applied`;
        if (failed.length > 0) {
          result += `, ${failed.length} failed: ${failed.join("; ")}`;
        }
        result += ")";
        return { result, success: true };
      }

      case "delete_file": {
        const { path } = parsed.args;
        const key = normalizePath(path);
        try {
          await sandbox.files.remove(key);
        } catch {
          return { result: `Error: File "${path}" not found.`, success: false };
        }
        return { result: `File deleted: ${path}`, success: true };
      }

      case "read_file": {
        const { path } = parsed.args;
        const key = normalizePath(path);
        try {
          const content = await sandbox.files.read(key);
          return { result: content.slice(0, 10000), success: true };
        } catch {
          return { result: `Error: File "${path}" not found.`, success: false };
        }
      }

      case "list_files": {
        const { directory } = parsed.args;
        const entries = await sandbox.files.list(directory);
        const names = entries.map((e) => (e.type === "dir" ? e.path + "/" : e.path));
        return {
          result: names.length > 0 ? names.join("\n") : "(empty directory)",
          success: true,
        };
      }

      case "run_command": {
        const { command } = parsed.args;
        log.info("run_command", "Executing sandbox command", { command });
        const { exitCode, stdout, stderr } = await sandbox.process.start({
          cmd: command,
          onStdout: hooks.onStdout,
          onStderr: hooks.onStderr,
        });
        const result =
          `exit code: ${exitCode}\n` +
          (stdout ? `stdout:\n${stdout.slice(0, 4000)}\n` : "") +
          (stderr ? `stderr:\n${stderr.slice(0, 2000)}` : "");
        return { result, success: exitCode === 0 };
      }

      case "done": {
        return {
          result: "Task marked as complete.",
          success: true,
          isDone: true,
          doneSummary: parsed.args.summary,
        };
      }

      default:
        return { result: `Unknown tool: ${(parsed as { name: string }).name}`, success: false };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    log.error("executeToolOnSandbox", "Tool execution failed", { name: parsed.name, error: msg });
    return { result: `Error executing ${parsed.name}: ${msg}`, success: false };
  }
}

export default executeToolOnSandbox;
