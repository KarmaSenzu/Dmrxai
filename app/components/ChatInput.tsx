"use client";

import { useState, useRef, useEffect, useMemo, KeyboardEvent } from "react";
import { Send, Square, ChevronDown, Check, Brain, Search, ImagePlus, Paperclip, X, FileText, Zap, Globe, Bot, Upload } from "lucide-react";
import { ChatMode, Attachment } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import mammoth from "mammoth";
import {
  groupModels,
  formatModelDisplayName,
  categorizeModel,
  MODEL_CATEGORIES,
} from "@/lib/model-categories";

const MODE_STORAGE_KEY = "chat-app-mode";

// ─── Attachment extraction caps ───────────────────────────────────
// Total character budget per attachment, ~chars-per-token ≈ 3.5 → ~22-23K tokens.
// Tuned so a single attachment + 280-line system prompt + history + thinking budget
// stays well under Claude Opus 4.7's 200K context window.
const MAX_ATTACHMENT_CHARS = 80_000;
// Per-sheet sub-cap is now derived from MAX_ATTACHMENT_CHARS, but we keep a hard
// floor so a single huge sheet can't crowd the others out completely.
// NOTE: Obsolete for the new schema-based extractXlsxText (which uses sample
// sizes + reduction passes instead of proportional char budgets). Kept declared
// in case other code references it — safe to remove later.
const MIN_PER_SHEET_CHARS = 4_000;
void MIN_PER_SHEET_CHARS;

// ─── XLSX extraction helpers (module-scope, pure) ─────────────────

type XlsxColumnType = "number" | "integer" | "date" | "boolean" | "string" | "mixed";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;

function inferColumnType(values: unknown[]): XlsxColumnType {
  let allNumber = true;
  let allInteger = true;
  let anyDecimal = false;
  let allDate = true;
  let allBoolean = true;
  let allString = true;
  let nonNullCount = 0;

  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    nonNullCount++;

    // number / integer
    if (typeof v === "number" && Number.isFinite(v)) {
      if (!Number.isInteger(v)) {
        allInteger = false;
        anyDecimal = true;
      }
    } else {
      allNumber = false;
      allInteger = false;
    }

    // date (Date instance OR ISO/slash date string)
    if (v instanceof Date) {
      // ok
    } else if (typeof v === "string" && (ISO_DATE_RE.test(v) || SLASH_DATE_RE.test(v))) {
      // ok
    } else {
      allDate = false;
    }

    // boolean (literal OR "true"/"false" string)
    if (typeof v === "boolean") {
      // ok
    } else if (typeof v === "string") {
      const lower = v.toLowerCase();
      if (lower !== "true" && lower !== "false") allBoolean = false;
    } else {
      allBoolean = false;
    }

    // string
    if (typeof v !== "string") allString = false;
  }

  if (nonNullCount === 0) return "string";
  // priority: boolean → date → integer → number → string → mixed
  if (allBoolean) return "boolean";
  if (allDate) return "date";
  if (allNumber) return anyDecimal ? "number" : "integer";
  if (allString) return "string";
  return "mixed";
}

function computeNumericStats(
  values: unknown[]
): { min: number; max: number; mean: number; count: number } | null {
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) {
      count++;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (count === 0) return null;
  return { min, max, mean: sum / count, count };
}

function csvEscapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    const d = value;
    if (
      d.getHours() === 0 &&
      d.getMinutes() === 0 &&
      d.getSeconds() === 0 &&
      d.getMilliseconds() === 0
    ) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      s = `${y}-${mo}-${da}`;
    } else {
      s = d.toISOString();
    }
  } else if (typeof value === "object") {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  // CSV escape: wrap if contains , " \n or has leading/trailing whitespace
  const needsQuote = /[",\n]/.test(s) || (s.length > 0 && s !== s.trim());
  if (needsQuote) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatRowAsCsv(row: unknown[], columnCount: number): string {
  const cells: string[] = [];
  for (let i = 0; i < columnCount; i++) cells.push(csvEscapeCell(row[i]));
  return cells.join(",");
}

function formatThousands(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return formatThousands(n);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Component ────────────────────────────────────────────────────

interface ChatInputProps {
  onSend: (message: string, chatMode?: ChatMode, attachments?: Attachment[]) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  fetchedModels?: string[];
}

export default function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  currentModel,
  onModelChange,
  fetchedModels = [],
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("normal");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelSearch, setModelSearch] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // Load persisted chatMode on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (
        saved === "normal" ||
        saved === "thinking" ||
        saved === "deep-research" ||
        saved === "web-search" ||
        saved === "agentic"
      ) {
        setChatMode(saved as ChatMode);
      }
    } catch {
      /* ignore */
    }
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist chatMode whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, chatMode);
    } catch {
      /* ignore */
    }
  }, [chatMode]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close model picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
        setModelSearch("");
      }
    };
    if (showModelPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelPicker]);

  const handleSubmit = () => {
    if ((!input.trim() && attachments.length === 0) || isLoading || disabled) return;
    onSend(input, chatMode, attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Extract text from PDF file (dynamic import to avoid SSR issues)
  const extractPdfText = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const textParts: string[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        if (pageText.trim()) {
          textParts.push(`--- Page ${i} ---\n${pageText}`);
        }
      }
      const full = textParts.join("\n\n");
      const totalChars = full.length;
      if (totalChars <= MAX_ATTACHMENT_CHARS) return full;

      // Slice to budget, then back off to the last whitespace boundary
      // (newline preferred, else space) to avoid mid-word truncation.
      let cut = full.slice(0, MAX_ATTACHMENT_CHARS);
      const lastNl = cut.lastIndexOf("\n");
      const lastSp = cut.lastIndexOf(" ");
      const boundary = lastNl > 0 ? lastNl : lastSp;
      if (boundary > 0) cut = cut.slice(0, boundary);
      return `${cut}\n\n[...PDF truncated: showing ~${cut.length} of ${totalChars} characters dari ${numPages} halaman untuk menjaga budget konteks AI.]`;
    } catch (err) {
      console.error("Error extracting PDF text:", err);
      return "[Error: Gagal membaca konten PDF]";
    }
  };

  // Extract text from DOCX file
  const extractDocxText = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer });
      const value = result.value ?? "";
      const totalChars = value.length;
      if (totalChars <= MAX_ATTACHMENT_CHARS) return value;

      let cut = value.slice(0, MAX_ATTACHMENT_CHARS);
      const lastNl = cut.lastIndexOf("\n");
      const lastSp = cut.lastIndexOf(" ");
      const boundary = lastNl > 0 ? lastNl : lastSp;
      if (boundary > 0) cut = cut.slice(0, boundary);
      return `${cut}\n\n[...DOCX truncated: showing ~${cut.length} of ${totalChars} characters untuk menjaga budget konteks AI.]`;
    } catch (err) {
      console.error("Error extracting DOCX text:", err);
      return "[Error: Gagal membaca konten DOCX]";
    }
  };

  // Extract text from XLSX/XLS file using a "schema + smart sample" strategy:
  // for each sheet we emit column schema (names + inferred types + null counts),
  // numeric stats over ALL rows, and head/tail row samples. This gives the AI
  // structural awareness of large workbooks (5MB+) without ingesting every row.
  const extractXlsxText = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const MAX_COLUMNS = 200;
    const SCHEMA_SAMPLE_PER_END = 100;

    type SheetData = {
      name: string;
      headers: string[];
      truncatedColumns: number; // 0 if not truncated, else original column count
      rows: unknown[][];
      columnTypes: XlsxColumnType[];
      columnNullCounts: number[];
      columnStats: Array<ReturnType<typeof computeNumericStats>>;
    };

    type SheetEntry =
      | { kind: "ok"; data: SheetData }
      | { kind: "error"; name: string; message: string };

    const renderSheetBlock = (
      data: SheetData,
      headSize: number,
      includeTail: boolean,
      tailSize: number,
      reductionNote: string | null
    ): string => {
      const totalRows = data.rows.length;
      const colCount = data.headers.length;
      const lines: string[] = [];
      lines.push(`--- Sheet: ${data.name} ---`);
      lines.push(
        `Schema: ${formatThousands(colCount)} columns × ${formatThousands(totalRows)} rows`
      );
      if (data.truncatedColumns > 0) {
        lines.push(
          `[...truncated to ${MAX_COLUMNS} of ${formatThousands(data.truncatedColumns)} columns]`
        );
      }
      lines.push("Columns:");
      for (let i = 0; i < colCount; i++) {
        const name = data.headers[i];
        const type = data.columnTypes[i];
        const nulls = data.columnNullCounts[i];
        const stats = data.columnStats[i];
        let line = `  - "${name}" (${type}, ${formatThousands(nulls)} nulls`;
        if (stats && (type === "number" || type === "integer")) {
          line += `, min=${formatNumber(stats.min)}, max=${formatNumber(stats.max)}, mean=${formatNumber(stats.mean)}`;
        }
        line += ")";
        lines.push(line);
      }

      // Samples
      if (totalRows === 0) {
        // header-only sheet: schema only, plus note
        lines.push(
          "[NOTE: Sheet hanya berisi header, tidak ada baris data — sample dilewati.]"
        );
      } else if (headSize <= 0) {
        // samples dropped entirely
        if (reductionNote) lines.push(reductionNote);
      } else {
        const headerCsv = formatRowAsCsv(data.headers, colCount);
        if (totalRows <= 100 || !includeTail) {
          // single sample block
          const heading =
            totalRows <= 100
              ? "Sample (all rows):"
              : `Sample (first ${formatThousands(Math.min(headSize, totalRows))} rows):`;
          lines.push(heading);
          lines.push(headerCsv);
          const limit = Math.min(headSize, totalRows);
          for (let i = 0; i < limit; i++) {
            lines.push(formatRowAsCsv(data.rows[i], colCount));
          }
        } else {
          // head + tail
          lines.push(`Sample (first ${formatThousands(headSize)} rows):`);
          lines.push(headerCsv);
          for (let i = 0; i < headSize; i++) {
            lines.push(formatRowAsCsv(data.rows[i], colCount));
          }
          lines.push(`Sample (last ${formatThousands(tailSize)} rows):`);
          lines.push(headerCsv);
          for (let i = totalRows - tailSize; i < totalRows; i++) {
            lines.push(formatRowAsCsv(data.rows[i], colCount));
          }
        }
        if (reductionNote) lines.push(reductionNote);
      }

      return lines.join("\n");
    };

    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

      // ─── Step 1: parse every sheet to structured data ─────────────
      const entries: SheetEntry[] = [];
      for (const sheetName of wb.SheetNames) {
        try {
          const sheet = wb.Sheets[sheetName];
          if (!sheet) continue;
          const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            blankrows: false,
            defval: null,
          });
          if (!Array.isArray(aoa) || aoa.length === 0) continue;

          // Determine headers vs synthesize.
          const firstRow = (aoa[0] ?? []) as unknown[];
          const isHeaderRow =
            firstRow.length > 0 &&
            firstRow.every(
              (c) =>
                c === null ||
                c === undefined ||
                c === "" ||
                typeof c === "string"
            );

          let headerSource: unknown[];
          let dataRows: unknown[][];
          if (isHeaderRow) {
            headerSource = firstRow;
            dataRows = aoa.slice(1) as unknown[][];
          } else {
            // synthesize headers from the widest row
            const widest = aoa.reduce(
              (m, r) => Math.max(m, Array.isArray(r) ? r.length : 0),
              0
            );
            headerSource = new Array(widest).fill(null);
            dataRows = aoa as unknown[][];
          }

          // Cap columns at MAX_COLUMNS.
          const originalColCount = headerSource.length;
          const colCount = Math.min(originalColCount, MAX_COLUMNS);
          const truncatedColumns = originalColCount > MAX_COLUMNS ? originalColCount : 0;

          const headers: string[] = [];
          for (let i = 0; i < colCount; i++) {
            const raw = headerSource[i];
            const trimmed =
              typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
            headers.push(trimmed === "" ? `Column ${i + 1}` : trimmed);
          }

          // Per-column type inference + null counts + numeric stats.
          const columnTypes: XlsxColumnType[] = new Array(colCount);
          const columnNullCounts: number[] = new Array(colCount).fill(0);
          const columnStats: Array<ReturnType<typeof computeNumericStats>> = new Array(
            colCount
          ).fill(null);

          const totalRows = dataRows.length;
          // Build sampling indices for type inference: head 100 + tail 100,
          // or all rows if totalRows <= 200.
          const sampleIndices: number[] = [];
          if (totalRows <= SCHEMA_SAMPLE_PER_END * 2) {
            for (let i = 0; i < totalRows; i++) sampleIndices.push(i);
          } else {
            for (let i = 0; i < SCHEMA_SAMPLE_PER_END; i++) sampleIndices.push(i);
            for (let i = totalRows - SCHEMA_SAMPLE_PER_END; i < totalRows; i++) {
              sampleIndices.push(i);
            }
          }

          for (let c = 0; c < colCount; c++) {
            // Type inference uses sampled cells.
            const sampled: unknown[] = [];
            for (const ri of sampleIndices) {
              sampled.push(dataRows[ri]?.[c] ?? null);
            }
            columnTypes[c] = inferColumnType(sampled);

            // Null counts span ALL rows.
            let nulls = 0;
            for (let ri = 0; ri < totalRows; ri++) {
              const v = dataRows[ri]?.[c];
              if (v === null || v === undefined || v === "") nulls++;
            }
            columnNullCounts[c] = nulls;

            // Numeric stats span ALL rows when type is number/integer.
            if (columnTypes[c] === "number" || columnTypes[c] === "integer") {
              const allValues: unknown[] = new Array(totalRows);
              for (let ri = 0; ri < totalRows; ri++) {
                allValues[ri] = dataRows[ri]?.[c] ?? null;
              }
              columnStats[c] = computeNumericStats(allValues);
            }
          }

          entries.push({
            kind: "ok",
            data: {
              name: sheetName,
              headers,
              truncatedColumns,
              rows: dataRows,
              columnTypes,
              columnNullCounts,
              columnStats,
            },
          });
        } catch (sheetErr) {
          const message = sheetErr instanceof Error ? sheetErr.message : String(sheetErr);
          entries.push({ kind: "error", name: sheetName, message });
        }
      }

      if (entries.length === 0) return "";

      // ─── Step 2: budget reduction passes ──────────────────────────
      // Pass 0: full samples (head 50 + tail 50).
      // Pass 1: drop tail samples.
      // Pass 2: head reduced to 25 rows (no tail).
      // Pass 3: head reduced to 10 rows (no tail).
      // Pass 4: drop samples entirely (schema + stats only).
      type Plan = {
        headSize: number;
        includeTail: boolean;
        tailSize: number;
        reduced: boolean;
      };
      const plans: Plan[] = [
        { headSize: 50, includeTail: true, tailSize: 50, reduced: false },
        { headSize: 50, includeTail: false, tailSize: 0, reduced: true },
        { headSize: 25, includeTail: false, tailSize: 0, reduced: true },
        { headSize: 10, includeTail: false, tailSize: 0, reduced: true },
        { headSize: 0, includeTail: false, tailSize: 0, reduced: true },
      ];

      const reductionNoteText =
        "[NOTE: Sample dipangkas karena workbook besar — AI hanya melihat schema + stats untuk sheet ini.]";

      const buildBlocks = (plan: Plan): string[] => {
        return entries.map((e) => {
          if (e.kind === "error") {
            return `--- Sheet: ${e.name} ---\n[Error reading sheet: ${e.message}]`;
          }
          const totalRows = e.data.rows.length;
          // Decide if THIS sheet's samples were actually reduced relative to the
          // full plan (50 head + 50 tail or, for ≤100 rows, all rows).
          let reducedForThisSheet = false;
          if (plan.headSize === 0) {
            // samples dropped entirely → reduced if the sheet has any rows
            reducedForThisSheet = totalRows > 0;
          } else if (totalRows > 100) {
            // would have had 50 head + 50 tail in pass 0; reduced if not that
            reducedForThisSheet =
              plan.headSize !== 50 || !plan.includeTail || plan.tailSize !== 50;
          } else {
            // ≤100 rows: pass 0 emits all rows; reduced only if headSize < totalRows
            reducedForThisSheet = plan.headSize < totalRows;
          }
          const note = reducedForThisSheet ? reductionNoteText : null;
          return renderSheetBlock(
            e.data,
            plan.headSize,
            plan.includeTail,
            plan.tailSize,
            note
          );
        });
      };

      let chosenPlan: Plan = plans[0];
      let blocks = buildBlocks(chosenPlan);
      let total = blocks.reduce((s, b) => s + b.length, 0) + (blocks.length - 1) * 2; // \n\n separators
      for (let p = 1; p < plans.length; p++) {
        if (total <= MAX_ATTACHMENT_CHARS) break;
        chosenPlan = plans[p];
        blocks = buildBlocks(chosenPlan);
        total = blocks.reduce((s, b) => s + b.length, 0) + (blocks.length - 1) * 2;
      }

      const joined = blocks.join("\n\n");

      // ─── Step 3: workbook-level header if any reduction happened ──
      if (chosenPlan.reduced) {
        const okEntries = entries.filter(
          (e): e is Extract<SheetEntry, { kind: "ok" }> => e.kind === "ok"
        );
        const totalDataRows = okEntries.reduce((s, e) => s + e.data.rows.length, 0);
        const header =
          `[NOTE: Workbook besar — analisis berbasis schema + stats per kolom, ` +
          `dengan sample row terbatas. Total ${formatThousands(entries.length)} sheet, ` +
          `${formatThousands(totalDataRows)} baris data. AI bisa diminta deskripsi/agregasi/insight, ` +
          `tapi tidak punya akses ke setiap baris.]`;
        return `${header}\n\n${joined}`;
      }

      return joined;
    } catch (err) {
      console.error("Error extracting XLSX text:", err);
      return "[Error: Gagal membaca konten Excel]";
    }
  };

  // Process a single file: validate, extract text, build Attachment, push to state
  const processFile = async (file: File, type: "image" | "file"): Promise<void> => {
    const textExtensions = [".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".ts", ".py", ".java", ".c", ".cpp", ".rtf", ".log", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".sh", ".bat"];

    // Max 20MB for all files
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File "${file.name}" terlalu besar. Maksimal 20MB.`);
      return;
    }

    let extractedText: string | undefined;
    const fileName = file.name.toLowerCase();

    // Extract text from PDF files
    if (fileName.endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      extractedText = await extractPdfText(arrayBuffer);
    }
    // Extract text from DOCX files
    else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
      const arrayBuffer = await file.arrayBuffer();
      extractedText = await extractDocxText(arrayBuffer);
    }
    // Extract text from XLSX/XLS files
    else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const arrayBuffer = await file.arrayBuffer();
      extractedText = await extractXlsxText(arrayBuffer);
    }
    // Read plain text files directly
    else if (textExtensions.some(ext => fileName.endsWith(ext))) {
      const text = await file.text();
      extractedText = text;
    }

    // Determine mime type
    let mimeType = file.type;
    if (!mimeType) {
      if (fileName.endsWith(".pdf")) mimeType = "application/pdf";
      else if (fileName.endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      else if (fileName.endsWith(".doc")) mimeType = "application/msword";
      else if (fileName.endsWith(".zip")) mimeType = "application/zip";
      else if (fileName.endsWith(".rar")) mimeType = "application/x-rar-compressed";
      else if (fileName.endsWith(".7z")) mimeType = "application/x-7z-compressed";
      else if (fileName.endsWith(".mp4")) mimeType = "video/mp4";
      else if (fileName.endsWith(".mp3")) mimeType = "audio/mpeg";
      else if (fileName.endsWith(".exe")) mimeType = "application/x-msdownload";
      else if (fileName.endsWith(".apk")) mimeType = "application/vnd.android.package-archive";
      else mimeType = "application/octet-stream";
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      const newAttachment: Attachment = {
        id: uuidv4(),
        type,
        name: file.name,
        mimeType,
        base64,
        size: file.size,
        extractedText,
      };
      setAttachments((prev) => [...prev, newAttachment]);
    };
    reader.readAsDataURL(file);
  };

  // Handle file/image upload from <input type="file">
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "file") => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => processFile(file, type));
    e.target.value = "";
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false when leaving the wrapper itself (not its children).
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    Array.from(droppedFiles).forEach((file) => {
      const isImage = file.type.startsWith("image/");
      processFile(file, isImage ? "image" : "file");
    });
  };

  // Paste handler — captures images/files from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    let handled = false;
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split("/")[1] || "png";
          const renamed = new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
          processFile(renamed, "image");
          handled = true;
        }
      } else if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          processFile(file, "file");
          handled = true;
        }
      }
    }

    // If we handled a binary item, prevent default so it doesn't ALSO leak as text.
    if (handled) {
      e.preventDefault();
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Current model display info
  const currentDisplay = currentModel ? formatModelDisplayName(currentModel) : "Select model";
  const currentCategory = currentModel ? MODEL_CATEGORIES[categorizeModel(currentModel)] : null;

  // Filter fetched models by search (matches both raw ID and display name)
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return fetchedModels;
    const q = modelSearch.toLowerCase();
    return fetchedModels.filter((id) => {
      const display = formatModelDisplayName(id).toLowerCase();
      return id.toLowerCase().includes(q) || display.includes(q);
    });
  }, [fetchedModels, modelSearch]);

  // Grouped models — only computed when not searching
  const groupedModels = useMemo(() => {
    if (modelSearch.trim()) return null;
    return groupModels(
      fetchedModels.map((id) => ({ id, displayName: formatModelDisplayName(id) }))
    );
  }, [fetchedModels, modelSearch]);

  // Helper to render a single model row (DRY for both flat & grouped views)
  const renderModelButton = (modelId: string, displayName?: string) => {
    const isSelected = currentModel === modelId;
    const display = displayName ?? formatModelDisplayName(modelId);
    return (
      <button
        key={modelId}
        onClick={() => {
          onModelChange(modelId);
          setShowModelPicker(false);
          setModelSearch("");
        }}
        className={`w-full text-left px-4 py-2 transition-colors flex items-center gap-3 ${
          isSelected
            ? "bg-light-accent/10 dark:bg-dark-accent/10"
            : "hover:bg-light-hover dark:hover:bg-dark-hover"
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium truncate ${isSelected ? "text-light-accent dark:text-dark-accent" : "text-light-text dark:text-dark-text"}`}>
              {display}
            </span>
            {isSelected && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-light-accent/20 dark:bg-dark-accent/20 text-light-accent dark:text-dark-accent font-semibold flex-shrink-0">
                Active
              </span>
            )}
          </div>
          <p className="text-[10px] text-light-muted dark:text-dark-muted mt-0.5 truncate font-mono">
            {modelId}
          </p>
        </div>
        {isSelected && (
          <Check size={14} className="flex-shrink-0 text-light-accent dark:text-dark-accent" />
        )}
      </button>
    );
  };

  return (
    <div className="border-t border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-4">
      <div className="max-w-3xl mx-auto">
        {/* Model Selector */}
        <div className="relative mb-2" ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-hover dark:hover:bg-dark-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentCategory?.icon && (
              <span className="flex-shrink-0 leading-none" aria-hidden="true">
                {currentCategory.icon}
              </span>
            )}
            <span className="max-w-[220px] truncate">{currentDisplay}</span>
            <ChevronDown size={12} className={`text-light-muted dark:text-dark-muted transition-transform ${showModelPicker ? "rotate-180" : ""}`} />
          </button>

          {/* Model Picker Dropdown */}
          {showModelPicker && (
            <div className="absolute bottom-full left-0 mb-2 w-[420px] max-w-[calc(100vw-2rem)] max-h-[480px] bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
              {/* Header */}
              <div className="px-4 py-3 border-b border-light-border dark:border-dark-border">
                <p className="text-sm font-semibold text-light-text dark:text-dark-text">Available Models</p>
                <p className="text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
                  Dikelompokkan per family, urut dari kualitas tertinggi.
                </p>
              </div>

              {/* Search */}
              {fetchedModels.length > 0 && (
                <div className="p-2 border-b border-light-border dark:border-dark-border">
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Search models..."
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text text-xs focus:outline-none focus:border-light-accent dark:focus:border-dark-accent"
                  />
                </div>
              )}

              {/* Model List */}
              <div className="overflow-y-auto custom-scrollbar flex-1">
                {fetchedModels.length === 0 ? (
                  <div className="p-6 text-center text-xs text-light-muted dark:text-dark-muted">
                    No models available. Connect to a provider in Settings.
                  </div>
                ) : modelSearch && filteredModels.length === 0 ? (
                  <div className="p-6 text-center text-xs text-light-muted dark:text-dark-muted">
                    No models match &quot;{modelSearch}&quot;
                  </div>
                ) : modelSearch ? (
                  // Search mode: flat list
                  filteredModels.map((modelId) => renderModelButton(modelId))
                ) : (
                  // Grouped mode: section per family, sorted by quality
                  groupedModels?.map((group) => (
                    <div
                      key={group.category.id}
                      className="border-b border-light-border/50 dark:border-dark-border/50 last:border-b-0"
                    >
                      {/* Sticky category header */}
                      <div className="sticky top-0 z-10 px-4 py-1.5 bg-light-bg/95 dark:bg-dark-bg/95 backdrop-blur-sm border-b border-light-border/30 dark:border-dark-border/30 flex items-center gap-2">
                        {group.category.icon && (
                          <span className="text-sm leading-none" aria-hidden="true">
                            {group.category.icon}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-light-text dark:text-dark-text">
                          {group.category.label}
                        </span>
                        <span className="text-[10px] text-light-muted dark:text-dark-muted">
                          ({group.models.length})
                        </span>
                        {group.category.description && (
                          <span className="hidden sm:inline text-[10px] text-light-muted/70 dark:text-dark-muted/70 truncate ml-auto">
                            {group.category.description}
                          </span>
                        )}
                      </div>
                      {/* Model items */}
                      {group.models.map((m) => renderModelButton(m.id, m.displayName))}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          className="relative bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border rounded-2xl focus-within:border-light-accent dark:focus-within:border-dark-accent transition-colors"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Mode Toggle - inside input box, top */}
          <div className="flex items-center gap-1 px-3 pt-2.5 pb-1">
            {([
              { mode: "normal" as ChatMode, label: "Normal", icon: <Zap size={11} /> },
              { mode: "thinking" as ChatMode, label: "Thinking", icon: <Brain size={11} /> },
              { mode: "deep-research" as ChatMode, label: "Deep Research", icon: <Search size={11} /> },
              { mode: "web-search" as ChatMode, label: "Web Search", icon: <Globe size={11} /> },
              { mode: "agentic" as ChatMode, label: "Agentic", icon: <Bot size={11} /> },
            ]).map((item) => (
              <button
                key={item.mode}
                onClick={() => setChatMode(chatMode === item.mode ? "normal" : item.mode)}
                disabled={disabled}
                title={
                  item.mode === "web-search"
                    ? "Search the web before answering"
                    : item.mode === "thinking"
                    ? "Shows reasoning process"
                    : item.mode === "deep-research"
                    ? "In-depth analysis & research"
                    : item.mode === "agentic"
                    ? "Mode agentic — model decide kapan pakai search/fetch/chart sendiri"
                    : "Standard response"
                }
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  chatMode === item.mode
                    ? item.mode === "thinking"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : item.mode === "deep-research"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : item.mode === "web-search"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : item.mode === "agentic"
                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                      : "bg-light-accent/15 text-light-accent dark:text-dark-accent"
                    : "text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text hover:bg-light-hover dark:hover:bg-dark-hover"
                } disabled:opacity-40`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Attachment Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-2">
              {attachments.map((att) => (
                <div key={att.id} className="relative group">
                  {att.type === "image" ? (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-light-border dark:border-dark-border">
                      <img src={`data:${att.mimeType};base64,${att.base64}`} alt={att.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border">
                      <FileText size={12} className={
                        att.name.endsWith(".pdf") ? "text-red-500" :
                        (att.name.endsWith(".docx") || att.name.endsWith(".doc")) ? "text-blue-500" :
                        (att.name.endsWith(".zip") || att.name.endsWith(".rar") || att.name.endsWith(".7z")) ? "text-yellow-500" :
                        (att.name.endsWith(".mp4") || att.name.endsWith(".mkv") || att.name.endsWith(".avi") || att.name.endsWith(".mov")) ? "text-purple-500" :
                        (att.name.endsWith(".mp3") || att.name.endsWith(".wav") || att.name.endsWith(".ogg") || att.name.endsWith(".flac")) ? "text-green-500" :
                        (att.name.endsWith(".exe") || att.name.endsWith(".apk")) ? "text-orange-500" :
                        "text-light-accent dark:text-dark-accent"
                      } />
                      <span className="text-[10px] text-light-text dark:text-dark-text max-w-[80px] truncate">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Mode Banner */}
          {chatMode !== "normal" && (
            <div
              className={`flex items-center justify-between mx-3 mb-1 px-3 py-2 rounded-lg text-xs font-medium border ${
                chatMode === "web-search"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : chatMode === "thinking"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                  : chatMode === "agentic"
                  ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30"
                  : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
              }`}
            >
              <div className="flex items-center gap-2">
                {chatMode === "web-search" && <Globe size={14} />}
                {chatMode === "thinking" && <Brain size={14} />}
                {chatMode === "deep-research" && <Search size={14} />}
                {chatMode === "agentic" && <Bot size={14} />}
                <span>
                  {chatMode === "web-search" &&
                    "Web Search aktif — pencarian otomatis sebelum jawaban"}
                  {chatMode === "thinking" &&
                    "Thinking mode — model akan berpikir langkah demi langkah"}
                  {chatMode === "deep-research" &&
                    "Deep Research — analisis mendalam dengan reasoning panjang"}
                  {chatMode === "agentic" &&
                    "Agentic mode — model akan pakai web search, fetch URL, atau buat chart sendiri kalau dibutuhkan"}
                </span>
              </div>
              <button
                onClick={() => setChatMode("normal")}
                className="opacity-70 hover:opacity-100 transition-opacity"
                title="Nonaktifkan mode"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Textarea + Upload + Send */}
          <div className="flex items-end gap-2 px-4 pb-3 pt-1">
            {/* Upload Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text hover:bg-light-hover dark:hover:bg-dark-hover transition-colors disabled:opacity-30"
                title="Upload gambar"
              >
                <ImagePlus size={16} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text hover:bg-light-hover dark:hover:bg-dark-hover transition-colors disabled:opacity-30"
                title="Upload file"
              >
                <Paperclip size={16} />
              </button>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e, "image")}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.jpg,.jpeg,.png,.gif,.bmp,.svg,.webp,.mp4,.mkv,.avi,.mov,.wmv,.flv,.webm,.mp3,.wav,.ogg,.flac,.aac,.wma,.zip,.rar,.7z,.tar,.gz,.bz2,.exe,.apk,.dmg,.iso,.bin"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e, "file")}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                disabled
                  ? "Configure your API settings first..."
                  : chatMode === "thinking"
                  ? "Ask something... AI will show its reasoning process"
                  : chatMode === "deep-research"
                  ? "Ask something... AI will conduct in-depth research"
                  : chatMode === "web-search"
                  ? "Ask anything (web search active)"
                  : chatMode === "agentic"
                  ? "Tanya apa saja (agentic mode aktif)"
                  : "Type your message..."
              }
              disabled={disabled}
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-light-text dark:text-dark-text placeholder-light-muted dark:placeholder-dark-muted max-h-[200px] disabled:opacity-50"
            />
            {isLoading ? (
              <button
                onClick={onStop}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                title="Stop generating"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={(!input.trim() && attachments.length === 0) || disabled}
                className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity ${
                  chatMode === "thinking"
                    ? "bg-amber-500"
                    : chatMode === "deep-research"
                    ? "bg-blue-500"
                    : chatMode === "web-search"
                    ? "bg-emerald-500"
                    : chatMode === "agentic"
                    ? "bg-violet-500"
                    : "bg-light-accent dark:bg-dark-accent"
                }`}
                title="Send message"
              >
                <Send size={16} />
              </button>
            )}
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-light-accent/10 dark:bg-dark-accent/10 border-2 border-dashed border-light-accent dark:border-dark-accent pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-light-accent dark:text-dark-accent">
                <Upload size={32} />
                <span className="text-sm font-medium">Lepaskan untuk upload gambar atau dokumen</span>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-center mt-2 text-light-muted dark:text-dark-muted">
          Press Enter to send, Shift+Enter for new line
          {chatMode !== "normal" && (
            <span
              className={`ml-1 font-medium ${
                chatMode === "thinking"
                  ? "text-amber-500"
                  : chatMode === "deep-research"
                  ? "text-blue-500"
                  : chatMode === "agentic"
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-emerald-500"
              }`}
            >
              ·{" "}
              {chatMode === "thinking"
                ? "Thinking mode"
                : chatMode === "deep-research"
                ? "Deep Research mode"
                : chatMode === "agentic"
                ? "Agentic mode"
                : "Web Search mode"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
