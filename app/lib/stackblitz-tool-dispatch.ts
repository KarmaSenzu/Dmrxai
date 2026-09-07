"use client";

/**
 * Client-side tool dispatcher for the StackBlitz engine.
 *
 * The StackBlitz SDK embeds a project in an iframe and runs it on StackBlitz's
 * own WebContainers infra. Unlike the old E2B/WebContainer engines, there is
 * NO shell/command execution surface — the only filesystem operations are
 * `vm.applyFsDiff` / `vm.getFsSnapshot`. Dependencies are auto-installed by
 * StackBlitz from `package.json`.
 *
 * Therefore the agent's tools operate on an in-memory file map (the same map
 * the client persists to localStorage). After a run we hand that map to the
 * StackBlitz embed for the live preview. Paths are normalised with a leading
 * "/" to match the localStorage convention used by builder-storage.
 */

import type { ToolCall } from "./agent-tools";
import { parseToolCall, applyDiffToContent } from "./agent-tools";

export interface ToolDispatchFileChange {
  /** Normalised path with leading "/". */
  path: string;
  content: string;
  deleted?: boolean;
}

export interface ToolDispatchResult {
  /** Human/LLM-readable result string pushed back as the tool message. */
  result: string;
  success: boolean;
  /** Files mutated by this call so the caller can update its map + storage. */
  filesChanged: ToolDispatchFileChange[];
  /** Set true when the AI called done(). The caller stops iterating. */
  isDone?: boolean;
  /** Summary text from a done() call, if any. */
  doneSummary?: string;
}

/** Normalise a tool-supplied path to a single leading-slash form. */
function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  const noLead = trimmed.replace(/^\/+/, "");
  return "/" + noLead;
}

/**
 * Execute a single tool call against an in-memory file map. The map is keyed
 * by leading-slash paths (e.g. "/src/App.tsx"). The function does NOT mutate
 * the passed map — it returns the changes so the caller controls persistence.
 */
export function executeToolOnFileMap(
  files: Record<string, string>,
  toolCall: ToolCall,
): ToolDispatchResult {
  const parsed = parseToolCall(toolCall);
  if (!parsed) {
    return {
      result:
        "Error: Could not parse tool arguments. Please try again with valid JSON.",
      success: false,
      filesChanged: [],
    };
  }

  const filesChanged: ToolDispatchFileChange[] = [];
  let result = "";
  let success = true;

  try {
    switch (parsed.name) {
      case "create_file": {
        const { path, content } = parsed.args;
        const key = normalizePath(path);
        if (key === "/") {
          result = `Error: invalid file path "${path}".`;
          success = false;
          break;
        }
        filesChanged.push({ path: key, content });
        result = `File created: ${path}`;
        break;
      }

      case "apply_diff": {
        const { path, diff } = parsed.args;
        const key = normalizePath(path);
        const current = files[key];
        if (typeof current !== "string") {
          result = `Error: File "${path}" not found. Use create_file to create it first.`;
          success = false;
          break;
        }
        const { result: newContent, applied, failed } = applyDiffToContent(
          current,
          diff,
        );
        if (applied === 0 && failed.length > 0) {
          result =
            `Error: Could not find any SEARCH blocks in ${path}. Failed matches:\n` +
            `${failed.join("\n")}\n\n` +
            `Use read_file("${path}") to see current content, then retry with exact text.`;
          success = false;
          break;
        }
        filesChanged.push({ path: key, content: newContent });
        result = `File edited: ${path} (${applied} change(s) applied${
          failed.length > 0 ? `, ${failed.length} failed` : ""
        })`;
        if (failed.length > 0) {
          result += `\nFailed blocks (text not found): ${failed.join("; ")}`;
        }
        break;
      }

      case "delete_file": {
        const { path } = parsed.args;
        const key = normalizePath(path);
        if (typeof files[key] !== "string") {
          result = `Error: File "${path}" not found.`;
          success = false;
          break;
        }
        filesChanged.push({ path: key, content: "", deleted: true });
        result = `File deleted: ${path}`;
        break;
      }

      case "read_file": {
        const { path } = parsed.args;
        const key = normalizePath(path);
        const content = files[key];
        if (typeof content !== "string") {
          result = `Error: File "${path}" not found.`;
          success = false;
          break;
        }
        // 10K cap matches the old engines to keep tool messages bounded.
        result = content.slice(0, 10000);
        break;
      }

      case "list_files": {
        const { directory } = parsed.args;
        const dir = directory ? normalizePath(directory) : "/";
        const prefix = dir === "/" ? "/" : dir.replace(/\/+$/, "") + "/";
        const matches = Object.keys(files)
          .filter((p) => (dir === "/" ? true : p.startsWith(prefix)))
          .sort();
        result = matches.length > 0 ? matches.join("\n") : "(empty directory)";
        break;
      }

      case "done": {
        result = "Task marked as complete. Preview will start now.";
        return {
          result,
          success: true,
          filesChanged: [],
          isDone: true,
          doneSummary: parsed.args.summary,
        };
      }
    }
  } catch (e) {
    result = `Error executing ${parsed.name}: ${
      e instanceof Error ? e.message : "Unknown error"
    }`;
    success = false;
  }

  return { result, success, filesChanged };
}
