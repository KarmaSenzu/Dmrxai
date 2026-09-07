import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App Builder — dmrxai",
  description:
    "Generate aplikasi React dari prompt. Live preview Desktop & Mobile.",
};

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
