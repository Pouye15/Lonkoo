import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP stricte. Les polices sont auto-hébergées par next/font,
 * donc aucun domaine tiers n'est autorisé.
 * 'unsafe-eval' n'est accordé qu'en développement (React Refresh).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // sharp (libvips, LGPL) n'est pas installé : le règlement CADev interdit les licences LGPL.
  // Voir stubs/sharp et docs/LICENCES-TIERCES.md.
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // En local, le frontend relaie /api vers le backend (origine unique, pas de CORS).
  // En production, Caddy sert déjà /api (voir infra/Caddyfile).
  async rewrites() {
    if (!isDev) return [];
    const backend = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8080";
    const realtime = process.env.REALTIME_INTERNAL_URL ?? "http://localhost:1234";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      // Le WebSocket du temps réel sur la même origine que le site (NEXT_PUBLIC_REALTIME_URL=/ws), comme Caddy en
      // production. Indispensable dans un Codespace, où ws://localhost:1234 est la machine du navigateur, pas le serveur.
      { source: "/ws", destination: `${realtime}/ws` },
    ];
  },
};

export default nextConfig;
