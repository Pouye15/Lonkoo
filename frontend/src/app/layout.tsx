import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lonkoo.dev"),
  title: {
    default: "LONKOO — Collaboration, Versioning & Implémentation d'Architecture assistée par IA",
    template: "%s | LONKOO",
  },
  description:
    "Modélisez vos architectures logicielles en équipe, versionnez votre stack technique, générez votre documentation par IA et implémentez via serveur MCP, Orion et GitHub Releases.",
  openGraph: {
    title: "LONKOO — Studio Collaboratif d'Architecture Logicielle & IA",
    description:
      "Modélisation collaborative, scanner IA, simulation de charge, templates communautaires forkables et implémentation via MCP & GitHub.",
    type: "website",
    locale: "fr_FR",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#061826",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-abyss font-sans text-mist antialiased">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-amber focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-abyss"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
