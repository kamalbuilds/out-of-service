import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/** Archivo is the grotesk closest to MTA signage that ships a width axis. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

/** Equipment codes, times and tool names are set like a maintenance tag. */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Out of Service: step-free NYC subway routing",
    template: "%s",
  },
  description:
    "Accessible NYC subway routing for people and their agents, scored on real elevator outage history.",
};

const ORIGIN_TRIAL_TOKEN =
  "AsalTzjMuR8bZgu8t8O7vDJ0wA+3db23zadvqnnReCnN9xct7jjbwTw5EYk35pi7twl1chLJuEnPdAB6SCcsJQ0AAABfeyJvcmlnaW4iOiJodHRwczovL291dC1vZi1zZXJ2aWNlLXNlcGlhLnZlcmNlbC5hcHA6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0=";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} h-full`}>
      <head>
        <meta httpEquiv="origin-trial" content={ORIGIN_TRIAL_TOKEN} />
      </head>
      <body className="min-h-full bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
