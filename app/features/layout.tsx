import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fitur — Dmr x AI",
  description:
    "Semua kemampuan Dmr x AI: chat multi-model, web search, baca dokumen (PDF/Word/Excel), visualisasi chart, vision, dan lebih banyak.",
};

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
