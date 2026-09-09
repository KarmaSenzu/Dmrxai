"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  MessageSquare,
  Send,
  Square,
  Loader2,
  Terminal,
  Eye,
  Code2,
  FolderTree,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  XCircle,
  Wrench,
  FileCode,
  FileText,
  FileJson,
  File,
  AlertCircle,
  Sparkles,
  Bot,
  RefreshCw,
  Hammer,
  Search,
  ArrowDown,
  ListChecks,
  Zap,
  CheckSquare,
  Calculator,
  Timer,
  Edit3,
  Palette,
  CreditCard,
  Monitor,
  Tablet,
  Smartphone,
  Play,
  Folder,
  FolderOpen,
  X,
  Download,
  Upload,
} from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import {
  useBuilderSession,
  type AgentToolCall,
} from "@/hooks/useBuilderSession";
import { useAuth } from "./AuthProvider";
import { useSettings } from "@/hooks/useSettings";
import {
  getProjects,
  getProjectData,
  createProject as createLocalProject,
  deleteProject as deleteLocalProject,
  updateProject as updateLocalProject,
  syncFiles as syncLocalFiles,
  setMessages as setLocalMessages,
  addMessage as addLocalMessage,
  deriveTitle,
  loadProjectsFromDB,
  mergeDBIntoLocal,
  syncProjectToDB,
  getFullProjectData,
  getLastOpenedProjectId,
  setLastOpenedProjectId,
  getFiles as getLocalFiles,
  type BuilderProject,
  type BuilderProjectMessage,
} from "@/lib/builder-storage";
import { embedFiles, applyFileChanges } from "@/lib/stackblitz-embed";
import type { VM } from "@stackblitz/sdk";

// ---- Suggestion catalogue ----

interface Suggestion {
  icon: typeof Sparkles;
  title: string;
  description: string;
  prompt: string;
  gradient: string;
}

const SUGGESTIONS: Suggestion[] = [
  { icon: CheckSquare, title: "Todo App", description: "Task list dengan add, edit, dan complete", gradient: "from-violet-500 to-fuchsia-500",
    prompt: "Buatkan todo app sederhana dengan fitur tambah, edit, hapus, dan tandai selesai. Pakai React + Tailwind." },
  { icon: Calculator, title: "Calculator", description: "Kalkulator dengan operasi dasar", gradient: "from-amber-500 to-orange-500",
    prompt: "Buatkan kalkulator dengan operasi tambah, kurang, kali, bagi. Tampilan modern dengan tombol bulat." },
  { icon: Timer, title: "Pomodoro Timer", description: "Timer fokus 25 menit dengan break", gradient: "from-rose-500 to-red-500",
    prompt: "Buatkan pomodoro timer dengan siklus 25 menit kerja dan 5 menit istirahat. Tampilkan progress ring melingkar." },
  { icon: Edit3, title: "Markdown Editor", description: "Editor dengan live preview", gradient: "from-emerald-500 to-teal-500",
    prompt: "Buatkan markdown editor dengan split view: kiri editor, kanan preview real-time." },
  { icon: Palette, title: "Color Palette", description: "Generator palet warna acak", gradient: "from-cyan-500 to-blue-500",
    prompt: "Buatkan color palette generator yang bisa generate 5 warna acak dan copy hex code dengan satu klik." },
  { icon: CreditCard, title: "Pricing Page", description: "Halaman pricing 3 tier", gradient: "from-indigo-500 to-purple-500",
    prompt: "Buatkan pricing page dengan 3 tier (Starter, Pro, Enterprise). Tier tengah ditandai sebagai populer." },
];

// ---- File icon helper ----

function getFileIcon(path: string): typeof FileCode {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jsx" || ext === "tsx" || ext === "js" || ext === "ts") return FileCode;
  if (ext === "json") return FileJson;
  if (ext === "css" || ext === "html" || ext === "md") return FileText;
  return File;
}

// ---- Sub-components ----

function PhasePill({ phase }: { phase: string }) {
  type PhaseCfg = { bg: string; text: string; ring: string; dot: string; label: string; pulse?: boolean; icon?: typeof Loader2 };
  const cfg: Record<string, PhaseCfg> = {
    idle: { bg: "bg-zinc-500/10", text: "text-zinc-500 dark:text-zinc-400", ring: "ring-zinc-500/20", dot: "bg-zinc-500", label: "Siap" },
    thinking: { bg: "bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/30", dot: "bg-violet-500", label: "Berpikir", pulse: true },
    executing: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/30", dot: "bg-amber-500", label: "Eksekusi", icon: Loader2 },
    installing: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/30", dot: "bg-blue-500", label: "Install", icon: Loader2 },
    starting: { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400", ring: "ring-cyan-500/30", dot: "bg-cyan-500", label: "Starting", icon: Loader2 },
    running: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30", dot: "bg-emerald-500", label: "Running", pulse: true },
    done: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30", dot: "bg-emerald-500", label: "Selesai" },
    error: { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/30", dot: "bg-rose-500", label: "Error" },
    sandbox: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/30", dot: "bg-blue-500", label: "Sandbox", icon: Loader2 },
    loading: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/30", dot: "bg-blue-500", label: "Loading", icon: Loader2 },
    saving: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/30", dot: "bg-amber-500", label: "Saving", icon: Loader2 },
    timeout: { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/30", dot: "bg-rose-500", label: "Timeout" },
  };
  const c = cfg[phase] ?? cfg.idle;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ring-1 transition-all duration-200 ${c.bg} ${c.text} ${c.ring}`}>
      {Icon ? (
        <Icon size={10} className="animate-spin" strokeWidth={2.5} />
      ) : c.pulse ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${c.dot}`} />
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${c.dot}`} />
        </span>
      ) : phase === "done" ? (
        <CheckCircle2 size={10} strokeWidth={2.5} />
      ) : phase === "error" || phase === "timeout" ? (
        <AlertCircle size={10} strokeWidth={2.5} />
      ) : (
        <Circle size={10} strokeWidth={2.5} />
      )}
      {c.label}
    </span>
  );
}

function ToolCallCard({ tc }: { tc: AgentToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const iconMap: Record<string, typeof Circle> = {
    create_file: FileCode,
    edit_file: Wrench,
    delete_file: Trash2,
    read_file: Eye,
    list_files: FolderTree,
    run_command: Terminal,
    done: CheckCircle2,
  };
  const Icon = iconMap[tc.name] ?? Circle;

  const label = useMemo(() => {
    if (
      tc.name === "create_file" ||
      tc.name === "edit_file" ||
      tc.name === "delete_file" ||
      tc.name === "read_file"
    ) {
      return (tc.args.path as string) ?? tc.name;
    }
    if (tc.name === "run_command") {
      return (tc.args.command as string) ?? "";
    }
    if (tc.name === "done") {
      return (tc.args.summary as string) ?? "Done";
    }
    return tc.name;
  }, [tc.name, tc.args]);

  const isActive = tc.result === undefined;
  const failed = tc.success === false;

  const borderClass = isActive
    ? "border-light-accent/50 dark:border-dark-accent/50"
    : failed
      ? "border-rose-500/40"
      : "border-light-border dark:border-dark-border";

  return (
    <div className={`rounded-lg border ${borderClass} bg-light-bg dark:bg-dark-bg overflow-hidden transition-all duration-200`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-light-hover/50 dark:hover:bg-dark-hover/50 transition-colors"
      >
        {isActive ? (
          <Loader2 size={12} className="animate-spin text-light-accent dark:text-dark-accent shrink-0" strokeWidth={2.5} />
        ) : failed ? (
          <XCircle size={12} className="text-rose-500 shrink-0" strokeWidth={2.5} />
        ) : (
          <CheckCircle2 size={12} className="text-emerald-500 shrink-0" strokeWidth={2.5} />
        )}
        <Icon size={11} className="text-light-muted dark:text-dark-muted shrink-0" />
        <span className="flex-1 truncate text-[11px] text-light-text dark:text-dark-text font-mono">{label}</span>
        <span className="text-[9px] uppercase tracking-wide text-light-muted dark:text-dark-muted shrink-0 font-semibold">
          {tc.name.replace(/_/g, " ")}
        </span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-light-border/50 dark:border-dark-border/50 bg-light-input/30 dark:bg-dark-input/30">
          {typeof tc.args.content === "string" && tc.args.content.length > 0 ? (
            <details className="mt-1">
              <summary className="text-[9px] uppercase tracking-wide text-light-muted dark:text-dark-muted cursor-pointer font-semibold">
                Content ({tc.args.content.length} chars)
              </summary>
              <pre className="mt-1 text-[10px] font-mono text-light-text dark:text-dark-text whitespace-pre-wrap break-all max-h-40 overflow-auto p-2 bg-light-bg dark:bg-dark-bg rounded">
                {tc.args.content.slice(0, 1000)}{tc.args.content.length > 1000 ? "\n…" : ""}
              </pre>
            </details>
          ) : null}
          {tc.result !== undefined && (
            <details className="mt-1">
              <summary className="text-[9px] uppercase tracking-wide text-light-muted dark:text-dark-muted cursor-pointer font-semibold">Result</summary>
              <pre className="mt-1 text-[10px] font-mono text-light-text dark:text-dark-text whitespace-pre-wrap break-all max-h-40 overflow-auto p-2 bg-light-bg dark:bg-dark-bg rounded">
                {tc.result.slice(0, 1000)}{tc.result.length > 1000 ? "\n…" : ""}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function StepsPanel({ toolCalls, isRunning }: { toolCalls: AgentToolCall[]; isRunning: boolean }) {
  if (toolCalls.length === 0) return null;
  const completed = toolCalls.filter((tc) => tc.result !== undefined).length;
  return (
    <div className="mt-2 rounded-xl border border-light-border dark:border-dark-border bg-light-input/40 dark:bg-dark-input/40 overflow-hidden">
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-light-border/50 dark:border-dark-border/50 bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5">
        <ListChecks size={11} className="text-light-muted dark:text-dark-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-light-muted dark:text-dark-muted">Steps</span>
        <span className="ml-auto text-[10px] font-mono text-light-muted dark:text-dark-muted">
          {completed}/{toolCalls.length}
          {isRunning && <Loader2 size={9} className="inline ml-1 animate-spin" />}
        </span>
      </div>
      <div className="p-1.5 space-y-1">
        {toolCalls.map((tc) => <ToolCallCard key={tc.id} tc={tc} />)}
      </div>
    </div>
  );
}

// ---- File tree helpers ----

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "folder", children: [] };

  for (const originalPath of paths.sort()) {
    const parts = originalPath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      // Files keep their original path (so key into localFiles works regardless
      // of leading slash). Folders get a synthetic joined path used only for
      // expand/collapse identity.
      const fullPath = isLast
        ? originalPath
        : "__dir:" + parts.slice(0, i + 1).join("/");

      if (!current.children) current.children = [];
      let node = current.children.find((n) => n.name === part);

      if (!node) {
        node = {
          name: part,
          path: fullPath,
          type: isLast ? "file" : "folder",
          children: isLast ? undefined : [],
        };
        current.children.push(node);
      }
      current = node;
    }
  }

  // Sort: folders first, then files, alphabetical
  function sortNode(node: TreeNode) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  }
  sortNode(root);

  return root.children ?? [];
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "tsx":
    case "ts":
      return "tsx";
    case "jsx":
    case "js":
    case "mjs":
    case "cjs":
      return "jsx";
    case "json":
      return "json";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "html":
      return "markup";
    case "md":
    case "mdx":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
    case "bash":
      return "bash";
    default:
      return "tsx";
  }
}

// VS Code-style accent color per file type. The code panel chrome is always
// dark (zinc-900/950) regardless of app theme, so these are fixed light-on-dark
// Tailwind classes — not theme-aware — to stay readable in both light & dark.
function fileNameColor(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  switch (ext) {
    case "tsx":
    case "jsx":
      return "text-cyan-300";
    case "ts":
    case "mts":
    case "cts":
      return "text-blue-300";
    case "js":
    case "mjs":
    case "cjs":
      return "text-yellow-200";
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "text-pink-300";
    case "html":
    case "htm":
      return "text-orange-300";
    case "json":
      return "text-amber-300";
    case "md":
    case "mdx":
      return "text-zinc-300";
    case "svg":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "text-purple-300";
    case "env":
      return "text-emerald-300";
    default:
      return "text-zinc-200";
  }
}

function TreeNodeRenderer({
  node,
  depth = 0,
  expandedFolders,
  toggleFolder,
  activeFile,
  onFileClick,
}: {
  node: TreeNode;
  depth?: number;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  activeFile: string | null;
  onFileClick: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeFile === node.path;
  const Icon =
    node.type === "folder" ? (isExpanded ? FolderOpen : Folder) : FileCode;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (node.type === "folder") toggleFolder(node.path);
          else onFileClick(node.path);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs rounded transition ${
          isActive
            ? "bg-violet-500/25 text-white"
            : "hover:bg-zinc-700/50 text-zinc-200"
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.type === "folder" ? (
          <ChevronRight
            size={10}
            className={`shrink-0 transition-transform text-zinc-400 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <Icon
          size={12}
          className={`shrink-0 ${
            node.type === "folder" ? "text-sky-400" : fileNameColor(node.name)
          }`}
        />
        <span
          className={`truncate font-mono ${
            isActive
              ? "text-white"
              : node.type === "folder"
                ? "text-zinc-100"
                : fileNameColor(node.name)
          }`}
        >
          {node.name}
        </span>
      </button>
      {node.type === "folder" &&
        isExpanded &&
        node.children?.map((child) => (
          <TreeNodeRenderer
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            activeFile={activeFile}
            onFileClick={onFileClick}
          />
        ))}
    </>
  );
}

function CodeViewer({ code, language }: { code: string; language: string }) {
  return (
    <Highlight code={code} language={language} theme={themes.vsDark}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={className + " text-[12px] font-mono leading-relaxed"}
          style={{ ...style, padding: 0, margin: 0, background: "transparent" }}
        >
          {tokens.map((line, i) => {
            const { key: _lineKey, ...lineProps } = getLineProps({ line });
            return (
              <div
                key={i}
                {...lineProps}
                className="flex hover:bg-white/[0.02]"
              >
                <span className="select-none w-12 shrink-0 pr-3 text-right text-zinc-600 border-r border-zinc-800 mr-3 leading-relaxed">
                  {i + 1}
                </span>
                <span className="flex-1 pr-4">
                  {line.map((token, j) => {
                    const { key: _tokenKey, ...tokenProps } = getTokenProps({
                      token,
                    });
                    return <span key={j} {...tokenProps} />;
                  })}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}

// ---- Helper: extract plan JSON from assistant message ----

function extractPlanJson(content: string): Record<string, unknown> | null {
  const match = content.match(/```json\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === "object" && parsed.ready_to_build) return parsed;
    return null;
  } catch {
    return null;
  }
}

// ---- Main Component ----

export default function BuilderWorkspaceE2B() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useSettings();
  const session = useBuilderSession({ userId });
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [rightTab, setRightTab] = useState<"preview" | "code" | "terminal">("preview");
  const [prompt, setPrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // ---- StackBlitz preview state ----
  // The preview is a StackBlitz embed: `embedFiles` REPLACES the container div
  // with a StackBlitz iframe and returns a VM handle. Subsequent file updates
  // are pushed incrementally via `applyFileChanges`. Only ONE container is
  // rendered at a time (the active viewport's) because the ref is shared and
  // StackBlitz mutates the element it mounts into.
  const sbContainerRef = useRef<HTMLDivElement | null>(null);
  const sbVmRef = useRef<VM | null>(null);
  const sbPrevFilesRef = useRef<Record<string, string>>({});
  const isEmbeddingRef = useRef(false);
  const [sbStatus, setSbStatus] = useState<"idle" | "embedding" | "ready" | "error">("idle");
  // Bumped by the "Coba lagi" retry button to force the embed effect to re-run.
  const [sbRetry, setSbRetry] = useState(0);

  // VSCode-style code editor state
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Per-project mode preference (auto = let server detect, plan = architect, build = code).
  // Stored on BuilderProject so it persists across reloads + DB sync.
  const [preferredMode, setPreferredMode] = useState<"auto" | "architect" | "code">("auto");

  // Per-project model override. Empty string falls back to user-default model
  // from settings. Loaded from BuilderProject on mount/select.
  const [projectModel, setProjectModel] = useState<string>("");

  // Available models fetched from /api/models on mount. Drives the model picker.
  const [availableModels, setAvailableModels] = useState<Array<{ id: string }>>([]);

  // Debounce timer for sync-to-DB so we don't spam Supabase on every keystroke.
  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDBSync = useCallback(
    (projectId: string) => {
      if (!userId) return;
      if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
      dbSyncTimerRef.current = setTimeout(() => {
        const data = getFullProjectData(projectId);
        if (!data) return;
        void syncProjectToDB(
          userId,
          data.project,
          data.messages,
          data.files,
        ).catch(() => {});
      }, 1000);
    },
    [userId],
  );

  // ---- Effects ----

  useEffect(() => {
    const saved = localStorage.getItem("dmrxai:builder:viewport");
    if (saved === "desktop" || saved === "tablet" || saved === "mobile") {
      setViewport(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dmrxai:builder:viewport", viewport);
  }, [viewport]);

  useEffect(() => {
    const initialProjects = getProjects();
    setProjects(initialProjects);

    // Auto-restore last opened project on mount so refresh resumes the
    // user's previous workspace instead of dropping them into the empty hero.
    const lastId = getLastOpenedProjectId();
    if (lastId && initialProjects.some((p) => p.id === lastId)) {
      session.reset();
      session.setProjectId(lastId);
      setPrompt("");

      const data = getProjectData(lastId);
      if (data) {
        setLocalFiles(data.files);
        // Restore per-project mode + model on auto-resume.
        setPreferredMode(data.project.preferredMode ?? "auto");
        setProjectModel(data.project.model ?? "");
        session.loadHistory({
          messages: data.messages,
          files: Object.entries(data.files).map(([path, content]) => ({ path, content })),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the catalogue of models from the server once on mount. Drives the
  // per-project model picker. Failure is non-fatal — we fall back to whatever
  // the user has set as their default model.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data?.data)) {
          setAvailableModels(
            data.data
              .map((m: { id?: string }) => ({ id: typeof m?.id === "string" ? m.id : "" }))
              .filter((m: { id: string }) => m.id.length > 0),
          );
        }
      } catch (e) {
        console.warn("[BUILDER] Failed to load models:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate from Supabase once we know the user. DB is treated as the
  // authoritative source: we merge DB rows into local cache so the sidebar
  // shows projects created on other devices, then refresh the visible list.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const dbProjects = await loadProjectsFromDB(userId);
        if (cancelled) return;
        if (dbProjects.length > 0) {
          mergeDBIntoLocal(dbProjects);
        }
        setProjects(getProjects());
      } catch {
        // Non-fatal — keep showing local cache.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.terminalLogs]);

  useEffect(() => {
    for (const tc of session.toolCalls) {
      if (
        (tc.name === "create_file" || tc.name === "edit_file") &&
        tc.success === true &&
        tc.args.path &&
        tc.args.content
      ) {
        setLocalFiles((prev) => ({
          ...prev,
          [tc.args.path as string]: tc.args.content as string,
        }));
      }
    }
  }, [session.toolCalls]);

  // Auto-switch to the preview tab when a run finishes. StackBlitz drives the
  // live preview now, so the switch only depends on the run phase.
  useEffect(() => {
    if (session.phase === "done") {
      setRightTab("preview");
    }
  }, [session.phase]);

  // Auto-select first file when files appear (legacy + new editor).
  // Guarded by a ref so we only seed selection once per project lifecycle —
  // prevents an effect-loop if downstream state updates retrigger this effect.
  // The guard resets whenever the active project changes so a freshly opened
  // project gets its own seeding pass.
  const fileSelectionInitRef = useRef(false);
  useEffect(() => {
    fileSelectionInitRef.current = false;
  }, [session.projectId]);
  useEffect(() => {
    if (fileSelectionInitRef.current) return;
    const files = Object.keys(localFiles);
    if (files.length === 0) return;
    if (!selectedFile) setSelectedFile(files[0]);
    if (!activeFile) {
      setActiveFile(files[0]);
      setOpenFiles((prev) => (prev.includes(files[0]) ? prev : [...prev, files[0]]));
    }
    fileSelectionInitRef.current = true;
  }, [localFiles, selectedFile, activeFile]);

  // ---- StackBlitz embed effect ----
  // Mounts (or incrementally updates) the StackBlitz preview whenever the
  // active project's file map changes. We key off `filesVersion` (bumped by the
  // session hook on every file-map change), the active project, and the run
  // phase. `rightTab` is included so the embed runs once the preview tab (and
  // thus the container div) actually mounts. There must be a `/package.json`
  // for there to be anything to preview.
  useEffect(() => {
    const pid = session.projectId;
    if (!pid) {
      setSbStatus("idle");
      return;
    }
    const container = sbContainerRef.current;
    if (!container) return;

    const files = getLocalFiles(pid);
    // Nothing to preview until a package.json exists.
    if (!files["/package.json"]) {
      setSbStatus("idle");
      return;
    }

    // Guard against overlapping embeds (embedProject is async).
    if (isEmbeddingRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        if (!sbVmRef.current) {
          // First embed for this project: replace the container with the iframe.
          isEmbeddingRef.current = true;
          setSbStatus("embedding");
          const vm = await embedFiles({
            element: container,
            files,
            title: "Generated App",
            openFile: "src/App.tsx",
            view: "preview",
            hideExplorer: true,
          });
          if (cancelled) return;
          sbVmRef.current = vm;
          sbPrevFilesRef.current = files;
          setSbStatus("ready");
        } else {
          // Already embedded: push the incremental diff.
          await applyFileChanges(sbVmRef.current, sbPrevFilesRef.current, files);
          if (cancelled) return;
          sbPrevFilesRef.current = files;
          setSbStatus("ready");
        }
      } catch (e) {
        console.error("[BUILDER] StackBlitz preview failed:", e);
        if (cancelled) return;
        // The embed may be stale — drop it so the next run re-embeds cleanly.
        sbVmRef.current = null;
        setSbStatus("error");
      } finally {
        isEmbeddingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.filesVersion, session.projectId, session.phase, sbRetry, rightTab]);

  // Terminal scroll detection
  const handleTerminalScroll = useCallback(() => {
    const el = terminalScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setShowScrollDown(!atBottom);
  }, []);

  const scrollTerminalToBottom = useCallback(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ---- Handlers ----

  const handleSend = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || session.isRunning) return;
    setPrompt("");

    let pid = session.projectId;
    if (!pid) {
      const proj = createLocalProject(trimmed.slice(0, 50));
      pid = proj.id;
      session.setProjectId(pid);
      setProjects(getProjects());
      // Persist current mode + model picks onto the freshly-minted project.
      updateLocalProject(pid, {
        preferredMode,
        ...(projectModel ? { model: projectModel } : {}),
      });
      // Record this as the last-opened project so a refresh restores it.
      // Without this, projects created on the very first prompt are never
      // pointed to by getLastOpenedProjectId(), so the mount auto-restore
      // can't reopen them and the chat/files appear "lost" after reload.
      setLastOpenedProjectId(pid);
      if (userId) scheduleDBSync(pid);
    }

    // "auto" → don't send a mode override; let the server auto-detect.
    const overrideMode = preferredMode === "auto" ? undefined : preferredMode;
    await session.send(trimmed, pid, overrideMode, projectModel || undefined);
  }, [prompt, session, preferredMode, projectModel, userId, scheduleDBSync]);

  const handleNewProject = useCallback(() => {
    // Defensive: if a run is in flight, abort it before swapping projects
    // so the SSE handlers stop writing into the old project's storage.
    // session.reset() also calls abort, but doing it explicitly here makes
    // the ordering obvious.
    if (session.isRunning) {
      session.abort();
    }
    const proj = createLocalProject("New Project");
    setProjects(getProjects());
    session.reset();
    session.setProjectId(proj.id);
    setLocalFiles({});
    setSelectedFile(null);
    setOpenFiles([]);
    setActiveFile(null);
    setPrompt("");
    setPreferredMode("auto");
    setProjectModel(settings.model ?? "");
    // Reset the StackBlitz embed so the next project mounts fresh.
    sbVmRef.current = null;
    sbPrevFilesRef.current = {};
    setSbStatus("idle");
    setLastOpenedProjectId(proj.id);
    if (userId) scheduleDBSync(proj.id);
  }, [session, userId, scheduleDBSync, settings.model]);

  const handleDeleteProject = useCallback(
    (id: string) => {
      // TODO(ux): replace native confirm() with a state-based modal so we
      // don't block the main thread. Tracked separately from the security
      // pass to keep this change focused.
      if (!confirm("Hapus project ini?")) return;
      deleteLocalProject(id);
      setProjects(getProjects());
      if (session.projectId === id) {
        session.reset();
        setLocalFiles({});
        setSelectedFile(null);
        setOpenFiles([]);
        setActiveFile(null);
        // Tear down the StackBlitz embed tied to the removed project.
        sbVmRef.current = null;
        sbPrevFilesRef.current = {};
        setSbStatus("idle");
      }
      // Clear the last-opened pointer if we just removed it, so refresh
      // doesn't try to restore a project that no longer exists.
      if (getLastOpenedProjectId() === id) {
        setLastOpenedProjectId(null);
      }
      // Mirror delete to Supabase. Best-effort; failures stay in console.
      if (userId) {
        void (async () => {
          try {
            const supabase = (await import("@/lib/supabase-browser")).getSupabaseBrowser();
            await supabase.from("projects").delete().eq("id", id).eq("user_id", userId);
          } catch (e) {
            console.error("[BUILDER] DB delete failed:", e);
          }
        })();
      }
    },
    [session, userId],
  );

  const handleExport = useCallback(() => {
    const pid = session.projectId;
    if (!pid) return;
    // Trigger a browser download of the project's .zip via the export endpoint.
    window.location.href = `/api/builder/projects/${pid}/export`;
  }, [session.projectId]);

  const handleSelectProject = useCallback(
    (id: string) => {
      console.log("[WS] handleSelectProject:", id);
      // Defensive: abort in-flight stream so the previous run's SSE
      // handlers stop firing before we swap projects.
      if (session.isRunning) {
        session.abort();
      }
      session.reset();
      session.setProjectId(id);
      setPrompt("");
      setSelectedFile(null);
      setOpenFiles([]);
      setActiveFile(null);
      setLocalFiles({});
      setLastOpenedProjectId(id);
      // Reset the StackBlitz embed so the new project re-mounts fresh. The
      // container div carries key={session.projectId}, so React remounts a
      // pristine div for the new project and the embed effect re-runs.
      sbVmRef.current = null;
      sbPrevFilesRef.current = {};
      setSbStatus("idle");

      const data = getProjectData(id);
      if (data) {
        // Build localFiles map from storage
        setLocalFiles(data.files);

        // Restore per-project mode + model preferences.
        setPreferredMode(data.project.preferredMode ?? "auto");
        setProjectModel(data.project.model ?? settings.model ?? "");

        // Only hydrate messages + files; the StackBlitz embed effect rebuilds
        // the live preview from the restored file map.
        session.loadHistory({
          messages: data.messages,
          files: Object.entries(data.files).map(([path, content]) => ({ path, content })),
        });

        console.log("[WS] Loaded project:", data.messages.length, "messages,", Object.keys(data.files).length, "files");
      } else {
        setPreferredMode("auto");
        setProjectModel(settings.model ?? "");
      }
    },
    [session, settings.model],
  );

  const handleImport = useCallback(() => {
    // Open a hidden file input for .zip upload.
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/builder/projects/import", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Import failed" }));
          alert(`Import gagal: ${(err as { error?: string }).error || "unknown"}`);
          return;
        }
        const data = (await res.json()) as { project?: { id: string } };
        if (data.project?.id) {
          // Refresh project list + open the imported project.
          setProjects(getProjects());
          handleSelectProject(data.project.id);
        }
      } catch (e) {
        console.error("[BUILDER] import failed:", e);
        alert("Import gagal.");
      }
    };
    input.click();
  }, [handleSelectProject]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, []);

  const handleSuggestion = useCallback((s: Suggestion) => {
    setPrompt(s.prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      handleTextareaInput();
    });
  }, [handleTextareaInput]);

  // Retry handler for a failed StackBlitz embed: drop the (stale) VM and bump
  // a counter so the embed effect re-runs from scratch.
  const handleRetryPreview = useCallback(() => {
    sbVmRef.current = null;
    sbPrevFilesRef.current = {};
    setSbStatus("idle");
    setSbRetry((n) => n + 1);
  }, []);

  const fileList = useMemo(() => Object.keys(localFiles).sort(), [localFiles]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const showEmptyHero =
    session.messages.length === 0 && !session.isRunning && !session.error;

  // ---- Render ----

  return (
    <div className="flex h-screen w-full bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text overflow-hidden font-sans">
      {/* ===== Left Panel: Projects Sidebar ===== */}
      <aside
        className={`${
          showSidebar ? "w-[240px]" : "w-0"
        } shrink-0 flex flex-col border-r border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar transition-[width] duration-300 ease-out overflow-hidden`}
      >
        <div className="w-[240px] flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm">
                <Hammer size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xs font-bold tracking-tight">Builder</span>
            </div>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-1 rounded-md hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted transition-colors"
              title="Tutup sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          {/* New Project Button */}
          <div className="px-3 pb-2">
            <button
              onClick={handleNewProject}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-sm hover:shadow transition-all duration-200"
            >
              <Plus size={13} strokeWidth={2.5} />
              New Project
            </button>
          </div>

          {/* Export / Import */}
          <div className="px-3 pb-2 flex gap-1.5">
            <button
              onClick={handleExport}
              disabled={!session.projectId}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-light-text dark:text-dark-text bg-light-input dark:bg-dark-input border border-light-border/50 dark:border-dark-border/50 hover:bg-light-hover dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={12} />
              Export
            </button>
            <button
              onClick={handleImport}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-light-text dark:text-dark-text bg-light-input dark:bg-dark-input border border-light-border/50 dark:border-dark-border/50 hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
            >
              <Upload size={12} />
              Import
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted pointer-events-none"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari project…"
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-light-input dark:bg-dark-input border border-light-border/50 dark:border-dark-border/50 text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted outline-none focus:border-light-accent/50 dark:focus:border-dark-accent/50 transition-colors"
              />
            </div>
          </div>

          {/* Projects label */}
          <div className="px-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-light-muted dark:text-dark-muted">
              Projects {projects.length > 0 && `(${projects.length})`}
            </span>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredProjects.length === 0 ? (
              <div className="px-2 py-8 text-center text-[11px] text-light-muted dark:text-dark-muted">
                {projects.length === 0 ? "Belum ada project" : "Tidak ada hasil"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredProjects.map((proj) => {
                  const active = session.projectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => handleSelectProject(proj.id)}
                      className={`group relative flex items-center gap-2 pl-2.5 pr-1 py-1.5 rounded-md cursor-pointer transition-all duration-200 ${active ? "bg-light-hover dark:bg-dark-hover" : "hover:bg-light-hover/60 dark:hover:bg-dark-hover/60"}`}
                    >
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500" />}
                      <MessageSquare size={11} className={`shrink-0 ${active ? "text-light-accent dark:text-dark-accent" : "text-light-muted dark:text-dark-muted"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[11px] font-medium text-light-text dark:text-dark-text">{proj.title}</div>
                        <div className="text-[9px] text-light-muted dark:text-dark-muted">
                          {new Date(proj.updatedAt).toLocaleDateString("id", { day: "numeric", month: "short" })}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-light-muted dark:text-dark-muted hover:text-rose-500 transition-all duration-150"
                        title="Hapus"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Sidebar expand button (when collapsed) */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="shrink-0 flex items-center justify-center w-6 border-r border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted transition-colors"
          title="Buka sidebar"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* ===== Middle Panel: Chat + Activity ===== */}
      <section className="w-[420px] shrink-0 flex flex-col border-r border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2 flex-1">
            <Sparkles size={14} className="text-violet-500 dark:text-violet-400" strokeWidth={2.5} />
            <h2 className="text-sm font-semibold tracking-tight">App Builder</h2>
          </div>
          <PhasePill phase={session.phase} />
          {session.agentMode && (
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
              session.agentMode === "architect" ? "bg-violet-500/15 text-violet-500" :
              session.agentMode === "code" ? "bg-emerald-500/15 text-emerald-500" :
              "bg-rose-500/15 text-rose-500"
            }`}>
              {session.agentMode}
            </span>
          )}
        </div>

        {/* Messages / Empty Hero */}
        <div className="flex-1 overflow-y-auto">
          {showEmptyHero ? (
            <div className="min-h-full flex flex-col items-center justify-center px-5 py-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20 mb-4">
                <Hammer size={26} className="text-white" strokeWidth={2.2} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">
                App Builder
              </h1>
              <p className="text-xs text-light-muted dark:text-dark-muted text-center max-w-[280px] mb-5">
                Tulis ide-mu, dmrxai akan bangun aplikasinya
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.title}
                    onClick={() => handleSuggestion(s)}
                    className="group text-left p-2.5 rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg hover:bg-light-hover dark:hover:bg-dark-hover hover:-translate-y-0.5 hover:shadow-md hover:border-light-accent/30 dark:hover:border-dark-accent/30 transition-all duration-200"
                  >
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-1.5 shadow-sm`}>
                      <Icon size={14} className="text-white" strokeWidth={2.2} />
                    </div>
                    <div className="text-[11px] font-semibold text-light-text dark:text-dark-text mb-0.5">{s.title}</div>
                    <div className="text-[10px] text-light-muted dark:text-dark-muted leading-tight line-clamp-2">{s.description}</div>
                  </button>
                );
              })}
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 space-y-3">
              {session.messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-sm bg-light-input dark:bg-dark-input ring-1 ring-light-border/40 dark:ring-dark-border/40 text-sm text-light-text dark:text-dark-text whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    </div>
                  ) : msg.role === "assistant" ? (
                    <div className="flex gap-2.5">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-violet-500/20 mt-0.5">
                        <Bot size={14} className="text-white" strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        {msg.isThinking && !msg.content && (
                          <div className="flex items-center gap-1.5 text-xs text-light-muted dark:text-dark-muted py-1">
                            <Loader2 size={12} className="animate-spin" />
                            <span>Berpikir…</span>
                          </div>
                        )}
                        {msg.content && (
                          // Safe: React auto-escapes interpolated strings, so
                          // assistant-supplied content cannot inject markup.
                          // If we later swap to a markdown renderer that allows
                          // raw HTML, sanitize with DOMPurify before rendering.
                          <div className="text-sm text-light-text dark:text-dark-text whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        )}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <StepsPanel toolCalls={msg.toolCalls} isRunning={false} />
                        )}
                        {/* Build App button for architect plan */}
                        {(() => {
                          const plan = extractPlanJson(msg.content);
                          if (plan && plan.ready_to_build && !session.isRunning) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (session.projectId) {
                                    session.send("Mulai build sesuai plan di atas. Eksekusi semua todos.", session.projectId, "code");
                                  }
                                }}
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-medium shadow-lg shadow-emerald-500/25 transition-all"
                              >
                                <Play size={14} />
                                Build App
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}

              {/* Live tool calls */}
              {session.isRunning && session.toolCalls.length > 0 && (
                <div className="flex gap-2.5">
                  <div className="shrink-0 w-7" />
                  <div className="flex-1 min-w-0">
                    <StepsPanel toolCalls={session.toolCalls} isRunning={session.isRunning} />
                  </div>
                </div>
              )}

              {session.error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-rose-600 dark:text-rose-400 break-words">{session.error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-3 py-3 border-t border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg">
          {/* Mode + Model row — small controls above the textarea so the
              user picks intent before typing. Persisted per-project. */}
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border/50 dark:border-dark-border/50">
              {([
                { val: "auto", label: "Auto" },
                { val: "architect", label: "Plan" },
                { val: "code", label: "Build" },
              ] as const).map((opt) => {
                const active = preferredMode === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => {
                      setPreferredMode(opt.val);
                      if (session.projectId) {
                        updateLocalProject(session.projectId, {
                          preferredMode: opt.val,
                        });
                      }
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                      active
                        ? "bg-violet-500 text-white shadow-sm"
                        : "text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
                    }`}
                    title={
                      opt.val === "auto"
                        ? "Server auto-detects mode"
                        : opt.val === "architect"
                          ? "Force planning mode"
                          : "Force build/code mode"
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <select
              value={projectModel || settings.model || ""}
              onChange={(e) => {
                const newModel = e.target.value;
                setProjectModel(newModel);
                if (session.projectId) {
                  updateLocalProject(session.projectId, { model: newModel });
                }
              }}
              className="text-[11px] px-2 py-1 rounded-md border border-light-border/50 dark:border-dark-border/50 bg-light-input dark:bg-dark-input text-light-text dark:text-dark-text max-w-[200px] truncate outline-none focus:border-light-accent/50 dark:focus:border-dark-accent/50"
              title="Model untuk project ini"
            >
              {availableModels.length === 0 ? (
                <option value={settings.model || ""}>
                  {settings.model || "Default"}
                </option>
              ) : (
                availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-end gap-2 rounded-2xl border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input px-3 py-2 shadow-sm focus-within:border-light-accent/50 dark:focus-within:border-dark-accent/50 focus-within:ring-2 focus-within:ring-violet-500/10 transition-all duration-200">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onInput={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Deskripsikan app yang ingin dibuat…"
              disabled={session.isRunning}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted outline-none max-h-[160px] disabled:opacity-60"
            />
            {session.isRunning ? (
              <button
                onClick={() => session.abort()}
                className="shrink-0 p-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white shadow-sm transition-all duration-150"
                title="Stop"
              >
                <Square size={13} strokeWidth={2.5} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!prompt.trim()}
                className="shrink-0 p-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:from-violet-600 hover:to-fuchsia-600 shadow-sm hover:shadow transition-all duration-150"
                title="Send"
              >
                <Send size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-light-muted dark:text-dark-muted">
            <kbd className="px-1 py-px rounded bg-light-input dark:bg-dark-input border border-light-border/60 dark:border-dark-border/60 font-mono text-[9px]">
              Enter
            </kbd>
            untuk kirim
            <span className="mx-0.5">·</span>
            <kbd className="px-1 py-px rounded bg-light-input dark:bg-dark-input border border-light-border/60 dark:border-dark-border/60 font-mono text-[9px]">
              Shift+Enter
            </kbd>
            baris baru
          </div>
        </div>
      </section>

      {/* ===== Right Panel: Preview / Code / Terminal ===== */}
      <section className="flex-1 flex flex-col min-w-0 bg-light-sidebar dark:bg-dark-sidebar">
        {/* Tab bar - segmented control */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-light-border dark:border-dark-border">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-light-input dark:bg-dark-input ring-1 ring-light-border/40 dark:ring-dark-border/40">
            {([
              { id: "preview", label: "Preview", Icon: Eye },
              { id: "code", label: "Code", Icon: Code2 },
              { id: "terminal", label: "Terminal", Icon: Terminal },
            ] as const).map((tab) => {
              const active = rightTab === tab.id;
              const Icon = tab.Icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                    active
                      ? "bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text shadow-sm ring-1 ring-light-border/40 dark:ring-dark-border/40"
                      : "text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
                  }`}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right side toolbar */}
          <div className="flex items-center gap-1.5">
            {rightTab === "preview" && (
              <>
                {/* Viewport toggle */}
                <div className="flex items-center gap-0.5 bg-light-input dark:bg-dark-input rounded-md p-0.5">
                  {(["desktop", "tablet", "mobile"] as const).map((vp) => {
                    const Icon = vp === "desktop" ? Monitor : vp === "tablet" ? Tablet : Smartphone;
                    const active = viewport === vp;
                    return (
                      <button
                        key={vp}
                        type="button"
                        onClick={() => setViewport(vp)}
                        className={`flex items-center justify-center w-7 h-7 rounded transition ${
                          active
                            ? "bg-light-bg dark:bg-dark-bg text-light-accent dark:text-dark-accent shadow-sm"
                            : "text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
                        }`}
                        aria-label={vp}
                        title={vp[0].toUpperCase() + vp.slice(1)}
                      >
                        <Icon size={13} />
                      </button>
                    );
                  })}
                </div>
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-light-input dark:bg-dark-input ring-1 ring-light-border/40 dark:ring-dark-border/40">
                  <span className="text-[10px] font-mono text-light-muted dark:text-dark-muted">
                    Preview
                  </span>
                </div>
                <button
                  onClick={handleRetryPreview}
                  className="p-1.5 rounded-md hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
                  title="Refresh preview"
                >
                  <RefreshCw size={12} />
                </button>
              </>
            )}
            {rightTab === "code" && fileList.length > 0 && (
              <span className="text-[10px] font-mono text-light-muted dark:text-dark-muted">
                {fileList.length} file{fileList.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden bg-light-bg dark:bg-dark-bg">
          {/* Preview Tab */}
          {rightTab === "preview" && (
            <div className="w-full h-full flex items-center justify-center overflow-auto bg-light-bg/50 dark:bg-dark-bg/50 p-4">
              {/* Single preview surface. The outer wrapper changes width/aspect
                  per viewport (desktop = full, tablet ≈ 820px, mobile ≈ 390px);
                  StackBlitz replaces the inner container div with its live
                  iframe. We keep ONE shared ref/container so the embed survives
                  viewport switches. */}
              <div
                className={`relative bg-white shadow-xl transition-all duration-300 overflow-hidden ${
                  viewport === "mobile"
                    ? "rounded-[44px] border-[12px] border-zinc-900 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
                    : viewport === "tablet"
                      ? "rounded-2xl border-4 border-zinc-700"
                      : "rounded-lg"
                }`}
                style={{
                  width: viewport === "mobile" ? 390 : viewport === "tablet" ? 820 : "100%",
                  height: viewport === "mobile" ? 844 : viewport === "tablet" ? 1024 : "100%",
                  maxWidth: "100%",
                  maxHeight: "100%",
                }}
              >
                {/* Sandbox preview (server-driven): when the server emits a
                    preview_ready URL (wildcard subdomain), render it in an
                    iframe instead of the StackBlitz embed. This is the target
                    architecture; StackBlitz remains as fallback below. */}
                {session.previewUrl ? (
                  <iframe
                    key={session.previewUrl}
                    src={session.previewUrl}
                    title="App preview"
                    className="absolute inset-0 w-full h-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                ) : session.isRunning ? (
                  // Agent is still building — show a clear "preparing" state
                  // instead of the blank StackBlitz surface.
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-light-bg dark:bg-dark-bg text-light-muted dark:text-dark-muted px-6 z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 ring-1 ring-light-border/40 dark:ring-dark-border/40 flex items-center justify-center mb-3">
                      <Loader2 size={28} className="text-blue-500 dark:text-cyan-400 animate-spin" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-light-text dark:text-dark-text mb-1">Menyiapkan preview…</p>
                    <p className="text-xs opacity-70 text-center max-w-[280px]">
                      AI sedang membangun aplikasi. Preview akan muncul otomatis setelah selesai.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* StackBlitz mount surface — embedFiles() REPLACES this div
                        with the live preview iframe. Keyed by projectId so React
                        remounts a fresh div (and the embed effect re-runs) whenever
                        the active project changes. Kept as the first, stable child
                        so React never reconciles the StackBlitz-managed node. */}
                    <div
                      key={session.projectId ?? "no-project"}
                      ref={sbContainerRef}
                      className="absolute inset-0 w-full h-full"
                    />

                    {/* Status overlays — always rendered AFTER the mount surface so
                        the container keeps a stable position in the child list. */}
                    {sbStatus === "embedding" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-light-bg dark:bg-dark-bg z-10">
                        <div className="w-full max-w-md px-6 space-y-3">
                          <div className="h-8 rounded-lg bg-gradient-to-r from-light-input via-light-hover to-light-input dark:from-dark-input dark:via-dark-hover dark:to-dark-input bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
                          <div className="h-32 rounded-lg bg-gradient-to-r from-light-input via-light-hover to-light-input dark:from-dark-input dark:via-dark-hover dark:to-dark-input bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
                          <div className="h-4 w-3/4 rounded-lg bg-gradient-to-r from-light-input via-light-hover to-light-input dark:from-dark-input dark:via-dark-hover dark:to-dark-input bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
                          <div className="h-4 w-1/2 rounded-lg bg-gradient-to-r from-light-input via-light-hover to-light-input dark:from-dark-input dark:via-dark-hover dark:to-dark-input bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-light-muted dark:text-dark-muted">
                          <Loader2 size={11} className="animate-spin" />
                          Memuat preview…
                        </div>
                        <style jsx>{`
                          @keyframes shimmer {
                            0% { background-position: 200% 0; }
                            100% { background-position: -200% 0; }
                          }
                        `}</style>
                      </div>
                    )}

                    {sbStatus === "error" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-light-bg dark:bg-dark-bg text-light-muted dark:text-dark-muted px-6 z-10">
                        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 ring-1 ring-rose-500/30 flex items-center justify-center mb-3">
                          <AlertCircle size={28} className="text-rose-500" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-medium text-light-text dark:text-dark-text mb-1">
                          Preview gagal dimuat
                        </p>
                        <p className="text-xs opacity-70 text-center max-w-[280px] mb-4">
                          Terjadi kesalahan saat menyiapkan preview StackBlitz.
                        </p>
                        <button
                          type="button"
                          onClick={handleRetryPreview}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-sm transition-all"
                        >
                          <RefreshCw size={12} />
                          Coba lagi
                        </button>
                      </div>
                    )}

                    {sbStatus === "idle" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-light-bg dark:bg-dark-bg text-light-muted dark:text-dark-muted px-6 z-10">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 ring-1 ring-light-border/40 dark:ring-dark-border/40 flex items-center justify-center mb-3">
                          <Eye size={28} className="text-light-muted dark:text-dark-muted" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-medium text-light-text dark:text-dark-text mb-1">Preview belum tersedia</p>
                        <p className="text-xs opacity-70 text-center max-w-[280px]">
                          Mulai bangun app dari panel chat.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Code Tab */}
          {rightTab === "code" && (
            <div className="flex flex-col h-full bg-zinc-950">
              {/* Tab bar — open files */}
              {openFiles.length > 0 && (
                <div className="flex items-center bg-zinc-900 border-b border-zinc-800 overflow-x-auto custom-scrollbar">
                  {openFiles.map((path) => {
                    const filename = path.split("/").pop() ?? path;
                    const isActive = activeFile === path;
                    return (
                      <div
                        key={path}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-zinc-800 cursor-pointer ${
                          isActive
                            ? "bg-zinc-950"
                            : "bg-zinc-900 hover:bg-zinc-800/60"
                        }`}
                        onClick={() => setActiveFile(path)}
                      >
                        <FileCode
                          size={11}
                          className={`shrink-0 ${fileNameColor(filename)}`}
                        />
                        <span
                          className={`font-mono whitespace-nowrap ${
                            isActive ? "text-white" : fileNameColor(filename)
                          }`}
                        >
                          {filename}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = openFiles.indexOf(path);
                            const newOpen = openFiles.filter((p) => p !== path);
                            setOpenFiles(newOpen);
                            if (activeFile === path) {
                              setActiveFile(newOpen[Math.max(0, idx - 1)] ?? null);
                            }
                          }}
                          className="ml-0.5 p-0.5 rounded hover:bg-zinc-700"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Main split: tree + code */}
              <div className="flex flex-1 overflow-hidden">
                {/* File tree */}
                <div className="w-[240px] shrink-0 border-r border-zinc-800 overflow-y-auto custom-scrollbar p-1.5 bg-zinc-900/50">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1 font-semibold">
                    Explorer
                  </div>
                  {Object.keys(localFiles).length === 0 ? (
                    <p className="text-xs text-zinc-500 px-2 py-2">Belum ada file</p>
                  ) : (
                    buildFileTree(Object.keys(localFiles)).map((node) => (
                      <TreeNodeRenderer
                        key={node.path}
                        node={node}
                        expandedFolders={expandedFolders}
                        toggleFolder={(p) => {
                          setExpandedFolders((prev) => {
                            const next = new Set(prev);
                            if (next.has(p)) next.delete(p);
                            else next.add(p);
                            return next;
                          });
                        }}
                        activeFile={activeFile}
                        onFileClick={(p) => {
                          if (!openFiles.includes(p)) {
                            setOpenFiles((prev) => [...prev, p]);
                          }
                          setActiveFile(p);
                        }}
                      />
                    ))
                  )}
                </div>

                {/* Code viewer */}
                <div className="flex-1 overflow-auto bg-zinc-950">
                  {activeFile && localFiles[activeFile] !== undefined ? (
                    <CodeViewer
                      code={localFiles[activeFile]}
                      language={getLanguageFromPath(activeFile)}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                      {Object.keys(localFiles).length > 0
                        ? "Pilih file untuk lihat kode"
                        : "File akan muncul saat agent membuat code"}
                    </div>
                  )}
                </div>
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1 bg-violet-700 text-white text-[11px] border-t border-violet-800">
                <div className="flex items-center gap-3">
                  <span>
                    {activeFile ? getLanguageFromPath(activeFile).toUpperCase() : "—"}
                  </span>
                  {activeFile && localFiles[activeFile] !== undefined && (
                    <span>{localFiles[activeFile].split("\n").length} lines</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span>UTF-8</span>
                  <span>LF</span>
                </div>
              </div>
            </div>
          )}

          {/* Terminal Tab */}
          {rightTab === "terminal" && (
            <div className="h-full flex flex-col bg-[#1e1e1e]">
              {/* Mac-style header */}
              <div className="flex items-center px-3 py-2 border-b border-white/10 bg-[#2a2a2a]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] ring-1 ring-black/20" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] ring-1 ring-black/20" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] ring-1 ring-black/20" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-mono text-white/50 inline-flex items-center gap-1">
                    <Zap size={9} />
                    sandbox · bash
                  </span>
                </div>
                <span className="text-[10px] font-mono text-white/40">
                  {session.terminalLogs.length} lines
                </span>
              </div>

              {/* Terminal body */}
              <div
                ref={terminalScrollRef}
                onScroll={handleTerminalScroll}
                className="flex-1 overflow-y-auto p-3 relative"
                style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" }}
              >
                {session.terminalLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/30 text-xs">
                    <Terminal size={14} className="mr-2" />
                    Terminal output akan muncul di sini
                  </div>
                ) : (
                  <div className="space-y-0">
                    {session.terminalLogs.map((line, i) => {
                      const isErr = line.startsWith("✗") || line.toLowerCase().startsWith("error");
                      const isOk = line.startsWith("✓") || line.startsWith("✅");
                      const isStatus = line.startsWith("[") || line.startsWith("→");
                      const cls = isErr
                        ? "text-rose-300"
                        : isOk
                          ? "text-emerald-300"
                          : isStatus
                            ? "text-amber-300"
                            : "text-white/90";
                      return (
                        <div
                          key={i}
                          className={`text-[11px] leading-5 whitespace-pre-wrap break-all ${cls}`}
                        >
                          {line}
                        </div>
                      );
                    })}
                    <div ref={terminalEndRef} />
                  </div>
                )}

                {showScrollDown && session.terminalLogs.length > 0 && (
                  <button
                    onClick={scrollTerminalToBottom}
                    className="sticky bottom-2 ml-auto mr-0 flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-[10px] backdrop-blur-sm transition-colors"
                    title="Scroll ke bawah"
                  >
                    <ArrowDown size={10} />
                    Bottom
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
