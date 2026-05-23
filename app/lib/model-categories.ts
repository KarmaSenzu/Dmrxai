// app/lib/model-categories.ts
//
// Helper untuk mengelompokkan model AI berdasarkan family/provider
// dari ID-nya (yang biasanya berupa string seperti `cc/claude-opus-4-7`,
// `gpt-4o`, `deepseek-chat`, dll).
//
// Pattern matching pakai keyword case-insensitive. Ini intentionally
// permissive — kalau model ID baru muncul yang tidak match, akan jatuh
// ke kategori "Other".

export interface ModelCategory {
  id: string;
  label: string;
  description?: string;
  // Icon emoji (frontend handle render).
  icon?: string;
  // Order untuk sort di UI.
  order: number;
}

export const MODEL_CATEGORIES: Record<string, ModelCategory> = {
  claude: {
    id: "claude",
    label: "Claude (Anthropic)",
    description: "Opus, Sonnet, Haiku",
    icon: "🟧",
    order: 1,
  },
  gpt: {
    id: "gpt",
    label: "GPT (OpenAI)",
    description: "GPT-4o, GPT-4, GPT-3.5",
    icon: "🟢",
    order: 2,
  },
  o1: {
    id: "o1",
    label: "o1 / o3 (OpenAI Reasoning)",
    description: "o1-preview, o1-mini, o3-mini",
    icon: "🧠",
    order: 3,
  },
  gemini: {
    id: "gemini",
    label: "Gemini (Google)",
    description: "Gemini 2.0, 1.5 Pro/Flash",
    icon: "🔷",
    order: 4,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek Chat, Coder, R1",
    icon: "🔵",
    order: 5,
  },
  llama: {
    id: "llama",
    label: "Llama (Meta)",
    description: "Llama 3.x, 4.x family",
    icon: "🟣",
    order: 6,
  },
  qwen: {
    id: "qwen",
    label: "Qwen (Alibaba)",
    description: "Qwen 2.5, 3, QwQ",
    icon: "🟡",
    order: 7,
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    description: "Mistral Large, Codestral, Mixtral",
    icon: "🟠",
    order: 8,
  },
  grok: {
    id: "grok",
    label: "Grok (xAI)",
    description: "Grok 2, Grok 3",
    icon: "⚫",
    order: 9,
  },
  cohere: {
    id: "cohere",
    label: "Cohere",
    description: "Command R, Command R+",
    icon: "🟤",
    order: 10,
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    description: "Sonar, Sonar Pro",
    icon: "🟦",
    order: 11,
  },
  other: {
    id: "other",
    label: "Lainnya",
    description: "Provider lain atau model custom",
    icon: "❓",
    order: 999,
  },
};

// categorizeModel pakai keyword match terhadap model ID. Order penting:
// pattern yang lebih spesifik harus dicek dulu (mis. "o1" sebelum "gpt"
// supaya `gpt-o1` tidak salah masuk kategori `gpt`).
export function categorizeModel(modelId: string): string {
  const id = (modelId || "").toLowerCase();
  if (!id) return "other";

  // Strip prefix sebelum slash supaya keyword match tidak terganggu prefix
  // provider seperti `cc/`, `openai/`, `anthropic/`, dst.
  const slashIdx = id.indexOf("/");
  const tail = slashIdx >= 0 && slashIdx < id.length - 1 ? id.slice(slashIdx + 1) : id;

  // Reasoning models (OpenAI o-series) — cek dulu karena bisa overlap
  // dengan gpt. Match `o1`, `o3`, `o4` sebagai standalone token.
  if (/(^|[^a-z0-9])(o1|o3|o4)([-_]|$)/.test(tail)) return "o1";

  // Claude family
  if (
    tail.includes("claude") ||
    tail.includes("opus") ||
    tail.includes("sonnet") ||
    tail.includes("haiku") ||
    id.startsWith("anthropic/") ||
    id.startsWith("cc/")
  ) {
    return "claude";
  }

  // GPT family (OpenAI non-reasoning)
  if (tail.includes("gpt-") || tail.includes("gpt4") || tail.includes("gpt3")) return "gpt";
  if (tail.startsWith("gpt") || tail.startsWith("chatgpt")) return "gpt";

  // Gemini family
  if (tail.includes("gemini") || tail.includes("bard") || tail.includes("palm")) return "gemini";

  // DeepSeek family
  if (tail.includes("deepseek") || tail.startsWith("ds-")) return "deepseek";

  // Llama family
  if (tail.includes("llama") || tail.includes("meta-")) return "llama";

  // Qwen family
  if (tail.includes("qwen") || tail.includes("qwq")) return "qwen";

  // Mistral family
  if (tail.includes("mistral") || tail.includes("mixtral") || tail.includes("codestral")) return "mistral";

  // Grok family
  if (tail.includes("grok") || id.startsWith("xai/")) return "grok";

  // Cohere family
  if (tail.includes("command-r") || tail.includes("cohere") || tail.startsWith("command-")) return "cohere";

  // Perplexity family
  if (tail.includes("perplexity") || tail.includes("sonar") || tail.startsWith("pplx")) return "perplexity";

  return "other";
}

// groupModels mengelompokkan list model jadi struktur yang siap di-render.
// Output sudah ter-sort: kategori berdasarkan `order`, model dalam kategori
// alfabetis berdasarkan nama display (atau id kalau tidak ada nama).
export interface GroupedModel {
  category: ModelCategory;
  models: { id: string; displayName?: string }[];
}

export function groupModels(
  models: { id: string; displayName?: string; name?: string }[]
): GroupedModel[] {
  const grouped = new Map<string, { id: string; displayName?: string }[]>();

  for (const m of models) {
    if (!m || !m.id) continue;
    const cat = categorizeModel(m.id);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push({
      id: m.id,
      displayName: m.displayName || m.name,
    });
  }

  // Sort tiap kategori berdasarkan skor kualitas (tinggi → rendah).
  // Tie-breaker: alfabetis ascending pada display name.
  const result: GroupedModel[] = [];
  grouped.forEach((ms, catId) => {
    const category = MODEL_CATEGORIES[catId] || MODEL_CATEGORIES.other;
    ms.sort((a: { id: string; displayName?: string }, b: { id: string; displayName?: string }) => {
      const scoreA = scoreModel(a.id);
      const scoreB = scoreModel(b.id);
      if (scoreA !== scoreB) return scoreB - scoreA;
      const aN = (a.displayName || a.id).toLowerCase();
      const bN = (b.displayName || b.id).toLowerCase();
      return aN.localeCompare(bN);
    });
    result.push({ category, models: ms });
  });

  result.sort((a, b) => a.category.order - b.category.order);
  return result;
}

// formatModelDisplayName menghapus prefix provider (mis. `cc/`, `openai/`)
// supaya nama model di UI lebih bersih. Kalau caller mau full ID, akses
// `model.id` langsung.
export function formatModelDisplayName(modelId: string): string {
  if (!modelId) return modelId;
  const slashIdx = modelId.indexOf("/");
  if (slashIdx > 0 && slashIdx < modelId.length - 1) {
    return modelId.slice(slashIdx + 1);
  }
  return modelId;
}

// ─────────────────────────────────────────────────────────────────────
// Quality Ranking
//
// Model dalam tiap family di-sort berdasarkan kualitas/kemampuan.
// Skor lebih tinggi = lebih bagus. Urutan ditentukan dengan heuristic:
// - Tier name (opus > sonnet > haiku, large > medium > small, etc.)
// - Version number (4.7 > 4.6, 3.5 > 3.0, dll)
// - Modifier (-thinking, -reasoning > biasa)
// - Recency hint (date di nama mis. "20251101")
//
// Skor 0-100. Model tidak ke-match kategori dapat skor 50 (netral).
// ─────────────────────────────────────────────────────────────────────

interface QualityHint {
  pattern: RegExp;
  base: number;
  reason?: string;
}

// Pattern urut: pertama-cocok yang berlaku. Skor base + bonus version.
const QUALITY_HINTS: QualityHint[] = [
  // ──── Claude family ────
  { pattern: /claude.*opus/i, base: 95 },
  { pattern: /claude.*sonnet/i, base: 80 },
  { pattern: /claude.*haiku/i, base: 60 },

  // ──── OpenAI o-series (reasoning) — cek dulu sebelum gpt ────
  { pattern: /^o4/i, base: 95 },
  { pattern: /^o3(-mini)?/i, base: 90 },
  { pattern: /^o1(-preview)?$/i, base: 92 },
  { pattern: /^o1-/i, base: 85 },

  // ──── OpenAI GPT ────
  { pattern: /gpt-4(\.5|o)?(-turbo)?/i, base: 88 },
  { pattern: /gpt-4-/i, base: 78 },
  { pattern: /gpt-3\.5/i, base: 50 },
  { pattern: /chatgpt/i, base: 70 },

  // ──── Gemini ────
  { pattern: /gemini-?2(\.0|\.5)?-?(pro|ultra)/i, base: 90 },
  { pattern: /gemini-?2/i, base: 85 },
  { pattern: /gemini-?1\.5-?pro/i, base: 80 },
  { pattern: /gemini-?1\.5/i, base: 70 },
  { pattern: /gemini.*flash/i, base: 65 },

  // ──── DeepSeek ────
  { pattern: /deepseek.*r1/i, base: 90 },
  { pattern: /deepseek.*v3/i, base: 85 },
  { pattern: /deepseek.*coder/i, base: 75 },
  { pattern: /deepseek/i, base: 70 },

  // ──── Llama ────
  { pattern: /llama-?4/i, base: 85 },
  { pattern: /llama-?3\.3/i, base: 80 },
  { pattern: /llama-?3\.2/i, base: 75 },
  { pattern: /llama-?3/i, base: 70 },
  { pattern: /llama-?2/i, base: 50 },

  // ──── Qwen ────
  { pattern: /qwq/i, base: 85 },
  { pattern: /qwen-?3/i, base: 85 },
  { pattern: /qwen-?2\.5/i, base: 78 },
  { pattern: /qwen-?2/i, base: 70 },

  // ──── Mistral ────
  { pattern: /mistral.*large/i, base: 82 },
  { pattern: /mixtral.*8x22b/i, base: 80 },
  { pattern: /mixtral/i, base: 70 },
  { pattern: /codestral/i, base: 75 },
  { pattern: /mistral/i, base: 65 },

  // ──── Grok ────
  { pattern: /grok-?3/i, base: 88 },
  { pattern: /grok-?2/i, base: 78 },
  { pattern: /grok/i, base: 70 },

  // ──── Cohere ────
  { pattern: /command-r-plus/i, base: 80 },
  { pattern: /command-r/i, base: 70 },

  // ──── Perplexity ────
  { pattern: /sonar.*pro/i, base: 80 },
  { pattern: /sonar/i, base: 70 },
];

// extractVersionBonus pulls version-like numbers and recency hints out
// of the ID and returns a small bonus. Example:
//   "claude-opus-4.7"        → 4.7  → +4.7
//   "claude-opus-4-7"        → 4.7  → +4.7  (treats `-` between digits
//                                            as decimal point fallback)
//   "claude-opus-4-5-20251101" → +4.5 + recency bonus
function extractVersionBonus(id: string): number {
  let bonus = 0;

  // Decimal version (X.Y) — biggest signal
  const decimal = id.match(/(\d+)\.(\d+)/);
  if (decimal) {
    bonus += parseFloat(`${decimal[1]}.${decimal[2]}`);
  } else {
    // Hyphen-separated version like "4-7" → treat as 4.7 (only 1-digit
    // after hyphen to avoid grabbing dates).
    const hyphen = id.match(/-(\d+)-(\d)(?!\d)/);
    if (hyphen) {
      bonus += parseFloat(`${hyphen[1]}.${hyphen[2]}`);
    }
  }

  // Recency: a YYYYMMDD-style date in the ID adds a tiny bonus.
  // Newer date = higher (we just use last 4 digits as a rough sort key).
  const date = id.match(/(\d{8})/);
  if (date) {
    const num = parseInt(date[1], 10);
    bonus += Math.min(num / 1e9, 1); // cap at +1
  }

  return bonus;
}

// scoreModel returns a number where higher = better quality. Always
// finite. Used to sort within a family.
export function scoreModel(modelId: string): number {
  const id = (modelId || "").toLowerCase();
  if (!id) return 0;

  // Strip provider prefix (cc/, kr/, anthropic/, dll) supaya pattern
  // match konsisten dengan ID asli (Claude bisa muncul sebagai
  // "kr/claude-opus-4.7" maupun "cc/claude-opus-4-7").
  const slashIdx = id.indexOf("/");
  const tail = slashIdx >= 0 && slashIdx < id.length - 1 ? id.slice(slashIdx + 1) : id;

  for (const hint of QUALITY_HINTS) {
    if (hint.pattern.test(tail)) {
      return hint.base + extractVersionBonus(tail);
    }
  }
  return 50; // netral
}

// ─────────────────────────────────────────────────────────────────────
// Capability Detection
//
// Mendeteksi kemampuan model dari ID-nya pakai regex heuristic. Hasilnya
// dipakai oleh halaman /models untuk render badge (vision, reasoning,
// tools, long-context, audio, code, fast, multilingual).
//
// Pure heuristic — tidak ada I/O, tidak ada side effect. Kalau model ID
// baru muncul yang belum ke-cover, tinggal tambahin pattern di list yang
// sesuai.
// ─────────────────────────────────────────────────────────────────────

export type Capability =
  | "vision"        // can read images
  | "reasoning"     // chain-of-thought / thinking
  | "tools"         // function calling
  | "long-context"  // > 100k context window
  | "audio"         // speech in/out
  | "code"          // strong code generation
  | "fast"          // optimized for low latency / small / cheap
  | "multilingual"; // strong non-English support

export interface ModelCapabilities {
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
  longContext: boolean;
  audio: boolean;
  code: boolean;
  fast: boolean;
  multilingual: boolean;
}

const VISION_PATTERNS: RegExp[] = [
  /vision/i, /\b4o\b/i, /gpt-4-turbo/i, /gpt-4\.\d/i, /gpt-5/i,
  /claude-3/i, /claude-opus/i, /claude-sonnet/i, /claude-haiku/i,
  /gemini-(1\.5|2|pro|flash|ultra)/i,
  /llava/i, /pixtral/i, /llama-3\.2-(11|90)b/i, /llama-4/i,
  /qwen.*vl/i, /qwen2\.5-vl/i, /qwen3-vl/i,
  /grok-(2|3|4)/i, /grok-vision/i,
  /deepseek.*vl/i, /internvl/i, /minicpm.*v/i,
];

const REASONING_PATTERNS: RegExp[] = [
  /\bo1\b/i, /\bo3\b/i, /\bo4\b/i, /reasoning/i, /thinking/i,
  /-r1\b/i, /\br1-/i, /deepseek-r/i, /qwq/i,
  /opus-4/i, /sonnet-4/i, /sonnet-3\.7/i,
  /grok-4/i, /grok.*think/i,
];

const TOOLS_PATTERNS: RegExp[] = [
  // Most modern frontier models support tools. Match conservatively.
  /gpt-(4|5|4o)/i, /claude-(3|opus|sonnet|haiku)/i, /claude-4/i,
  /gemini-(1\.5|2|pro|flash)/i,
  /mistral-(large|small|medium)/i, /mixtral/i,
  /llama-3\.[123]/i, /llama-4/i,
  /qwen2\.5/i, /qwen3/i,
  /command-r/i, /grok-(2|3|4)/i,
];

const LONG_CONTEXT_PATTERNS: RegExp[] = [
  /128k/i, /200k/i, /1m/i, /2m/i,
  /gpt-4-turbo/i, /gpt-4o/i, /gpt-4\.\d/i, /gpt-5/i,
  /claude-(3|opus|sonnet|haiku|4)/i,
  /gemini-(1\.5|2)/i, // 1M+ context
  /llama-3\.[123]/i, /llama-4/i,
  /qwen2\.5/i, /qwen3/i,
  /command-r-plus/i,
];

const AUDIO_PATTERNS: RegExp[] = [
  /audio/i, /whisper/i, /tts/i, /voice/i,
  /4o-audio/i, /4o-realtime/i, /gpt-4o-audio/i,
  /gemini.*live/i, /gemini-2\.\d-flash/i,
];

const CODE_PATTERNS: RegExp[] = [
  /code/i, /coder/i, /codex/i,
  /claude-(3\.5|3\.7|4)-sonnet/i, /claude-opus-4/i,
  /qwen2\.5-coder/i, /qwen3-coder/i, /deepseek-coder/i, /deepseek-v[23]/i,
  /codestral/i, /starcoder/i, /granite-code/i,
  /gpt-(4|5|4o)/i,
];

const FAST_PATTERNS: RegExp[] = [
  /haiku/i, /flash/i, /mini/i, /nano/i, /turbo/i,
  /\b8b\b/i, /\b3b\b/i, /\b1b\b/i, /\b1\.5b\b/i, /\b0\.5b\b/i,
  /-light/i, /-small/i, /lite/i,
];

const MULTILINGUAL_PATTERNS: RegExp[] = [
  /qwen/i, /command-r/i, /aya/i, /sea-?lion/i, /llama-3\.[123]/i,
  /gemini/i, /gpt-4o/i, /gpt-5/i, /claude-(3|opus|sonnet|haiku|4)/i,
  /mistral/i, /yi/i, /glm/i, /deepseek/i,
];

export function detectCapabilities(modelId: string): ModelCapabilities {
  const id = String(modelId || "");
  const test = (patterns: RegExp[]) => patterns.some((re) => re.test(id));

  return {
    vision: test(VISION_PATTERNS),
    reasoning: test(REASONING_PATTERNS),
    tools: test(TOOLS_PATTERNS),
    longContext: test(LONG_CONTEXT_PATTERNS),
    audio: test(AUDIO_PATTERNS),
    code: test(CODE_PATTERNS),
    fast: test(FAST_PATTERNS),
    multilingual: test(MULTILINGUAL_PATTERNS),
  };
}

// CapabilityMeta maps capability key → display info untuk UI badge.
// Icon name mengacu ke lucide-react (di-resolve di komponen page).
export interface CapabilityMeta {
  key: Capability;
  label: string;
  description: string;
  icon: string;     // lucide-react icon name (the page resolves it)
  color: string;    // tailwind color token
}

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  vision: {
    key: "vision",
    label: "Vision",
    description: "Bisa membaca dan menganalisis gambar yang Anda kirim",
    icon: "Eye",
    color: "blue",
  },
  reasoning: {
    key: "reasoning",
    label: "Reasoning",
    description: "Mode berpikir bertahap untuk soal kompleks (matematika, logika, kode)",
    icon: "Brain",
    color: "purple",
  },
  tools: {
    key: "tools",
    label: "Tool Calling",
    description: "Mendukung function calling untuk integrasi tools eksternal",
    icon: "Wrench",
    color: "amber",
  },
  "long-context": {
    key: "long-context",
    label: "Long Context",
    description: "Context window besar (100k+ token) untuk dokumen panjang",
    icon: "Layers",
    color: "emerald",
  },
  audio: {
    key: "audio",
    label: "Audio",
    description: "Mendukung input/output suara",
    icon: "Mic",
    color: "rose",
  },
  code: {
    key: "code",
    label: "Code",
    description: "Performa tinggi untuk pemrograman dan debugging",
    icon: "Code",
    color: "cyan",
  },
  fast: {
    key: "fast",
    label: "Fast",
    description: "Latensi rendah dan biaya murah, cocok untuk task ringan",
    icon: "Zap",
    color: "yellow",
  },
  multilingual: {
    key: "multilingual",
    label: "Multilingual",
    description: "Performa bagus di banyak bahasa termasuk Bahasa Indonesia",
    icon: "Languages",
    color: "indigo",
  },
};

// getActiveCapabilities returns daftar capability yang aktif untuk model
// tertentu, sesuai urutan deklarasi di tipe Capability.
export function getActiveCapabilities(modelId: string): Capability[] {
  const caps = detectCapabilities(modelId);
  const out: Capability[] = [];
  if (caps.vision) out.push("vision");
  if (caps.reasoning) out.push("reasoning");
  if (caps.tools) out.push("tools");
  if (caps.longContext) out.push("long-context");
  if (caps.audio) out.push("audio");
  if (caps.code) out.push("code");
  if (caps.fast) out.push("fast");
  if (caps.multilingual) out.push("multilingual");
  return out;
}
