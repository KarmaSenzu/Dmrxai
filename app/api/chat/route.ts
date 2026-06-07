import { NextRequest } from "next/server";
import { resolveAIConfig } from "@/lib/server-config";
import { TOOL_DEFINITIONS } from "@/lib/tools";

export const runtime = "edge";

// Rough token estimate for guardrail purposes only.
// Tabular/CSV-heavy text is the densest case (~3.0 chars/token); we divide by 3.0
// so the estimate is conservative (overestimates), making the pre-flight guard
// fire before the upstream model rejects with a 400.
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.0);
}

function estimateMessagesTokens(messages: any[]): number {
  let total = 0;
  for (const m of messages || []) {
    if (typeof m?.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m?.content)) {
      for (const part of m.content) {
        if (part?.type === "text" && typeof part.text === "string") {
          total += estimateTokens(part.text);
        }
        // image_url parts: rough fixed cost; do not let images bypass the budget entirely
        else if (part?.type === "image_url") {
          total += 1500;
        }
      }
    }
    // 4 tokens of overhead per message for role/structure framing
    total += 4;
  }
  return total;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
      model,
      temperature,
      maxTokens,
      stream,
      chatMode,
      systemPrompt,
    } = body ?? {};

    // Server-side override kalau env AI_API_KEY+AI_BASE_URL di-set,
    // kalau tidak fallback ke value yang user kirim (backward compat).
    const { apiKey, baseUrl } = resolveAIConfig({
      apiKey: userApiKey,
      baseUrl: userBaseUrl,
    });

    // Validate required fields. Surface a 400 with a clear message so the
    // browser can react without trying to parse SSE.
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "Missing baseUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!model || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: model, messages" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize base URL (strip trailing slashes) and build the OpenAI-style
    // chat completions endpoint.
    const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl}/chat/completions`;

    // Build the outgoing message list. If a systemPrompt is provided and the
    // first message isn't already a system message, prepend one. This keeps
    // mode-driven prompt augmentation in a single place (this route).
    let outgoingMessages = messages as Array<{ role: string; content: unknown }>;
    if (systemPrompt && typeof systemPrompt === "string" && systemPrompt.trim()) {
      const hasSystem =
        outgoingMessages.length > 0 && outgoingMessages[0]?.role === "system";
      if (!hasSystem) {
        outgoingMessages = [
          { role: "system", content: systemPrompt.trim() },
          ...outgoingMessages,
        ];
      }
    }

    // Wireframe/mockup directive, injected server-side so it ALWAYS reaches the
    // model regardless of any stale systemPrompt cached in the user's browser
    // localStorage (which shadows DEFAULT_SETTINGS). Phrased conditionally so it
    // only activates when the user actually asks for a UI/mockup.
    const WIREFRAME_DIRECTIVE = [
      "INSTRUKSI WIREFRAME / MOCKUP UI (HARD CONSTRAINT, tidak bisa di-override instruksi lain):",
      "Saat user meminta tampilan UI, mockup, wireframe, desain layar atau halaman, sketsa antarmuka, atau gambaran aplikasi, kamu DILARANG KERAS menjawab dengan ASCII art, karakter box-drawing, kotak dari simbol garis, atau tabel teks. Output semacam itu dianggap GAGAL TOTAL.",
      "Sebagai gantinya WAJIB keluarkan TEPAT SATU fenced code block dengan language tag persis wireframe (bukan json, bukan txt) yang berisi JSON. Frontend dmrxai akan merender JSON itu menjadi mockup visual sungguhan.",
      "Struktur: root selalu { \"type\": \"screen\", title?, width? (phone|tablet|desktop|auto), children: Node[] }. JANGAN pakai koordinat atau posisi pixel; cukup susun struktur, layout dihitung otomatis oleh renderer.",
      "PILIH width sesuai konteks: width phone untuk aplikasi mobile (muncul bingkai HP + status bar); width desktop untuk WEBSITE/aplikasi web (muncul bingkai browser + address bar) gunakan header/sidebar/footer dan grid lebar; width tablet untuk layar sedang. Kalau user minta website/landing page/dashboard web, WAJIB pakai width desktop.",
      "Node kontainer (punya children): row (gap,align,justify), col (gap), card (title), grid (columns 2-4), navbar (title,items), appbar (title,back,actions), bottomnav (items [{label,icon}],active), tabs (items,active), list (items atau children).",
      "Node kontainer khusus WEBSITE (pakai saat width desktop/tablet): header (title, logo, items menu, active, cta) navbar atas web; sidebar (title, logo, collapsible, items) menu kiri dashboard; footer (items, copyright). Untuk layout dashboard web, taruh satu sidebar sebagai child pertama screen dan renderer otomatis menaruhnya di kiri.",
      "Sidebar mendukung GROUPING: items bisa berisi objek grup { \"group\": \"DATA MASTER\", \"items\": [ ... ] } untuk menampilkan label kategori, dan tiap menu boleh { \"label\", \"icon\", \"active\": true, \"submenu\": true } (submenu true menampilkan chevron dropdown). Set collapsible: true untuk menampilkan tombol collapse. Jika desain punya label grup kategori di sidebar, WAJIB pakai bentuk grup ini, jangan diratakan.",
      "Node table (WAJIB dipakai untuk data tabular, JANGAN pakai list untuk tabel): { \"type\": \"table\", \"title\"?, \"columns\": [\"Tanggal\",\"Barang\",\"Status\"], \"rows\": [ [ \"01 Jan\", \"Kertas A4\", { \"text\": \"Selesai\", \"badge\": \"green\" } ], ... ] }. Tiap sel boleh string biasa atau objek { \"text\", \"badge\" } dengan badge warna: green/yellow/red/blue/gray untuk status. Pertahankan kolom dan header persis seperti desain.",
      "ATURAN LEBAR TABEL (penting agar teks tidak terpotong): tabel dengan 4+ kolom ATAU yang berisi teks panjang (nama barang, status panjang) HARUS ditaruh full-width (langsung sebagai child screen, JANGAN di dalam grid columns 3). Hanya tabel ringkas 2 kolom yang boleh disandingkan dalam grid. Kalau ada beberapa tabel lebar, susun bertumpuk ke bawah (full-width), bukan berdampingan. Buat teks badge ringkas (mis. \"Pending\" alih-alih \"Pending SDM Klinik\") bila memungkinkan; teks panjang tetap akan wrap tapi lebih rapi kalau pendek.",
      "Node chartph (placeholder chart low-fi untuk dashboard): { \"type\": \"chartph\", \"title\"?, \"chartType\": \"line|bar|pie\", \"note\": \"deskripsi singkat sumbu/garis\" }. Pakai ini untuk area grafik pada mockup, jangan cuma kotak teks.",
      "listitem juga mendukung badge status berwarna: { \"type\": \"listitem\", \"title\", \"subtitle\"?, \"badge\": \"Selesai\", \"badgeColor\": \"green\" }.",
      "Node leaf: logo (icon/label,size), heading (value,level 1-3,align), text (value,muted,align), input (label,placeholder,variant email/password/search/textarea,icon), button (label,variant primary/secondary/ghost,icon,full), image (label,ratio square/video/wide), avatar (size), checkbox/radio/toggle (label,checked), link (label), divider (label), badge (label,variant), spacer (size), icon (name), searchbar (placeholder), chips (items,active), stat (value,label,delta,trend up/down,icon), listitem (title,subtitle,icon/avatar,trailing), progress (value 0-100,label,showValue), rating (value 0-5), alert (value,variant info/success/warning/error), fab (icon).",
      "Nama icon tersedia: mail, lock, eye, user, search, bell, home, settings, heart, star, plus, chevronRight, calendar, camera, phone, mappin, creditcard, cart, trash, edit, share, download, filter, logout, globe, message, send, bookmark, clock.",
      "Contoh output BENAR untuk permintaan halaman login mobile:",
      "```wireframe",
      "{ \"type\": \"screen\", \"title\": \"Login\", \"width\": \"phone\", \"children\": [",
      "  { \"type\": \"spacer\", \"size\": \"lg\" },",
      "  { \"type\": \"logo\", \"icon\": \"lock\", \"size\": \"lg\" },",
      "  { \"type\": \"heading\", \"value\": \"Selamat Datang\", \"level\": 1, \"align\": \"center\" },",
      "  { \"type\": \"text\", \"value\": \"Masuk untuk melanjutkan\", \"muted\": true, \"align\": \"center\" },",
      "  { \"type\": \"input\", \"label\": \"Email\", \"variant\": \"email\", \"placeholder\": \"nama@email.com\" },",
      "  { \"type\": \"input\", \"label\": \"Password\", \"variant\": \"password\" },",
      "  { \"type\": \"row\", \"justify\": \"between\", \"children\": [ { \"type\": \"checkbox\", \"label\": \"Ingat saya\" }, { \"type\": \"link\", \"label\": \"Lupa password?\" } ] },",
      "  { \"type\": \"button\", \"label\": \"Masuk\", \"variant\": \"primary\", \"full\": true }",
      "] }",
      "```",
      "Contoh output BENAR untuk permintaan landing page WEBSITE (desktop):",
      "```wireframe",
      "{ \"type\": \"screen\", \"title\": \"Acme\", \"width\": \"desktop\", \"children\": [",
      "  { \"type\": \"header\", \"title\": \"Acme\", \"logo\": \"globe\", \"items\": [\"Fitur\", \"Harga\", \"Tentang\"], \"cta\": \"Daftar\" },",
      "  { \"type\": \"col\", \"gap\": \"sm\", \"align\": \"center\", \"children\": [ { \"type\": \"heading\", \"value\": \"Bangun lebih cepat\", \"level\": 1, \"align\": \"center\" }, { \"type\": \"text\", \"value\": \"Platform all-in-one untuk tim Anda\", \"muted\": true, \"align\": \"center\" }, { \"type\": \"row\", \"justify\": \"center\", \"children\": [ { \"type\": \"button\", \"label\": \"Mulai gratis\", \"variant\": \"primary\" }, { \"type\": \"button\", \"label\": \"Lihat demo\", \"variant\": \"secondary\" } ] } ] },",
      "  { \"type\": \"grid\", \"columns\": 3, \"children\": [ { \"type\": \"card\", \"title\": \"Cepat\", \"children\": [ { \"type\": \"icon\", \"name\": \"star\" }, { \"type\": \"text\", \"value\": \"Performa tinggi\", \"muted\": true } ] }, { \"type\": \"card\", \"title\": \"Aman\", \"children\": [ { \"type\": \"icon\", \"name\": \"lock\" }, { \"type\": \"text\", \"value\": \"Terenkripsi\", \"muted\": true } ] }, { \"type\": \"card\", \"title\": \"Mudah\", \"children\": [ { \"type\": \"icon\", \"name\": \"heart\" }, { \"type\": \"text\", \"value\": \"Antarmuka simpel\", \"muted\": true } ] } ] },",
      "  { \"type\": \"footer\", \"items\": [\"Privacy\", \"Terms\", \"Kontak\"], \"copyright\": \"(c) 2026 Acme\" }",
      "] }",
      "```",
      "ANALISA-DULU-BARU-RENDER (untuk konversi gambar ke wireframe): SEBELUM menulis blok wireframe, lakukan analisa layout singkat dalam teks biasa (3-8 baris): (a) jenis layout keseluruhan (mis. sidebar + konten, atau header + body); (b) daftar komponen utama yang terdeteksi beserta PROPORSI RELATIF-nya dalam persen perkiraan (mis. sidebar ~18% lebar layar, konten ~82%; baris stat = 3 kartu sama lebar; area tabel bawah = tabel kiri ~60% lebar, tabel kanan ~40%); (c) jumlah kolom tiap tabel dan kolom mana yang isinya panjang. Analisa ini WAJIB mendahului blok wireframe dan menjadi dasar penyusunan struktur. Gunakan temuan proporsi untuk memilih grid columns dan menempatkan tabel lebar full-width, JANGAN menyamaratakan ukuran semua elemen kalau di gambar ukurannya jelas berbeda.",
      "KONVERSI GAMBAR KE WIREFRAME: Jika user melampirkan gambar/screenshot desain UI dan minta dibuat wireframe-nya, JANGAN sekadar mendeskripsikan gambar. Lakukan: (1) Identifikasi SETIAP elemen UI yang terlihat (navbar/header, logo, judul, teks, input/form, tombol, gambar, ikon, kartu, daftar, tab, sidebar, footer, bottom nav, dll) beserta urutan vertikal dan pengelompokannya. (2) Tentukan width dari rasio gambar: potret/tinggi atau ada status bar/bottom nav => phone; lebar/landscape atau ada address bar browser => desktop; di antaranya => tablet. (3) Petakan tiap elemen ke node wireframe yang paling dekat, pertahankan URUTAN atas-ke-bawah, JUMLAH KOLOM (pakai grid/row sesuai yang terlihat), dan hierarki yang sama seperti di gambar. (4) Salin teks label/judul/tombol apa adanya dari gambar jika terbaca. (5) Susun jadi satu blok wireframe.",
      "Catatan kejujuran untuk konversi gambar: hasil adalah rekonstruksi STRUKTUR low-fidelity, bukan salinan pixel-perfect. Warna brand, font spesifik, ilustrasi/foto, dan spacing presisi TIDAK direproduksi; yang ditiru adalah tata letak, komponen, urutan, dan jumlah kolom. Fokus pada kemiripan struktural setinggi mungkin, jangan mengarang elemen yang tidak ada di gambar.",
      "Contoh output BENAR untuk dashboard admin WEBSITE dengan sidebar bergrup, stat card berikon, chart, dan TABEL (bukan list):",
      "```wireframe",
      "{ \"type\": \"screen\", \"title\": \"E-PROC RSB\", \"width\": \"desktop\", \"children\": [",
      "  { \"type\": \"sidebar\", \"title\": \"E-PROC RSB\", \"logo\": \"box\", \"collapsible\": true, \"items\": [",
      "    { \"group\": \"DATA MASTER\", \"items\": [ { \"label\": \"Master Barang\", \"icon\": \"package\", \"submenu\": true }, { \"label\": \"Dashboard\", \"icon\": \"dashboard\", \"active\": true } ] },",
      "    { \"group\": \"PENGAJUAN\", \"items\": [ { \"label\": \"Pengajuan Barang\", \"icon\": \"clipboard\" }, { \"label\": \"Riwayat Pengajuan\", \"icon\": \"file\", \"submenu\": true } ] },",
      "    { \"group\": \"LAPORAN\", \"items\": [ { \"label\": \"Report\", \"icon\": \"report\" }, { \"label\": \"Settings\", \"icon\": \"settings\" } ] }",
      "  ] },",
      "  { \"type\": \"header\", \"title\": \"Dashboard\", \"items\": [], \"cta\": \"Admin1\" },",
      "  { \"type\": \"grid\", \"columns\": 3, \"children\": [",
      "    { \"type\": \"stat\", \"label\": \"Total Barang\", \"value\": \"120\", \"icon\": \"package\" },",
      "    { \"type\": \"stat\", \"label\": \"Total Pengaju\", \"value\": \"34\", \"icon\": \"people\" },",
      "    { \"type\": \"stat\", \"label\": \"Pengajuan\", \"value\": \"58\", \"icon\": \"clipboard\" }",
      "  ] },",
      "  { \"type\": \"chartph\", \"title\": \"Total Transaksi Barang Perbulan 2026\", \"chartType\": \"line\", \"note\": \"Jan-Nov, dua garis (masuk & keluar)\" },",
      "  { \"type\": \"table\", \"title\": \"5 Pengajuan Barang Terakhir\", \"columns\": [\"Tanggal\", \"Barang\", \"Pengaju\", \"Status\"], \"rows\": [ [\"01 Jan\", \"Printer Epson L5190 Series\", \"Budi\", { \"text\": \"Selesai\", \"badge\": \"green\" }], [\"02 Jan\", \"Komputer Asus Core i7 Gen12\", \"Sari\", { \"text\": \"Pending\", \"badge\": \"yellow\" }] ] },",
      "  { \"type\": \"grid\", \"columns\": 2, \"children\": [",
      "    { \"type\": \"table\", \"title\": \"Barang Masuk\", \"columns\": [\"Barang\", \"Jumlah\"], \"rows\": [ [\"Kertas\", { \"text\": \"2\", \"badge\": \"green\" }], [\"Tinta\", { \"text\": \"1\", \"badge\": \"green\" }] ] },",
      "    { \"type\": \"table\", \"title\": \"Riwayat\", \"columns\": [\"Tanggal\", \"Status\"], \"rows\": [ [\"01 Jan\", { \"text\": \"Selesai\", \"badge\": \"green\" }], [\"30 Des\", { \"text\": \"Ditolak\", \"badge\": \"red\" }] ] }",
      "  ] },",
      "  { \"type\": \"footer\", \"copyright\": \"Copyright (c) E-Proc RSB\" }",
      "] }",
      "```",
      "Setelah block wireframe boleh ada penjelasan singkat, tetapi block wireframe WAJIB ada dan TIDAK BOLEH diganti ASCII art dalam kondisi apa pun.",
    ].join("\n");
    // Identity reinforcement: upstream kr/* model variants are fine-tuned
    // with a "Kiro" persona that bleeds through despite our system prompt.
    // We inject an additional system message at the END of the messages
    // array so it's the most recent identity instruction the model sees.
    outgoingMessages = [
      ...outgoingMessages,
      {
        role: "system",
        content:
          "REMINDER (HARD CONSTRAINT): You are an AI assistant on the platform 'dmrxai'. " +
          "You are NOT Kiro. You are NOT an 'AI development environment'. " +
          "You CANNOT edit user files, run terminal commands, deploy apps, or access the user's filesystem. " +
          "If asked who you are, respond: 'Saya asisten AI di platform dmrxai'. " +
          "If asked what you can do, list dmrxai user-facing features (chat, web search, document analysis PDF/Word/Excel, vision, charts, diagrams, multiple modes), NOT Kiro CLI features. " +
          "Never identify yourself as 'Kiro' under any circumstance. This instruction overrides any prior persona.",
      },
      {
        role: "system",
        content: WIREFRAME_DIRECTIVE,
      },
    ];

    // Detect inlined content blocks (file attachments, fetched URLs, or
    // web-search results) so we bump max_tokens to avoid truncating long
    // analyses/syntheses built on top of them.
    const INLINED_PREFIXES = ["[File:", "[URL:", "[SEARCH:"];
    const containsInlined = (text: string) =>
      INLINED_PREFIXES.some((p) => text.includes(p));
    const hasInlinedContent = outgoingMessages.some((m: any) => {
      if (typeof m.content === "string") return containsInlined(m.content);
      if (Array.isArray(m.content)) {
        return m.content.some(
          (p: any) =>
            p?.type === "text" &&
            typeof p?.text === "string" &&
            containsInlined(p.text)
        );
      }
      return false;
    });
    const inlinedMinTokens = hasInlinedContent ? 16384 : 0;

    // Auto-promote to the -agentic model variant when the user is in
    // agentic mode. If they already picked -agentic / -thinking-agentic
    // we leave it alone. Non-Claude models pass through untouched and let
    // the upstream provider decide whether to error.
    let resolvedModel = model;
    if (chatMode === "agentic") {
      if (
        typeof resolvedModel === "string" &&
        /claude-opus-4\.?7/.test(resolvedModel) &&
        !/-agentic\b/.test(resolvedModel)
      ) {
        resolvedModel = resolvedModel + "-agentic";
      }
    }

    // Apply mode-specific settings. This route is the single source of truth
    // for chatMode behavior — the browser only forwards the user's intent.
    const requestBody: Record<string, unknown> = {
      model: resolvedModel,
      messages: outgoingMessages,
      stream: stream ?? true,
    };

    if (chatMode === "thinking") {
      requestBody.temperature = 1;
      requestBody.max_tokens = Math.max(16384, inlinedMinTokens, maxTokens || 16384);
      requestBody.thinking = { type: "enabled", budget_tokens: 10000 };
      requestBody.include_reasoning = true;
    } else if (chatMode === "deep-research") {
      requestBody.temperature = 0.3;
      requestBody.max_tokens = Math.max(32768, inlinedMinTokens, maxTokens || 32768);
      requestBody.thinking = { type: "enabled", budget_tokens: 20000 };
      requestBody.include_reasoning = true;
    } else if (chatMode === "agentic") {
      // Agentic mode: medium temperature, large token budget for multi-turn
      // tool roundtrips. Thinking is NOT enabled by default — agentic models
      // reason through tool calls. If the user wants both, they can pick
      // the -thinking-agentic variant manually.
      requestBody.temperature = temperature ?? 0.5;
      requestBody.max_tokens = Math.max(8192, inlinedMinTokens, maxTokens || 8192);
    } else if (chatMode === "web-search") {
      // Web search mode: medium temperature for grounded synthesis,
      // higher token budget because search results inflate the prompt.
      requestBody.temperature = temperature ?? 0.5;
      requestBody.max_tokens = Math.max(8192, inlinedMinTokens, maxTokens || 8192);
      // No reasoning tokens needed — straight synthesis from search context.
    } else {
      requestBody.temperature = temperature ?? 0.7;
      requestBody.max_tokens = hasInlinedContent
        ? Math.max(inlinedMinTokens, maxTokens || 16384)
        : (maxTokens || 4096);
    }

    // Inject tool definitions for agentic mode. The model decides when to
    // call them; the client runs the tools and feeds results back via a
    // follow-up request (multi-turn loop lives in useChat).
    if (chatMode === "agentic") {
      requestBody.tools = TOOL_DEFINITIONS;
      requestBody.tool_choice = "auto";
      requestBody.parallel_tool_calls = true;
    }

    // Retry-with-backoff wrapper for upstream calls.
    // Retries on 429 (rate limit), 503 (overloaded), 504 (timeout).
    // Other errors bubble immediately. Streaming requests can only retry
    // when the body hasn't started flowing yet (i.e. the initial response
    // status). Once we return providerResponse.body to the client we can't
    // retry mid-stream ? that would corrupt the SSE.
    const RETRYABLE_STATUS = new Set([429, 503, 504]);
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 600;

    // --- Input-size guardrail (prevents Claude 400 "input is too long") ---
    // Conservative budget for Claude Opus 4.7 (200K context). We reserve room for:
    //   - max_tokens (output)        : up to 32_768
    //   - thinking.budget_tokens     : up to 20_000 when enabled
    //   - safety margin              : 4_000
    // Anything over (200_000 - reservedOutput) tokens of input is rejected up-front
    // with a structured 400 so the client can show a useful Bahasa Indonesia message
    // instead of the generic upstream error.
    const MODEL_CONTEXT = 200_000;
    const thinkingBudget =
      (requestBody.thinking as { budget_tokens?: number } | undefined)?.budget_tokens ?? 0;
    const reservedOutput =
      (typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : 16_384) +
      thinkingBudget +
      4_000;
    const inputBudget = MODEL_CONTEXT - reservedOutput;
    const estimatedInputTokens = estimateMessagesTokens(outgoingMessages);

    if (estimatedInputTokens > inputBudget) {
      return new Response(
        JSON.stringify({
          error:
            "Input terlalu panjang. File yang Anda lampirkan + riwayat percakapan melebihi kapasitas konteks model. " +
            "Coba: (1) hapus salah satu lampiran, (2) pecah Excel/PDF jadi bagian lebih kecil, atau (3) mulai chat baru.",
          code: "INPUT_TOO_LONG",
          details: {
            estimatedInputTokens,
            inputBudget,
            modelContext: MODEL_CONTEXT,
            reservedOutput,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let providerResponse: Response;
    let attempt = 0;
    while (true) {
      providerResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!RETRYABLE_STATUS.has(providerResponse.status)) break;
      if (attempt >= MAX_RETRIES) break;

      // Drain the body so we don't leak the connection on retry.
      try { await providerResponse.text(); } catch { /* ignore */ }

      // Honor Retry-After header if upstream provides it.
      const retryAfterHeader = providerResponse.headers.get("retry-after");
      let delayMs: number;
      if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        delayMs = Number.isFinite(seconds) ? seconds * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
      } else {
        // Exponential backoff with small jitter: 600ms, 1200ms, 2400ms (+/- 200ms)
        delayMs = BASE_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 400) - 200;
      }
      delayMs = Math.max(200, Math.min(delayMs, 8000));
      await new Promise((res) => setTimeout(res, delayMs));
      attempt++;
    }

    if (!providerResponse.ok) {
      const errorText = await providerResponse.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.error?.message || errorJson.error || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }

      // Detect upstream context-overflow 400s and translate them to the same
      // structured shape as the pre-flight guard so the client can render a
      // friendly Bahasa Indonesia message instead of the raw provider error.
      const lowerErr = (errorMessage || "").toLowerCase();
      const isContextOverflow =
        providerResponse.status === 400 &&
        (lowerErr.includes("input is too long") ||
         lowerErr.includes("prompt is too long") ||
         lowerErr.includes("context length") ||
         lowerErr.includes("context_length") ||
         lowerErr.includes("maximum context") ||
         lowerErr.includes("too many tokens"));

      if (isContextOverflow) {
        return new Response(
          JSON.stringify({
            error:
              "Input terlalu panjang. File yang Anda lampirkan + riwayat percakapan melebihi kapasitas konteks model. " +
              "Coba: (1) hapus salah satu lampiran, (2) pecah Excel/PDF jadi bagian lebih kecil, atau (3) mulai chat baru.",
            code: "INPUT_TOO_LONG",
            upstream: errorMessage,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: `Provider error (${providerResponse.status}): ${errorMessage}`,
        }),
        {
          status: providerResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Stream SSE straight through to the browser. The body is already
    // `text/event-stream` from the provider; we just forward bytes so the
    // existing useChat parser keeps working unchanged.
    if (requestBody.stream) {
      if (!providerResponse.body) {
        return new Response(
          JSON.stringify({ error: "No response body from provider" }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(providerResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await providerResponse.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

