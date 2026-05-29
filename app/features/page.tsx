"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Globe,
  Link2,
  FileText,
  FileType,
  FileSpreadsheet,
  BarChart3,
  Image as ImageIcon,
  Brain,
  Code2,
  Network,
  Sparkles,
  Crown,
  Bot,
  Heart,
  Shield,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import AppBuilderShowcase from "@/components/AppBuilderShowcase";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  examples: string[];
};

const features: Feature[] = [
  {
    icon: Crown,
    title: "Claude Opus 4.8 (Terbaru)",
    description:
      "Model Claude paling baru, baru saja rilis. Reasoning lebih tajam, jawaban lebih akurat, sudah tersedia di dmrxai.",
    examples: [
      "coba Opus 4.8: rancang arsitektur sistem microservice lengkap",
    ],
  },
  {
    icon: MessageSquare,
    title: "Chat AI Multi-Model",
    description:
      "Pilih dari berbagai model AI (Claude, GPT, Gemini, Llama, Qwen, dan lainnya). Setiap model punya kekuatan masing-masing.",
    examples: ["Jelaskan teori relativitas dengan analogi sehari-hari"],
  },
  {
    icon: Globe,
    title: "Web Search Otomatis",
    description:
      'Aktifkan mode Web Search atau pakai keyword seperti "terbaru" / "berita" / "harga" — app akan cari di internet sebelum menjawab dengan citation.',
    examples: ["harga emas hari ini", "berita teknologi terkini"],
  },
  {
    icon: Link2,
    title: "Baca URL Apapun",
    description:
      "Paste URL di chat, app fetch dan baca isi halamannya, lalu AI menjawab berdasarkan konten asli.",
    examples: ["tolong rangkum https://example.com/article"],
  },
  {
    icon: FileText,
    title: "Analisis Dokumen PDF",
    description:
      "Drop file PDF, isinya diekstrak per halaman dan dianalisis AI.",
    examples: ["Ringkas dokumen ini dalam 5 poin utama"],
  },
  {
    icon: FileType,
    title: "Baca Word & Docx",
    description:
      "File .doc / .docx diparsing otomatis. Cocok untuk laporan, proposal, draft.",
    examples: ["Cek typo dan saran perbaikan tata bahasa di dokumen ini"],
  },
  {
    icon: FileSpreadsheet,
    title: "Analisis Excel & CSV",
    description:
      "File .xlsx / .xls / .csv diparsing per sheet jadi data terstruktur. AI bisa hitung statistik, deteksi tren, atau buatkan ringkasan.",
    examples: ["Hitung total revenue per region dari spreadsheet ini"],
  },
  {
    icon: BarChart3,
    title: "Visualisasi Chart & Grafik",
    description:
      "Minta grafik dalam bahasa natural — AI akan render line chart, bar chart, area chart, atau pie chart langsung di response.",
    examples: ["buatkan bar chart penjualan: Jan 100, Feb 150, Mar 200"],
  },
  {
    icon: Network,
    title: "Diagram Visual (ERD, Flowchart, dll)",
    description:
      "Minta diagram dalam bahasa natural — AI render flowchart, ERD database, sequence diagram, class diagram, gantt chart, mindmap, dan lainnya pakai Mermaid syntax.",
    examples: [
      "buatkan ERD untuk sistem e-commerce dengan tabel User, Product, Order",
    ],
  },
  {
    icon: ImageIcon,
    title: "Vision (Baca Gambar)",
    description:
      "Untuk model yang mendukung vision (GPT-4o, Claude 3+, Gemini, Qwen-VL, dll), kirim gambar dan AI bisa membacanya.",
    examples: ["apa isi screenshot ini? — sambil attach gambar"],
  },
  {
    icon: Brain,
    title: "Mode Thinking & Deep Research",
    description:
      "Aktifkan mode Thinking untuk soal kompleks (matematika, logika, debugging) atau Deep Research untuk analisis mendalam dengan reasoning panjang.",
    examples: ["Buktikan bahwa akar 2 adalah irasional (Thinking mode)"],
  },
  {
    icon: Code2,
    title: "Markdown + Code Highlight",
    description:
      "Response AI di-render dengan markdown lengkap: tabel, list, blockquote, dan code block dengan syntax highlight + tombol copy.",
    examples: ["tulis fungsi Python untuk validasi email dengan regex"],
  },
  {
    icon: Bot,
    title: "Mode Agentic Multi-step",
    description:
      "AI bisa memakai tool secara otomatis dan berurutan — web search, fetch URL, sampai render chart. Modelnya sendiri yang memutuskan langkah mana yang perlu dijalankan.",
    examples: ["cari tren AI 2026 lalu buatkan grafiknya"],
  },
  {
    icon: FileSpreadsheet,
    title: "Smart Sampling File Besar",
    description:
      "File Excel/CSV 5MB+ ditangani lewat schema kolom + statistik ringkas + sample baris, jadi AI tetap bisa menganalisis tanpa kehabisan konteks.",
    examples: ["analisa file penjualan 100 ribu baris ini"],
  },
  {
    icon: Heart,
    title: "Dukungan Donasi Trakteer",
    description:
      "Bantu server tetap gratis lewat Trakteer. Ada progress bar, Top Sultan, dan countdown.",
    examples: ["klik tombol Bantu untuk dukung dmrxai"],
  },
  {
    icon: Shield,
    title: "Privacy-first (Data Lokal)",
    description:
      "Riwayat chat tersimpan di browser kamu, bukan di server. Tanpa registrasi, tanpa tracking.",
    examples: ["semua percakapan tetap privat di perangkatmu"],
  },
];

const tips: string[] = [
  "Drop Excel + minta chart: AI baca data, langsung visualisasi",
  "Mode Web Search + chart: 'harga BTC 7 hari terakhir, plot line chart'",
  "URL artikel + analisis: 'baca link ini lalu bandingkan dengan pendapat Anda'",
  "Mode Agentic + diagram: 'cari arsitektur microservice di tutorial AWS lalu buatkan diagramnya'",
];

export default function FeaturesPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Kembali ke chat
        </button>

        <section className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border mb-4">
            <Sparkles
              size={24}
              className="text-light-accent dark:text-dark-accent"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Apa yang bisa dilakukan dengan Dmr x AI?
          </h1>
          <p className="text-lg text-light-muted dark:text-dark-muted mt-3 max-w-2xl mx-auto leading-relaxed">
            Asisten AI multi-fitur dengan akses internet, baca dokumen, analisis
            data, dan visualisasi.
          </p>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-3 max-w-2xl mx-auto leading-relaxed">
            Kini dengan model terbaru{" "}
            <span className="font-semibold text-light-accent dark:text-dark-accent">
              Claude Opus 4.8
            </span>{" "}
            — reasoning lebih tajam, jawaban lebih akurat.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-5 rounded-xl border border-light-border dark:border-dark-border bg-light-input dark:bg-dark-input hover:border-light-accent dark:hover:border-dark-accent transition-colors"
              >
                <Icon
                  size={24}
                  className="text-light-accent dark:text-dark-accent"
                />
                <h3 className="text-base font-semibold mt-3">{feature.title}</h3>
                <p className="text-sm text-light-muted dark:text-dark-muted mt-2 leading-relaxed">
                  {feature.description}
                </p>
                {feature.examples.map((example, i) => (
                  <code
                    key={i}
                    className="block mt-3 px-3 py-2 rounded bg-light-bg dark:bg-dark-bg text-xs font-mono text-light-text dark:text-dark-text"
                  >
                    {example}
                  </code>
                ))}
              </div>
            );
          })}
        </section>

        <section className="mt-12 rounded-2xl border border-light-border dark:border-dark-border bg-gradient-to-br from-light-sidebar to-light-input dark:from-dark-sidebar dark:to-dark-input p-6 sm:p-8 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
              <Wand2 size={13} />
              Segera Hadir
            </span>
            <h2 className="text-2xl font-bold tracking-tight">
              AI App Builder
            </h2>
          </div>

          <p className="text-sm text-light-muted dark:text-dark-muted max-w-2xl leading-relaxed mb-6">
            dmrxai sedang mengembangkan AI App Builder — cukup deskripsikan
            aplikasi yang kamu mau, dmrxai menuliskan kodenya dan menampilkan
            preview langsung di layar. Fitur ini lagi dikerjakan, segera hadir.
          </p>

          <AppBuilderShowcase />
        </section>

        <section className="bg-light-sidebar dark:bg-dark-sidebar border border-light-border dark:border-dark-border rounded-xl p-6 mt-12">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles
              size={18}
              className="text-light-accent dark:text-dark-accent"
            />
            Tips Combo
          </h2>
          <ul className="mt-4 space-y-3">
            {tips.map((tip, i) => (
              <li
                key={i}
                className="text-sm text-light-muted dark:text-dark-muted leading-relaxed flex gap-3"
              >
                <span className="text-light-accent dark:text-dark-accent font-semibold shrink-0">
                  {i + 1}.
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="text-center mt-12 mb-4">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-light-accent dark:bg-dark-accent text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Mulai Chat
            <ArrowRight size={18} />
          </button>
        </section>
      </div>
    </main>
  );
}
