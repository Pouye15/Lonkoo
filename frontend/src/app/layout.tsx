import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme/ThemeProvider";
import { SessionProvider } from "@/lib/session";
import { IS_LIVE_API } from "@/lib/api";

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

const DESCRIPTION =
  "Le studio où une équipe conçoit l'architecture de son application en temps réel, avec un copilote IA à la demande, puis la génère, la pousse sur GitHub et la déploie.";

export const metadata: Metadata = {
  title: {
    default: "LONKOO — Concevez l'architecture de votre application, en équipe",
    template: "%s | LONKOO",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "LONKOO — Concevez l'architecture de votre application, en équipe",
    description: DESCRIPTION,
    type: "website",
    locale: "fr_FR",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1120" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-api-mode : le mode fixé au build (« live » = API réelle, « mock » = données simulées du navigateur),
    // lisible dans le HTML servi ; la CI s'en sert pour refuser une image de production construite en mode simulé.
    <html
      lang="fr"
      data-api-mode={IS_LIVE_API ? "live" : "mock"}
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-canvas font-sans text-ink antialiased">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Aller au contenu
        </a>
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
