import type { ChatMode, Attachment } from "./types";

// ─────────────────────────────────────────────
// Intent detection for "normal" mode auto-switching
// ─────────────────────────────────────────────

export interface IntentDetectionInput {
  content: string;
  attachments?: Attachment[];
  hasSpreadsheet?: boolean; // computed externally if helpful
}

export interface IntentDetectionResult {
  effectiveMode: ChatMode;
  reason: string; // human-readable explanation, used in optional UI hint
  signals: string[]; // matched signals for debug
}

// ─────────────────────────────────────────────
// Pattern banks — keep them tight to minimize false positives
// ─────────────────────────────────────────────

// Agentic triggers: complex research/multi-step tasks. Highest priority.
const AGENTIC_PATTERNS = [
  /\b(cari|search|find).*(lalu|kemudian|then|after|setelah|terus|dan)/i,
  /\b(bandingkan|compare).*(dengan|with|vs)/i,
  /\b(analis(?:a|is))\b.*(kemudian|setelah|lalu|then)/i,
  /\b(riset|research)\b.*(mendalam|deep|tentang)/i,
  /\b(cari.*?dan.*(buat|render|grafik|chart|diagram))/i,
  /\b(scrape|kumpulkan|collect)\s.*(data|info)/i,
  /\b(multi-?step|step.by.step.*search)/i,
];

// Web search triggers: temporal / current info queries. Reuse existing keywords.
const WEB_SEARCH_PATTERNS = [
  // English temporal
  /\blatest\b/i, /\bcurrent\b/i, /\brecent\b/i, /\bnews\b/i, /\btoday\b/i,
  /\bnow\b/i, /\bthis (week|month|year)\b/i, /\bin \d{4}\b/i,
  /\bprice of\b/i, /\bweather (in|for|today)\b/i, /\bscore\b/i,
  /\bwho (won|is)\b/i, /\bwhen (did|was|will)\b/i, /\bwhere (is|can)\b/i,
  // Indonesian temporal
  /\bterbaru\b/i, /\bterkini\b/i, /\bsekarang\b/i, /\bhari ini\b/i,
  /\bminggu ini\b/i, /\bbulan ini\b/i, /\btahun ini\b/i,
  /\bberita\b/i, /\bharga\b/i, /\bcuaca\b/i, /\bskor\b/i,
  /\bsiapa (yang )?(menang|jadi)\b/i,
  // Direct search intent
  /\b(cari(?:kan)?|search|find|google|cek)\b/i,
];

// Thinking triggers: math/logic/proof/complex reasoning
const THINKING_PATTERNS = [
  /\b(buktikan|prove|proof)\b/i,
  /\b(turunkan|derivasi|derive|derivation)\b/i,
  /\b(integral|integrasi|differensial|kalkulus|calculus)\b/i,
  /\b(teorema|theorem|aksioma|lemma)\b/i,
  /\b(persamaan|equation).*solve/i,
  /\b(selesaikan|solve)\s+(soal|problem|matematika|math)\b/i,
  /\b(mengapa|kenapa|why)\b.*(secara matematis|mathematically)/i,
  /\b(big-?o|kompleksitas|complexity|asymptotic)\b/i,
  /\b(debug|trace through)\s.*(code|kode|algoritma)/i,
  /\b(induksi|induction)\s+(matematika|mathematical)/i,
  /\b(prove that|show that|demonstrate that)\b/i,
  // Math notation hints
  /\b\d+\s*\^\s*\d+\b/, // exponent
  /\bsqrt\(|\\sqrt|akar\s+(dari|kuadrat)\b/i,
  /\b(\d+\s*[+\-*/]\s*){3,}/, // chained arithmetic = likely math problem
];

// File-based signals
function hasSpreadsheetAttachment(attachments?: Attachment[]): boolean {
  if (!attachments) return false;
  return attachments.some((a) => {
    const name = (a.name || "").toLowerCase();
    return name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");
  });
}

function hasUrlInText(text: string): boolean {
  return /https?:\/\//i.test(text);
}

// ─────────────────────────────────────────────
// Main detector
// ─────────────────────────────────────────────

export function detectIntent(input: IntentDetectionInput): IntentDetectionResult {
  const text = (input.content || "").trim();
  const signals: string[] = [];

  // Hard skip very short messages — no signal.
  if (text.length < 8) {
    return { effectiveMode: "normal", reason: "Pesan terlalu pendek", signals };
  }

  const hasUrl = hasUrlInText(text);
  if (hasUrl) signals.push("url-in-text");

  const hasSheet = input.hasSpreadsheet ?? hasSpreadsheetAttachment(input.attachments);
  if (hasSheet) signals.push("spreadsheet-attached");

  // Check agentic FIRST (highest specificity).
  const agenticHit = AGENTIC_PATTERNS.find((re) => re.test(text));
  if (agenticHit) {
    signals.push(`agentic:${agenticHit.source.slice(0, 30)}`);
    return {
      effectiveMode: "agentic",
      reason: "Terdeteksi tugas multi-step (search + analisis)",
      signals,
    };
  }

  // Check thinking next.
  const thinkingHit = THINKING_PATTERNS.find((re) => re.test(text));
  if (thinkingHit) {
    signals.push(`thinking:${thinkingHit.source.slice(0, 30)}`);
    return {
      effectiveMode: "thinking",
      reason: "Terdeteksi soal yang butuh penalaran mendalam",
      signals,
    };
  }

  // Check web search last (lowest specificity but most common).
  // Skip if URL is in text — URL fetching is already handled separately.
  if (!hasUrl) {
    const searchHit = WEB_SEARCH_PATTERNS.find((re) => re.test(text));
    if (searchHit) {
      signals.push(`web-search:${searchHit.source.slice(0, 30)}`);
      return {
        effectiveMode: "web-search",
        reason: "Terdeteksi butuh info terkini dari web",
        signals,
      };
    }
  }

  // Default — no auto-switch.
  return {
    effectiveMode: "normal",
    reason: "Pesan biasa, tidak perlu mode khusus",
    signals,
  };
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────

export function autoModeLabel(mode: ChatMode): string {
  switch (mode) {
    case "agentic":
      return "Agentic auto-detect";
    case "web-search":
      return "Web search auto-detect";
    case "thinking":
      return "Thinking auto-detect";
    case "deep-research":
      return "Deep Research auto-detect";
    default:
      return "Normal";
  }
}
