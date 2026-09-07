import type { Metadata } from "next";

// ISR: regenerate the static shell at most every hour
export const revalidate = 3600;

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
