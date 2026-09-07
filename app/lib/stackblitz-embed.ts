"use client";

import sdk from "@stackblitz/sdk";
import type { VM, Project } from "@stackblitz/sdk";

/**
 * StackBlitz embed helper for the AI App Builder.
 *
 * StackBlitz runs the generated project on its own WebContainers infra inside
 * an iframe; the embed iframe IS the live preview. We push the AI-generated
 * file map into a StackBlitz project, and on subsequent runs diff the map and
 * apply only the changes via the VM's `applyFsDiff`.
 *
 * File-path convention:
 *  - Our in-memory map / localStorage uses leading-slash keys ("/src/App.tsx").
 *  - StackBlitz `Project.files` and `applyFsDiff` use NO leading slash
 *    ("src/App.tsx"). `toSbFiles` / `toSbPath` bridge the two.
 */

/** Strip the leading slash for StackBlitz's path convention. */
function toSbPath(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Convert a leading-slash file map to StackBlitz's `files` shape. */
function toSbFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    const p = toSbPath(path);
    if (p) out[p] = content;
  }
  return out;
}

export interface EmbedOptions {
  /** Element (or its id) to replace with the StackBlitz iframe. */
  element: string | HTMLElement;
  /** Leading-slash keyed file map (our localStorage convention). */
  files: Record<string, string>;
  title?: string;
  description?: string;
  /** File to open in the embedded editor first. */
  openFile?: string;
  /** "preview" (default), "editor", or "default" (split). */
  view?: "preview" | "editor" | "default";
  height?: number | string;
  /** Hide the editor/explorer chrome, show only the preview. */
  hideExplorer?: boolean;
  hideNavigation?: boolean;
}

/**
 * Embed a fresh StackBlitz project built from the given file map.
 * Returns the VM handle for subsequent `applyFsDiff` updates.
 *
 * The project uses the `node` template so StackBlitz runs on WebContainers and
 * auto-installs dependencies from package.json, then runs the dev script
 * declared via the `stackblitz` field / scripts.
 */
export async function embedFiles(opts: EmbedOptions): Promise<VM> {
  const project: Project = {
    title: opts.title ?? "Generated App",
    description: opts.description ?? "Built with dmrxai App Builder",
    // "node" runs on WebContainers (full Vite dev server + auto npm install).
    template: "node",
    files: toSbFiles(opts.files),
  };

  const vm = await sdk.embedProject(opts.element, project, {
    openFile: opts.openFile ?? "src/App.tsx",
    view: opts.view ?? "preview",
    height: opts.height,
    hideExplorer: opts.hideExplorer ?? true,
    hideNavigation: opts.hideNavigation ?? false,
    // Show the install/run output so users see progress while it boots.
    terminalHeight: 30,
  });

  return vm;
}

/**
 * Diff `nextFiles` against `prevFiles` and apply the delta to a live VM.
 * StackBlitz requires the FULL new content for modified files, so we send the
 * complete content for every created/changed file and list removed paths in
 * `destroy`.
 */
export async function applyFileChanges(
  vm: VM,
  prevFiles: Record<string, string>,
  nextFiles: Record<string, string>,
): Promise<void> {
  const create: Record<string, string> = {};
  const destroy: string[] = [];

  for (const [path, content] of Object.entries(nextFiles)) {
    if (prevFiles[path] !== content) {
      create[toSbPath(path)] = content;
    }
  }
  for (const path of Object.keys(prevFiles)) {
    if (!(path in nextFiles)) {
      destroy.push(toSbPath(path));
    }
  }

  if (Object.keys(create).length === 0 && destroy.length === 0) return;

  await vm.applyFsDiff({ create, destroy });
}
