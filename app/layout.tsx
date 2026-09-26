import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omni Agent Platform",
  description: "Independent self-hosted AI agent and integration platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
