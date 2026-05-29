"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  X,
  Sparkles,
  Zap,
  Brain,
  Globe,
  Image as ImageIcon,
  FileText,
  BarChart3,
  Network,
  Code2,
  MessageSquare,
  Heart,
  ExternalLink,
  Clock,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import {
  DONATION_DEADLINE_ISO,
  TRAKTEER_URL,
  LINKTEER_URL,
  formatIDR,
} from "@/lib/donation-config";
import { useCountdown, useDonation } from "@/hooks/useDonation";

interface LoginPageProps {
  onStart: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

type CellValue = "yes" | "no" | "partial" | string;

interface ComparisonRow {
  feature: string;
  dmrxai: CellValue;
  chatgpt: CellValue;
  claude: CellValue;
  gemini: CellValue;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: "Harga per bulan", dmrxai: "GRATIS", chatgpt: "$20", claude: "$20", gemini: "$20" },
  { feature: "Claude Opus 4.8 (Terbaru)", dmrxai: "yes", chatgpt: "no", claude: "partial", gemini: "no" },
  { feature: "Claude Opus 4.7", dmrxai: "yes", chatgpt: "no", claude: "yes", gemini: "no" },
  { feature: "Claude Sonnet 4.6", dmrxai: "yes", chatgpt: "no", claude: "yes", gemini: "no" },
  { feature: "GPT-4o / GPT-5", dmrxai: "partial", chatgpt: "yes", claude: "no", gemini: "no" },
  { feature: "Gemini Pro / Flash", dmrxai: "partial", chatgpt: "no", claude: "no", gemini: "yes" },
  { feature: "Llama / Qwen / DeepSeek", dmrxai: "yes", chatgpt: "no", claude: "no", gemini: "no" },
  { feature: "Web Search Real-time", dmrxai: "yes", chatgpt: "yes", claude: "yes", gemini: "yes" },
  { feature: "Vision (Baca Gambar)", dmrxai: "yes", chatgpt: "yes", claude: "yes", gemini: "yes" },
  { feature: "Analisis PDF / Word", dmrxai: "yes", chatgpt: "yes", claude: "yes", gemini: "yes" },
  { feature: "Analisis Excel / CSV", dmrxai: "yes", chatgpt: "yes", claude: "no", gemini: "yes" },
  { feature: "Visualisasi Chart", dmrxai: "yes", chatgpt: "no", claude: "no", gemini: "no" },
  { feature: "Diagram (ERD/Flowchart)", dmrxai: "yes", chatgpt: "no", claude: "no", gemini: "no" },
  { feature: "Multi-step Tool Calling", dmrxai: "yes", chatgpt: "yes", claude: "yes", gemini: "partial" },
  { feature: "Thinking / Reasoning", dmrxai: "yes", chatgpt: "yes", claude: "yes", gemini: "yes" },
  { feature: "URL Fetch Otomatis", dmrxai: "yes", chatgpt: "yes", claude: "yes", gemini: "yes" },
  { feature: "Tanpa Registrasi", dmrxai: "yes", chatgpt: "no", claude: "no", gemini: "no" },
];

function renderCell(value: CellValue) {
  if (value === "yes") return <Check size={16} className="inline text-emerald-500" />;
  if (value === "no") return <X size={16} className="inline text-rose-500/60" />;
  if (value === "partial")
    return <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Sebagian</span>;
  return <span className="text-xs font-semibold">{value}</span>;
}

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: Brain,
    title: "Multi Model AI",
    desc: "Pilih dari 50+ model: Claude Opus 4.8 (terbaru), Opus 4.7, Sonnet 4.6, Haiku, GPT, Gemini, Llama, Qwen, DeepSeek, dan lainnya.",
  },
  {
    icon: Globe,
    title: "Web Search Real-time",
    desc: "Pencarian web otomatis pakai SearXNG self-hosted. Auto-detect saat butuh info terkini.",
  },
  {
    icon: Sparkles,
    title: "Mode Agentic",
    desc: "Model decide sendiri kapan search, fetch, atau buat chart. Multi-step reasoning end-to-end.",
  },
  {
    icon: ImageIcon,
    title: "Vision",
    desc: "Drop gambar atau paste screenshot, AI langsung baca dan analisa isinya.",
  },
  {
    icon: FileText,
    title: "Analisis Dokumen",
    desc: "Upload PDF, Word, Excel, CSV, atau text otomatis di-parse dan dianalisa.",
  },
  {
    icon: BarChart3,
    title: "Visualisasi Chart",
    desc: "Bar, line, area, pie chart interaktif. Cocok untuk data, statistik, laporan.",
  },
  {
    icon: Network,
    title: "Diagram & ERD",
    desc: "Flowchart, ERD database, sequence, class, gantt dirender otomatis dari natural language.",
  },
  {
    icon: Code2,
    title: "Code & Markdown",
    desc: "Syntax highlight, copy button, tabel, math notation. Cocok untuk developer.",
  },
  {
    icon: MessageSquare,
    title: "Multi Conversation",
    desc: "Riwayat chat tersimpan di browser. Privacy-first, data Anda tidak diupload kemana-mana.",
  },
];

export default function LoginPage({ onStart, theme, onToggleTheme }: LoginPageProps) {
  const [isStarting, setIsStarting] = useState(false);
  const countdown = useCountdown(DONATION_DEADLINE_ISO);
  const { data: donation } = useDonation({ enabled: true });

  const goal = donation?.goal ?? 0;
  const totalRaised = donation?.totalRaised ?? 0;
  const donationPercent = goal > 0 ? Math.min(100, (totalRaised / goal) * 100) : 0;

  const handleStart = () => {
    if (isStarting) return;
    setIsStarting(true);
    setTimeout(onStart, 200);
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-light-border dark:border-dark-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold">dmrxai</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/features"
            className="hidden sm:flex items-center gap-1.5 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
          >
            Lihat Fitur
            <ExternalLink size={12} />
          </a>
          <a
            href="/models"
            className="hidden sm:flex items-center gap-1.5 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
          >
            Model AI
            <ExternalLink size={12} />
          </a>
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover transition-colors text-sm"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <Zap size={12} />
              <span>100% GRATIS</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold">
              <Sparkles size={12} />
              <span>Opus 4.8 Baru</span>
            </div>
          </div>
          <h1 className="text-4xl lg:text-6xl font-bold tracking-tight leading-tight">
            AI Premium yang Sama Pintarnya
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500">
              Tanpa Biaya
            </span>
          </h1>
          <p className="text-lg lg:text-xl text-light-muted dark:text-dark-muted max-w-3xl mx-auto leading-relaxed">
            Akses Claude Opus 4.8 (terbaru), GPT, Gemini, dan model AI terbaik lainnya dengan fitur lengkap web search, analisis dokumen PDF/Excel, visualisasi chart, diagram ERD, vision, dan multi-step tool calling. Semua gratis.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-blue-500/25"
            >
              {isStarting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Mulai Sekarang Gratis</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            <a
              href="/features"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-dark-hover transition-colors text-sm font-medium"
            >
              Lihat Semua Fitur
            </a>
          </div>
          <p className="text-xs text-light-muted dark:text-dark-muted pt-2">
            Tanpa registrasi • Tanpa kartu kredit • Tanpa API key
          </p>
        </div>
      </section>

      {/* Comparison */}
      <section
        id="comparison"
        className="px-6 py-12 bg-light-sidebar dark:bg-dark-sidebar border-y border-light-border dark:border-dark-border"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Bandingkan dengan AI Lain</h2>
            <p className="text-light-muted dark:text-dark-muted text-sm">
              Lihat kenapa dmrxai memberi nilai lebih dibanding paket berbayar pesaing
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-light-border dark:border-dark-border">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-light-input dark:bg-dark-input">
                  <th className="px-4 py-4 text-left font-medium text-light-muted dark:text-dark-muted">
                    Fitur
                  </th>
                  <th className="px-4 py-4 text-center bg-blue-500/5">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-bold text-blue-600 dark:text-blue-400">dmrxai</span>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        GRATIS
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-medium">ChatGPT Plus</span>
                      <span className="text-[10px] text-light-muted dark:text-dark-muted">$20/bln</span>
                    </div>
                  </th>
                  <th className="px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-medium">Claude Pro</span>
                      <span className="text-[10px] text-light-muted dark:text-dark-muted">$20/bln</span>
                    </div>
                  </th>
                  <th className="px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-medium">Gemini Advanced</span>
                      <span className="text-[10px] text-light-muted dark:text-dark-muted">$20/bln</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={i % 2 === 0 ? "bg-light-bg dark:bg-dark-bg" : "bg-light-input dark:bg-dark-input"}
                  >
                    <td className="px-4 py-3 font-medium">{row.feature}</td>
                    <td className="px-4 py-3 text-center bg-blue-500/5">{renderCell(row.dmrxai)}</td>
                    <td className="px-4 py-3 text-center">{renderCell(row.chatgpt)}</td>
                    <td className="px-4 py-3 text-center">{renderCell(row.claude)}</td>
                    <td className="px-4 py-3 text-center">{renderCell(row.gemini)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-center text-light-muted dark:text-dark-muted mt-4">
            *Perbandingan berdasarkan paket berbayar standar masing-masing platform per Mei 2026
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Apa yang Bisa Anda Lakukan</h2>
            <p className="text-light-muted dark:text-dark-muted text-sm">
              Semua fitur premium AI modern, bisa dipakai langsung tanpa registrasi
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="p-5 rounded-xl border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input hover:border-light-accent dark:hover:border-dark-accent transition-colors"
                >
                  <Icon size={22} className="text-light-accent dark:text-dark-accent mb-3" />
                  <h3 className="font-semibold text-base mb-1.5">{f.title}</h3>
                  <p className="text-sm text-light-muted dark:text-dark-muted leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Coming soon: AI App Builder teaser */}
      <section className="px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-blue-500/5 p-6 lg:p-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500/15 to-blue-500/15 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-xs font-semibold">
              <Rocket size={12} />
              <span>Segera Hadir • Next Update</span>
            </div>
            <h3 className="text-2xl font-bold mt-4 mb-2">AI App Builder</h3>
            <p className="text-sm text-light-muted dark:text-dark-muted leading-relaxed mb-5 max-w-2xl">
              dmrxai sedang mengembangkan fitur AI App Builder. Cukup deskripsikan aplikasi yang kamu mau,
              dmrxai akan menuliskan kodenya dan menampilkan preview-nya langsung dari ponsel. Fitur ini
              sedang dikerjakan dan akan segera hadir.
            </p>
            <a
              href="/features"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-dark-hover transition-colors text-sm font-medium"
            >
              <span>Lihat Bocoran di Fitur</span>
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* Support pitch */}
      <section className="px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-light-border dark:border-dark-border bg-gradient-to-br from-pink-500/5 to-purple-500/5 p-6 lg:p-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center">
                <Heart size={22} className="text-pink-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Bantu Kami Tetap Gratis</h3>
                <p className="text-sm text-light-muted dark:text-dark-muted leading-relaxed mb-3">
                  Semua fitur dmrxai{" "}
                  <strong className="text-light-text dark:text-dark-text">100% gratis</strong> untuk uji coba. Tidak ada API key, tidak ada batas harian, akses penuh ke Claude Opus dan model premium lainnya.
                </p>
                <p className="text-sm text-light-muted dark:text-dark-muted leading-relaxed">
                  dmrxai sudah berjalan lebih dari 1 bulan tanpa meminta bantuan. Pada{" "}
                  <strong className="text-light-text dark:text-dark-text">1 Juni 2026 pukul 07:00 WIB</strong>{" "}
                  server kemungkinan ditutup kalau tidak ada dukungan. Bantu lewat Trakteer supaya dmrxai tetap gratis dan bisa terus diakses.
                </p>
              </div>
            </div>

            {/* Countdown */}
            <div className="mt-6">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock size={14} className="text-pink-500" />
                <span className="text-xs font-semibold text-light-text dark:text-dark-text">
                  Sisa waktu menuju deadline
                </span>
              </div>
              {countdown.expired ? (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    Waktu habis
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: countdown.days, label: "Hari" },
                    { value: countdown.hours, label: "Jam" },
                    { value: countdown.minutes, label: "Menit" },
                    { value: countdown.seconds, label: "Detik" },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className="flex flex-col items-center justify-center rounded-xl bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border py-3"
                    >
                      <span className="text-2xl font-bold tabular-nums">
                        {String(box.value).padStart(2, "0")}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-light-muted dark:text-dark-muted mt-0.5">
                        {box.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs font-semibold text-light-text dark:text-dark-text">
                  Terkumpul
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {formatIDR(totalRaised)}{" "}
                  <span className="text-light-muted dark:text-dark-muted font-normal">
                    / {formatIDR(goal)}
                  </span>
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-light-bg dark:bg-dark-bg overflow-hidden border border-light-border dark:border-dark-border">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                  style={{ width: `${donationPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-light-muted dark:text-dark-muted tabular-nums">
                  {donationPercent.toFixed(1)}%
                </span>
                {donation?.configured === false && (
                  <span className="text-[11px] text-light-muted dark:text-dark-muted">
                    Data donasi belum tersambung
                  </span>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-6 flex flex-col gap-2">
              {/* Primary: langsung ke popup pembayaran */}
              <a
                href={donation?.linkteerUrl ?? LINKTEER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/25"
              >
                <Zap size={18} />
                <span>Bantu Sekarang</span>
              </a>
              {/* Secondary: buka halaman Trakteer */}
              <a
                href={TRAKTEER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted font-medium hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
              >
                <Heart size={16} />
                <span>Dukung via Trakteer</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Siap Mulai?</h2>
          <p className="text-light-muted dark:text-dark-muted">
            Klik tombol di bawah dan langsung pakai semua fitur AI premium. Gratis selamanya untuk uji coba.
          </p>
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-blue-500/25"
          >
            {isStarting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Mulai Sekarang Gratis</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-light-border dark:border-dark-border text-center">
        <p className="text-xs text-light-muted dark:text-dark-muted">
          © 2026 dmrxai • Dibuat dengan{" "}
          <Heart size={10} className="inline text-pink-500" /> untuk komunitas AI Indonesia
        </p>
      </footer>
    </div>
  );
}
