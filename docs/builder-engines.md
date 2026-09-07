# Builder Engine: StackBlitz SDK

The dmrxai App Builder uses the **StackBlitz SDK** (`@stackblitz/sdk`) as its
single execution engine. The previous dual-engine model (E2B cloud sandboxes +
the WebContainer API) has been removed.

## How it works

1. **Server — single LLM turn per request** (`app/api/builder/agent/route.ts`)
   - The route is stateless. It makes ONE LLM call, streams the assistant's
     reasoning as `thinking_delta` SSE events, emits any `tool_call`s, then
     ends with a `done` event.
   - `done.continuation` is `"client-execute"` when the model produced tool
     calls (the client must run them and continue the loop) or `null` when the
     turn is final.
   - No sandbox is booted server-side. There is no command execution.

2. **Client — tool dispatch on an in-memory file map** (`app/hooks/useBuilderSession.ts`)
   - The hook keeps an in-memory `Record<string, string>` file map (keyed by
     leading-slash paths, e.g. `/src/App.tsx`), seeded from localStorage.
   - For each `tool_call`, it calls `executeToolOnFileMap` from
     `app/lib/stackblitz-tool-dispatch.ts`, applies the resulting file changes
     to the map + localStorage, then re-POSTs the extended history to continue
     the loop until `continuation: null` (or the model calls `done`).

3. **Preview — StackBlitz embed** (`app/lib/stackblitz-embed.ts`, `app/components/BuilderWorkspaceE2B.tsx`)
   - `embedFiles(...)` mounts the generated file map into a StackBlitz project
     (`template: "node"`, runs on StackBlitz WebContainers) inside an iframe and
     returns a `VM`. The embed iframe IS the live preview.
   - StackBlitz auto-installs dependencies from `package.json` and runs the dev
     script — there is no separate `npm install` / dev-server step on our side.
   - Subsequent runs push incremental updates via `applyFileChanges(vm, prev, next)`.

## Agent tools

The AI can call 6 tools (`app/lib/agent-tools.ts` → `BUILDER_TOOLS`):

| Tool | Purpose |
|---|---|
| `create_file` | Create/overwrite a file |
| `apply_diff` | Edit a file via SEARCH/REPLACE blocks |
| `delete_file` | Delete a file |
| `read_file` | Read a file (10K char cap) |
| `list_files` | List files (optionally under a directory) |
| `done` | Mark the build complete |

There is **no `run_command` tool** — StackBlitz has no shell surface. To add a
dependency the AI edits `package.json`; StackBlitz installs it automatically.
Generated projects must be Vite + React + TypeScript with a valid
`package.json` (with a `dev` script), an `index.html`, and `src/main.tsx` +
`src/App.tsx`.

## Constraints

- **No native binaries** (sharp, sqlite3, etc.) — JS/TS + npm only.
- New StackBlitz projects live in browser memory unless a user forks them.
- The project file map persists in localStorage (mirrored to Supabase when the
  user is authenticated); StackBlitz itself is re-embedded from that map.
- No cross-origin isolation (COOP/COEP) headers are required — StackBlitz runs
  in its own iframe origin.

## Key files

- Server route: `app/api/builder/agent/route.ts`
- Client session loop: `app/hooks/useBuilderSession.ts`
- Tool dispatcher (pure): `app/lib/stackblitz-tool-dispatch.ts`
- StackBlitz embed helper: `app/lib/stackblitz-embed.ts`
- Tool defs + prompts: `app/lib/agent-tools.ts`
- UI: `app/components/BuilderWorkspaceE2B.tsx`, `app/builder/page.tsx`
