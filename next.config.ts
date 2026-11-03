import type { NextConfig } from "next";

const isProduction = process.env.RENVER_MODE === "production";

/**
 * Applied to every panel page and API response. The panel must never be shown inside another site's frame (that is how
 * clickjacking works), and browsers are told not to guess content types. HTTPS-only is switched on for production,
 * where the panel is served through Caddy over HTTPS; locally it runs on plain http.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["adm-zip"],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
