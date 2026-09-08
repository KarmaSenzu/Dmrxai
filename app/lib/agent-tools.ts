// ---- Mode Types ----

import { createLogger } from "@/lib/logger";

const log = createLogger("agent-tools");

export type AgentMode = "architect" | "code" | "debug";

// ---- Tool Definitions (OpenAI function calling format) ----

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
        items?: { type: string };
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

export const BUILDER_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file or overwrite an existing file completely. Use for NEW files or when >70% of the file changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to project root (e.g., 'src/App.jsx', 'package.json')",
          },
          content: {
            type: "string",
            description: "The complete file content to write",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_diff",
      description: "Edit an existing file using SEARCH/REPLACE blocks. More efficient than rewriting the whole file. Use for small to medium changes (<70% of file). The SEARCH block must match the existing content EXACTLY (including whitespace).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to edit",
          },
          diff: {
            type: "string",
            description: "One or more SEARCH/REPLACE blocks in this format:\n<<<<<<< SEARCH\nexact old content\n=======\nnew content\n>>>>>>> REPLACE",
          },
        },
        required: ["path", "diff"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the project.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to delete",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a file. Use to inspect existing code before making changes. Call multiple read_file in parallel if you need several files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files in a directory (recursive, excludes node_modules). Use to understand project structure before making changes.",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Directory path to list (default: project root '.')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command inside the project sandbox (e.g. 'npm install', 'npm run dev', 'ls -la'). Output (stdout/stderr) is streamed back. Use to install dependencies declared in package.json or inspect the environment.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to run inside the sandbox workspace directory",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Signal that you have completed the current task. Call this when all files are written and dependencies are declared in package.json so the sandbox can install them and start the dev server. Include a summary of what was built/changed.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Brief summary of what was accomplished (1-3 sentences, in the user's language)",
          },
        },
        required: ["summary"],
      },
    },
  },
];

// ---- System Prompts ----

const BASE_PROMPT = `Kamu adalah AI App Builder di platform dmrxai. Kamu membantu user merancang, membangun, dan mengembangkan aplikasi web secara end-to-end melalui chat.

## RUNTIME: STACKBLITZ
- App berjalan di StackBlitz (embedded di iframe), BUKAN di mesin dengan terminal/shell.
- TIDAK ADA eksekusi shell command sama sekali. Tidak ada \`npm install\`, \`npm run\`, terminal, atau dev server manual.
- StackBlitz OTOMATIS meng-install dependencies dari \`package.json\` dan menjalankan dev script (mis. \`"dev": "vite"\`) setiap kali file berubah.
- Untuk menambah dependency: EDIT \`package.json\` (field \`dependencies\` / \`devDependencies\`) via create_file/apply_diff. JANGAN coba jalankan command apa pun.
- Project WAJIB berupa app Vite + React + TypeScript dengan: \`package.json\` valid yang punya script \`dev\` (mis. \`"dev": "vite"\`), file \`index.html\`, dan entry standar Vite/React (\`src/main.tsx\`, \`src/App.tsx\`).

## IDENTITAS & CARA BICARA
- Bahasa default: Bahasa Indonesia santai-profesional. Ikuti bahasa user.
- Jangan gunakan template pertanyaan kaku. Bertanya hanya jika benar-benar ambigu.
- Berikan saran berdasarkan best practice industri, bukan asumsi generik.
- Jelas, ringkas, dan langsung ke solusi. Hindari basa-basi.

## ATURAN MUTLAK (HARD RULES)
1. JANGAN PERNAH membuat ulang file yang sudah ada di project. Selalu cek file tree dulu sebelum menulis kode.
2. Untuk modifikasi file existing, WAJIB pakai tool apply_diff dengan format SEARCH/REPLACE. Dilarang menulis ulang isi file lengkap kecuali file baru atau perubahan >70%.
3. Jika butuh isi file yang tidak ada di context, panggil tool read_file(path) dulu. Jangan menebak isi file.
4. Setiap perubahan file harus lewat tool call (create_file, apply_diff, delete_file), bukan ditulis di pesan biasa.
5. Hemat token output: jangan ulang isi file panjang di penjelasan, cukup referensikan path-nya.
6. Panggil tools secara paralel jika tidak saling depend. Misal: read 3 file sekaligus dalam satu turn.
7. JANGAN coba menjalankan shell command (tidak ada terminal). Tambah dependency = edit package.json, bukan \`npm install\`.

## FORMAT DIFF (WAJIB untuk edit file existing via apply_diff)
<<<<<<< SEARCH
exact old content here (must match file exactly, including whitespace)
=======
new replacement content
>>>>>>> REPLACE

Aturan diff:
- SEARCH block harus PERSIS sama dengan isi file (whitespace, indent, semua).
- Satu blok = satu lokasi perubahan. Pecah jadi beberapa blok jika edit di banyak tempat.
- Untuk file baru: pakai tool create_file dengan full content, bukan diff.

## TOOLS YANG TERSEDIA
- read_file(path) → baca isi file
- create_file(path, content) → buat file baru / overwrite penuh
- apply_diff(path, diff) → edit file existing dengan SEARCH/REPLACE
- delete_file(path) → hapus file
- list_files(dir?) → lihat struktur project
- done(summary) → tandai task selesai; StackBlitz auto-install deps dari package.json & auto-start dev server

CATATAN: Tidak ada tool untuk menjalankan shell command. Untuk menambah library, edit \`package.json\`.

## ANTI-LOOP RULE (WAJIB)
Jika tool call gagal dengan error sama 2x, JANGAN ulangi dengan args sama.
Coba pendekatan berbeda atau lanjutkan tanpa tool itu. Maximum 25 iterasi total per run.
Kalau sudah 3x error sama, sistem akan auto-stop dan run dianggap gagal.`;

const ARCHITECT_PROMPT = `## MODE: ARCHITECT

Kamu sedang dalam fase perencanaan. JANGAN menulis kode atau memanggil tool create_file/apply_diff/delete_file di mode ini.

## TOOLS DI ARCHITECT MODE
- Untuk project BARU (belum ada file): JANGAN panggil list_files atau read_file. Sistem akan return "(empty — project belum punya file)" dan tool call cuma buang iterasi. Langsung diskusi dengan user dan output JSON plan.
- Untuk project EXISTING (sudah ada file di [PROJECT STATE]): boleh panggil list_files dan read_file untuk pahami struktur sebelum kasih saran. Maksimal 1-2 read_file per turn.
- JANGAN panggil create_file, apply_diff, delete_file di mode ini. Sistem akan reject dengan error.
- Panggil done(summary) saat plan sudah siap dan kamu sudah output JSON plan dengan ready_to_build: true.

Tujuan kamu:
1. Pahami goal user lewat dialog natural (bukan checklist pertanyaan).
2. Beri saran arsitektur, stack, dan pendekatan yang sesuai skala project.
3. Identifikasi ambiguitas dan klarifikasi dengan 1-2 pertanyaan tajam, bukan list panjang.
4. Setelah cukup info, output rencana terstruktur.

Saat plan sudah siap, sertakan JSON plan di akhir pesan kamu (dalam code block json):

\`\`\`json
{
  "plan_ready": true,
  "summary": "Deskripsi singkat sistem yang akan dibangun",
  "stack": {
    "frontend": "React 18 + Vite + TypeScript + Tailwind",
    "state": "Zustand",
    "routing": "React Router DOM"
  },
  "features": ["fitur 1", "fitur 2", "fitur 3"],
  "todos": [
    { "id": 1, "task": "Setup project Vite + React + TypeScript + Tailwind", "files": ["package.json", "index.html", "vite.config.ts", "tailwind.config.ts"], "depends_on": [] },
    { "id": 2, "task": "Buat layout utama dan routing", "files": ["src/App.tsx", "src/main.tsx"], "depends_on": [1] }
  ],
  "estimated_files": 12,
  "ready_to_build": true
}
\`\`\`

Saat ready_to_build: true, UI akan menampilkan tombol "Build App". Tunggu user klik tombol itu, jangan auto-eksekusi.

Jika user masih eksplorasi atau ragu, set plan_ready: false dan lanjut diskusi. Jangan paksa user untuk commit ke plan.

## TONE
Seperti tech lead yang ngobrol santai sama developer. Ajak diskusi, bukan interogasi. Kalau user bilang "bikin app todo", jangan tanya "mau pakai database apa, auth apa, deploy ke mana". Cukup: "Oke todo app. React + Vite + Tailwind cukup buat MVP. Mau ada fitur multi-user atau single-user dulu?"`;

const CODE_PROMPT = `## MODE: CODE

Kamu sedang implement kode berdasarkan plan yang sudah disetujui atau request user pada project yang sudah ada.

## ATURAN MUTLAK CODE MODE
1. JANGAN PERNAH output plan summary atau JSON dengan ready_to_build di mode ini. Kalau plan sudah ada di history, JANGAN ulangi.
2. JANGAN PERNAH selesaikan turn ini tanpa memanggil setidaknya 1 tool (read_file, list_files, create_file, apply_diff, atau done). Pesan teks doang DILARANG sebagai response final.
3. SELALU mulai dengan list_files atau langsung create_file/apply_diff. JANGAN tanya user "mau dilanjutkan ke mana".
4. Setelah eksekusi selesai, panggil done(summary) untuk menyelesaikan turn.

## URUTAN KERJA
1. Baca [PROJECT STATE] yang sudah disediakan dalam system message.
2. Lihat [RELEVANT FILES] untuk memahami kode existing.
3. Untuk request user:
   - "lanjutkan" / "lanjut" / "continue" / "teruskan" / "next" → identifikasi fitur belum lengkap atau bug, lalu eksekusi via tools.
   - "build" → eksekusi todo dari plan secara berurutan via create_file.
   - Spesifik (e.g., "tambahkan dark mode") → fokus ke perubahan tersebut, gunakan apply_diff.
4. Untuk setiap task:
   - File baru → create_file(path, content)
   - File existing → apply_diff(path, diff) dengan SEARCH/REPLACE
5. Setelah selesai semua, panggil done(summary).

## EFISIENSI TOKEN
- Edit kecil → SELALU apply_diff.
- Edit besar (>70%) → create_file.
- Jangan jelaskan kode yang baru ditulis kalau sudah jelas dari diff.

## SAAT USER MINTA TAMBAH FITUR DI PROJECT EXISTING
JANGAN bikin ulang dari nol. Wajib:
1. list_files untuk lihat struktur (tools call, BUKAN text).
2. read_file file-file yang relevan (parallel).
3. apply_diff untuk file existing, create_file untuk file baru.

## SAAT PROMPT USER AMBIGU ("lanjutkan", "fix", "next")
JANGAN minta klarifikasi via text. Pilih ACTION konkret berdasarkan project state:
- Kalau todo dari plan masih ada → eksekusi todo paling depan via create_file.
- Kalau semua todo done tapi user bilang "lanjutkan" → identifikasi improvement opsional (refine UI, add error handling, optimize) lalu execute via apply_diff.
- Kalau project sudah final dan user "lanjutkan" tanpa konteks → call done("Project sudah final. Beri tahu fitur spesifik yang ingin ditambah.") dengan tone informative.

## ERROR HANDLING
Tidak ada terminal untuk menjalankan/test kode. Kalau ada error:
1. Baca pesan error dari user atau dari [PROJECT STATE].
2. Identifikasi root cause dari kode.
3. Fix langsung via apply_diff tanpa tanya user.

## DEPENDENCY & DEV SERVER (STACKBLITZ)
- StackBlitz auto-install dependencies dari package.json dan auto-start dev server setelah done().
- TIDAK ADA terminal/shell. JANGAN coba \`npm install\`, \`npm run dev\`, atau command apa pun.
- Butuh library baru? Tambahkan ke field \`dependencies\`/\`devDependencies\` di package.json via apply_diff (atau create_file kalau package.json belum ada).
- Pastikan package.json punya script \`dev\` (mis. \`"dev": "vite"\`), ada index.html, dan entry src/main.tsx + src/App.tsx.

## OUTPUT YANG DILARANG
- ❌ Output JSON plan dengan ready_to_build di mode ini
- ❌ Pesan "Plan ... siap" / "Plan ... selesai"
- ❌ Klarifikasi pertanyaan ke user
- ❌ Hanya text response tanpa tool call
- ❌ Re-summarize project yang sudah dibuat

## OUTPUT YANG DIWAJIBKAN
- ✅ Mulai dengan tool call (list_files / read_file / create_file / apply_diff)
- ✅ Akhiri dengan done(summary)
- ✅ Antara start dan done: hanya tool calls, tidak ada text-only response`;

const DEBUG_PROMPT = `## MODE: DEBUG

User sedang stuck dengan bug atau error. Tugas kamu: investigate, identifikasi root cause, fix.

## URUTAN
1. Baca pesan error / deskripsi bug dari user.
2. Panggil read_file untuk file yang terlibat (lihat stack trace, file tree).
3. Telusuri root cause langsung dari kode (tidak ada terminal untuk reproduce/run test).
4. Jelaskan root cause dalam 2-3 kalimat.
5. Apply fix via apply_diff.
6. Kalau bug karena dependency hilang/salah versi, perbaiki package.json (StackBlitz akan re-install otomatis).

## ATURAN
- JANGAN langsung patch tanpa baca file. Banyak bug butuh konteks.
- Jika fix akan mengubah behavior lain, peringatkan user dulu.
- Jangan tambahkan defensive code yang tidak diminta. Fix hanya yang rusak.
- Jika gagal 2x, jelaskan situasi dan tawarkan pendekatan berbeda.`;

// ---- Prompt Builder ----

/**
 * Build the complete system prompt based on mode.
 */
export function getSystemPrompt(mode: AgentMode): string {
  const modePrompt = {
    architect: ARCHITECT_PROMPT,
    code: CODE_PROMPT,
    debug: DEBUG_PROMPT,
  }[mode];
  return `${BASE_PROMPT}\n\n${modePrompt}`;
}

/**
 * Auto-detect mode from context.
 * - New project (no files) → architect
 * - Existing project + error keywords → debug
 * - Existing project + resume keywords → code (continue interrupted work)
 * - Existing project + normal request → code
 */
export function detectMode(args: {
  hasFiles: boolean;
  prompt: string;
  hasPlan: boolean;
}): AgentMode {
  const lower = args.prompt.toLowerCase();

  // Debug signals — highest priority when files exist.
  const debugKeywords = /\b(error|bug|crash|gagal|rusak|broken|fix|debug|stack\s*trace|cannot|undefined|null|typeerror|referenceerror|syntaxerror|failed|tidak\s*jalan|tidak\s*bisa|kenapa|why.*not\s*work)\b/i;
  if (args.hasFiles && debugKeywords.test(lower)) {
    log.debug("detectMode", "Detected debug mode", { hasFiles: args.hasFiles, hasPlan: args.hasPlan });
    return "debug";
  }

  // Resume signals — user wants to continue an interrupted build. Strong
  // intent to keep working on existing files, so skip architect mode.
  const resumeKeywords = /\b(lanjutkan|lanjut|continue|teruskan|resume|next|selesaikan|finish|complete|next\s+step|gas|go|fix\s+it|perbaiki)\b/i;
  if (args.hasFiles && resumeKeywords.test(lower)) {
    log.debug("detectMode", "Detected code mode (resume)", { hasFiles: args.hasFiles, hasPlan: args.hasPlan });
    return "code";
  }

  // Build-now signals — user explicitly wants the AI to start building right
  // away (imperative "buatkan/eksekusi/langsung buat"), rather than just
  // brainstorming. Even on a fresh project, this should skip architect and go
  // straight to code mode, otherwise the agent gets stuck asking questions.
  const buildNowKeywords = /\b(buatkan|buatin|bikinin|bangun|build|eksekusi|execute|langsung\s*buat|tolong\s*buat|mulai\s*buat|bikin\s*sekarang|buat\s*sekarang|jadiin|kerjakan|implementasikan)\b/i;
  if (buildNowKeywords.test(lower)) {
    log.debug("detectMode", "Detected code mode (build-now intent)", { hasFiles: args.hasFiles, hasPlan: args.hasPlan });
    return "code";
  }

  // Empty project + no plan → architect (planning phase).
  if (!args.hasFiles && !args.hasPlan) {
    log.debug("detectMode", "Detected architect mode", { hasFiles: args.hasFiles, hasPlan: args.hasPlan });
    return "architect";
  }

  // Default: code mode if anything exists.
  log.debug("detectMode", "Defaulting to code mode", { hasFiles: args.hasFiles, hasPlan: args.hasPlan });
  return "code";
}

// ---- Project State Builder ----

/**
 * Build the [PROJECT STATE] context string injected into every request.
 */
export function buildProjectState(args: {
  fileTree: string[];
  existingFiles?: Record<string, string>;
}): string {
  if (args.fileTree.length === 0 && (!args.existingFiles || Object.keys(args.existingFiles).length === 0)) {
    return "[PROJECT STATE]\nProject baru — belum ada file.";
  }
  
  const lines: string[] = ["[PROJECT STATE]"];
  
  // File tree
  if (args.fileTree.length > 0) {
    lines.push("File tree:");
    for (const f of args.fileTree.slice(0, 80)) {
      lines.push(`  ${f}`);
    }
    if (args.fileTree.length > 80) {
      lines.push(`  ... dan ${args.fileTree.length - 80} file lainnya`);
    }
  } else if (args.existingFiles) {
    lines.push("File tree:");
    for (const path of Object.keys(args.existingFiles).sort().slice(0, 80)) {
      lines.push(`  ${path}`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Build the [RELEVANT FILES] context — full content of key files.
 * For small projects (<10 files), include all. For larger, include only the most relevant.
 */
export function buildRelevantFiles(
  existingFiles: Record<string, string>,
  prompt: string,
): string {
  const entries = Object.entries(existingFiles);
  if (entries.length === 0) return "";
  
  // For small projects, include all files (capped at content size)
  const MAX_TOTAL_CHARS = 30000;
  let totalChars = 0;
  const included: Array<[string, string]> = [];
  
  // Priority: package.json first, then files matching prompt keywords, then rest
  const promptTokens = prompt.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  
  const scored = entries.map(([path, content]) => {
    let score = 0;
    const lowerPath = path.toLowerCase();
    if (lowerPath.includes("package.json")) score += 100;
    if (lowerPath.includes("app.") || lowerPath.includes("main.")) score += 50;
    if (lowerPath.includes("index.")) score += 30;
    for (const token of promptTokens) {
      if (lowerPath.includes(token)) score += 20;
      if (content.toLowerCase().includes(token)) score += 5;
    }
    return { path, content, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  for (const { path, content } of scored) {
    if (totalChars + content.length > MAX_TOTAL_CHARS) {
      // Include truncated version
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (remaining > 200) {
        included.push([path, content.slice(0, remaining) + "\n// ... [truncated]"]);
        totalChars = MAX_TOTAL_CHARS;
      }
      break;
    }
    included.push([path, content]);
    totalChars += content.length;
  }
  
  if (included.length === 0) return "";
  
  const lines: string[] = ["[RELEVANT FILES]"];
  for (const [path, content] of included) {
    lines.push(`--- ${path} ---`);
    lines.push(content);
    lines.push("");
  }
  return lines.join("\n");
}

// ---- Message Builder ----

/**
 * Build the full messages array for the agent loop.
 */
export function buildAgentMessages(args: {
  userPrompt: string;
  mode: AgentMode;
  projectPlan?: string;
  existingFiles?: Record<string, string>;
  fileTree?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // System prompt (base + mode)
  const systemPrompt = getSystemPrompt(args.mode);
  messages.push({ role: "system", content: systemPrompt });

  // Project state context
  const projectState = buildProjectState({
    fileTree: args.fileTree ?? Object.keys(args.existingFiles ?? {}),
    existingFiles: args.existingFiles,
  });
  if (projectState) {
    messages.push({ role: "system", content: projectState });
  }

  // Relevant files (for code/debug modes)
  if ((args.mode === "code" || args.mode === "debug") && args.existingFiles && Object.keys(args.existingFiles).length > 0) {
    const relevantFiles = buildRelevantFiles(args.existingFiles, args.userPrompt);
    if (relevantFiles) {
      messages.push({ role: "system", content: relevantFiles });
    }
  }

  // Current plan (if available)
  if (args.projectPlan && args.projectPlan.trim().length > 0) {
    messages.push({
      role: "system",
      content: `[CURRENT PLAN]\n${args.projectPlan.slice(0, 6000)}`,
    });
  }

  // Conversation history
  if (args.history && args.history.length > 0) {
    // In code/debug mode, filter out plan-shape assistant messages from architect mode
    // to prevent the AI from mimicking that pattern.
    const filteredHistory = args.mode === "code" || args.mode === "debug"
      ? args.history.filter((m) => {
          if (m.role === "user") return true;
          // Drop assistant messages that look like architect plans
          const looksLikePlan = /ready_to_build|plan_ready|^##\s+(Ringkasan|Rencana|Stack|Pilihan)/im.test(m.content);
          return !looksLikePlan;
        })
      : args.history;

    for (const msg of filteredHistory.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // User prompt
  messages.push({ role: "user", content: args.userPrompt });

  return messages;
}

// ---- Tool Call Types ----

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

// ---- Tool Argument Types ----

export interface CreateFileArgs { path: string; content: string; }
export interface ApplyDiffArgs { path: string; diff: string; }
export interface DeleteFileArgs { path: string; }
export interface ReadFileArgs { path: string; }
export interface ListFilesArgs { directory?: string; }
export interface RunCommandArgs { command: string; }
export interface DoneArgs { summary: string; }

export type ToolArgs =
  | { name: "create_file"; args: CreateFileArgs }
  | { name: "apply_diff"; args: ApplyDiffArgs }
  | { name: "delete_file"; args: DeleteFileArgs }
  | { name: "read_file"; args: ReadFileArgs }
  | { name: "list_files"; args: ListFilesArgs }
  | { name: "run_command"; args: RunCommandArgs }
  | { name: "done"; args: DoneArgs };

/**
 * Parse a tool call's arguments JSON string into typed args.
 */
export function parseToolCall(call: ToolCall): ToolArgs | null {
  try {
    // Some providers send empty string for tools with all-optional args (like list_files)
    const rawArgs = call.function.arguments?.trim() || "{}";
    const args = JSON.parse(rawArgs);
    const name = call.function.name;
    log.debug("parseToolCall", "Parsing tool call", { name });
    switch (name) {
      case "create_file":
        if (typeof args.path !== "string" || typeof args.content !== "string") return null;
        return { name, args: { path: args.path, content: args.content } };
      case "apply_diff":
        if (typeof args.path !== "string" || typeof args.diff !== "string") return null;
        return { name, args: { path: args.path, diff: args.diff } };
      case "delete_file":
        if (typeof args.path !== "string") return null;
        return { name, args: { path: args.path } };
      case "read_file":
        if (typeof args.path !== "string") return null;
        return { name, args: { path: args.path } };
      case "list_files":
        return { name, args: { directory: typeof args.directory === "string" ? args.directory : undefined } };
      case "run_command":
        if (typeof args.command !== "string") return null;
        return { name, args: { command: args.command } };
      case "done":
        return { name, args: { summary: typeof args.summary === "string" ? args.summary : "Done" } };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ---- Diff Parser ----

interface DiffBlock {
  search: string;
  replace: string;
}

/**
 * Parse SEARCH/REPLACE diff blocks from the AI's apply_diff argument.
 */
export function parseDiffBlocks(diff: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(diff)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2],
    });
  }
  return blocks;
}

/**
 * Apply SEARCH/REPLACE diff blocks to file content.
 * Returns the modified content, or null if any SEARCH block wasn't found.
 */
export function applyDiffToContent(content: string, diff: string): { result: string; applied: number; failed: string[] } {
  const blocks = parseDiffBlocks(diff);
  let result = content;
  let applied = 0;
  const failed: string[] = [];
  
  for (const block of blocks) {
    if (result.includes(block.search)) {
      // Use split/join instead of String.replace to avoid $-pattern interpretation
      // (e.g. $1, $&) inside the replacement string when the model emits literal
      // dollar signs. We replace only the first occurrence to match the prior
      // semantics; multiple SEARCH blocks should be emitted for multiple sites.
      const idx = result.indexOf(block.search);
      result =
        result.slice(0, idx) +
        block.replace +
        result.slice(idx + block.search.length);
      applied++;
    } else {
      // Try with trimmed whitespace as fallback
      const trimmedSearch = block.search.trim();
      const lines = result.split("\n");
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === trimmedSearch.split("\n")[0]?.trim()) {
          // Attempt multi-line match from this position
          const searchLines = trimmedSearch.split("\n");
          let allMatch = true;
          for (let j = 0; j < searchLines.length && i + j < lines.length; j++) {
            if (lines[i + j].trim() !== searchLines[j].trim()) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            // Replace the matched lines
            const replaceLines = block.replace.split("\n");
            lines.splice(i, searchLines.length, ...replaceLines);
            result = lines.join("\n");
            applied++;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        failed.push(block.search.slice(0, 100) + (block.search.length > 100 ? "..." : ""));
      }
    }
  }
  
  return { result, applied, failed };
}
