import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Model AI — Dmr x AI",
  description:
    "Daftar model AI tersedia di Dmr x AI dengan kemampuan masing-masing (vision, reasoning, tools, dan lainnya).",
};

export default function ModelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
