import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Out of Service",
  description:
    "Accessible NYC subway routing for people and their agents, scored on real elevator outage history.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
