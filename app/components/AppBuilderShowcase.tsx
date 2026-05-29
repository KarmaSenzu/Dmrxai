"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * AppBuilderShowcase
 *
 * Showcase animasi murni dekoratif untuk fitur "AI App Builder" yang akan datang.
 * Konsepnya: seolah-olah seseorang sedang memakai dmrxai — sebuah prompt "diketik"
 * ke kotak chat, lalu AI "men-stream" kode, dan sebuah mockup HP menampilkan preview
 * aplikasi yang dibangun secara live. Animasi berjalan terus (loop).
 *
 * Tidak ada panggilan AI sungguhan — semuanya digerakkan oleh state machine
 * berbasis useEffect + setTimeout. SSR-safe (tidak menyentuh window di module scope),
 * dan menghormati prefers-reduced-motion (langsung tampilkan state akhir).
 */

type Phase = "idle" | "typing" | "streaming" | "rendered";

type CodeToken = { text: string; cls?: string };

const PROMPT = "Buatkan landing page produk kopi dengan tombol checkout";

// Warna ala syntax highlight untuk kesan "code editor".
const TAG = "text-sky-400";
const ATTR = "text-amber-300";
const STR = "text-emerald-400";
const TXT = "text-slate-300";

// Snippet JSX + Tailwind pendek namun realistis yang "ditulis" oleh AI.
const CODE_LINES: CodeToken[][] = [
  [
    { text: "<section", cls: TAG },
    { text: " className=", cls: ATTR },
    { text: '"hero"', cls: STR },
    { text: ">", cls: TAG },
  ],
  [
    { text: "  <span", cls: TAG },
    { text: " className=", cls: ATTR },
    { text: '"badge"', cls: STR },
    { text: ">", cls: TAG },
    { text: "Promo", cls: TXT },
    { text: "</span>", cls: TAG },
  ],
  [
    { text: "  <h1>", cls: TAG },
    { text: "Kopi Nusantara", cls: TXT },
    { text: "</h1>", cls: TAG },
  ],
  [
    { text: "  <p>", cls: TAG },
    { text: "Biji pilihan, sangrai harian.", cls: TXT },
    { text: "</p>", cls: TAG },
  ],
  [
    { text: "  <button", cls: TAG },
    { text: " className=", cls: ATTR },
    { text: '"btn"', cls: STR },
    { text: ">", cls: TAG },
  ],
  [{ text: "    Checkout", cls: TXT }],
  [{ text: "  </button>", cls: TAG }],
  [{ text: "</section>", cls: TAG }],
];

export default function AppBuilderShowcase() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedChars, setTypedChars] = useState(0);
  const [revealedLines, setRevealedLines] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Reduced motion: tampilkan langsung state akhir, tanpa timer.
    if (prefersReduced) {
      setTypedChars(PROMPT.length);
      setRevealedLines(CODE_LINES.length);
      setPhase("rendered");
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(resolve, ms);
        timers.push(id);
      });

    const run = async () => {
      while (!cancelled) {
        // idle — reset semuanya
        setPhase("idle");
        setTypedChars(0);
        setRevealedLines(0);
        await wait(900);
        if (cancelled) return;

        // typingPrompt — munculkan karakter prompt satu per satu
        setPhase("typing");
        for (let i = 1; i <= PROMPT.length; i++) {
          setTypedChars(i);
          await wait(38);
          if (cancelled) return;
        }
        await wait(550);
        if (cancelled) return;

        // streamingCode — buka kode baris demi baris
        setPhase("streaming");
        for (let i = 1; i <= CODE_LINES.length; i++) {
          setRevealedLines(i);
          await wait(260);
          if (cancelled) return;
        }
        await wait(450);
        if (cancelled) return;

        // rendered — preview muncul di HP, jeda sebelum loop ulang
        setPhase("rendered");
        await wait(3800);
        if (cancelled) return;
      }
    };

    void run();

    return () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  const promptText = PROMPT.slice(0, typedChars);
  const showPromptCursor = phase === "typing";
  const isStreaming = phase === "streaming";
  const isRendered = phase === "rendered";

  return (
    <div className="w-full">
      {/* Ringkasan untuk pembaca layar (visual di bawah bersifat dekoratif). */}
      <p className="sr-only">
        Animasi pratinjau fitur AI App Builder: prompt diketik ke dmrxai, AI
        menuliskan kode, lalu mockup ponsel menampilkan hasil landing page kopi
        beserta tombol checkout.
      </p>

      {/* Bagian visual — dekoratif, disembunyikan dari pembaca layar. */}
      <div
        aria-hidden="true"
        className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-stretch"
      >
        {/* LEFT: jendela dmrxai (chat + editor) */}
        <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input overflow-hidden shadow-sm flex flex-col">
          {/* Window header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs font-medium text-light-muted dark:text-dark-muted">
              dmrxai — App Builder
            </span>
          </div>

          <div className="p-4 flex flex-col gap-4 flex-1">
            {/* User prompt bubble (typing effect) */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-light-accent dark:bg-dark-accent text-white px-4 py-2.5 text-sm leading-relaxed">
                {promptText}
                {showPromptCursor && (
                  <span className="inline-block w-1.5 h-4 align-middle -mb-0.5 ml-0.5 bg-white/80 animate-pulse" />
                )}
              </div>
            </div>

            {/* Assistant: streaming code */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-light-muted dark:text-dark-muted">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-light-accent/15 dark:bg-dark-accent/15">
                  <Sparkles
                    size={12}
                    className="text-light-accent dark:text-dark-accent"
                  />
                </span>
                dmrxai
                {isStreaming && (
                  <span className="ml-1 inline-flex items-center gap-1 text-light-muted dark:text-dark-muted">
                    <span className="inline-flex gap-0.5">
                      <span className="typing-dot w-1 h-1 rounded-full bg-current" />
                      <span className="typing-dot w-1 h-1 rounded-full bg-current" />
                      <span className="typing-dot w-1 h-1 rounded-full bg-current" />
                    </span>
                    <span className="text-[11px]">Generating...</span>
                  </span>
                )}
              </div>

              {/* Code block (selalu gelap, ala editor) */}
              <div className="rounded-xl bg-[#0d1117] border border-white/5 px-4 py-3 font-mono text-[11px] leading-5 min-h-[180px] overflow-hidden">
                {revealedLines === 0 && !isRendered ? (
                  <span className="text-slate-500">// menunggu prompt...</span>
                ) : (
                  CODE_LINES.slice(0, revealedLines).map((line, li) => {
                    const isLast = li === revealedLines - 1;
                    return (
                      <div key={li} className="fade-in whitespace-pre">
                        {line.map((tok, ti) => (
                          <span key={ti} className={tok.cls}>
                            {tok.text}
                          </span>
                        ))}
                        {isStreaming && isLast && (
                          <span className="inline-block w-2 h-3.5 align-middle ml-0.5 bg-emerald-400 animate-pulse" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: mockup HP dengan preview live */}
        <div className="flex items-center justify-center">
          <div className="relative w-[240px] rounded-[2.5rem] border-[6px] border-light-border dark:border-dark-border bg-light-sidebar dark:bg-dark-sidebar p-2 shadow-xl">
            {/* Speaker / notch bar */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2 w-20 h-1.5 rounded-full bg-light-border dark:bg-dark-border" />

            {/* Screen */}
            <div className="mt-4 rounded-[1.8rem] overflow-hidden bg-white dark:bg-[#0d1117]">
              {/* Browser-ish top bar */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-[#161b22] border-b border-slate-200 dark:border-white/5">
                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="flex-1 mx-1 text-[9px] text-center text-slate-400 dark:text-slate-500 truncate rounded bg-slate-200/70 dark:bg-white/5 py-0.5">
                  dmrxai.app/preview
                </span>
              </div>

              {/* Screen content */}
              <div className="relative h-[360px]">
                {/* Skeleton / merender... */}
                <div
                  className={`absolute inset-0 p-4 flex flex-col gap-3 transition-opacity duration-500 ${
                    isRendered ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <div className="shimmer h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
                  <div className="shimmer h-4 w-2/3 rounded bg-slate-200 dark:bg-white/5" />
                  <div className="shimmer h-3 w-1/2 rounded bg-slate-200 dark:bg-white/5" />
                  <div className="shimmer h-9 w-28 rounded-lg bg-slate-200 dark:bg-white/5 mt-2" />
                  <div className="mt-auto flex items-center justify-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                    <Loader2 size={12} className="animate-spin" />
                    merender...
                  </div>
                </div>

                {/* Hasil render (muncul setelah kode selesai) */}
                <div
                  className={`absolute inset-0 transition-all duration-500 ${
                    isRendered
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95"
                  }`}
                >
                  <div className="h-full flex flex-col">
                    {/* Hero block */}
                    <div className="bg-gradient-to-br from-amber-500 to-orange-700 px-4 pt-6 pb-7 text-white">
                      <span className="inline-block text-[9px] font-semibold uppercase tracking-wide bg-white/20 rounded-full px-2 py-0.5">
                        Promo
                      </span>
                      <h1 className="mt-3 text-xl font-bold leading-tight">
                        Kopi Nusantara
                      </h1>
                      <p className="mt-1 text-xs text-amber-50/90">
                        Biji pilihan, sangrai harian.
                      </p>
                      <button className="mt-4 inline-flex items-center justify-center rounded-lg bg-white text-orange-700 text-xs font-bold px-4 py-2 shadow-sm">
                        Checkout
                      </button>
                    </div>

                    {/* Body filler agar terlihat seperti halaman */}
                    <div className="flex-1 p-4 space-y-2 bg-white dark:bg-[#0d1117]">
                      <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-white/5" />
                      <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-white/5" />
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="h-16 rounded-lg bg-amber-100 dark:bg-amber-500/10" />
                        <div className="h-16 rounded-lg bg-orange-100 dark:bg-orange-500/10" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
