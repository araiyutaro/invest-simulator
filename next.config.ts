import type { NextConfig } from "next";

// Phase 05 Plan 02 / D-13 §7: global security headers
// Wiring: next.config.ts async headers() — canonical per Next.js CSP guide
// [CITED: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md]
// [CITED: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md]
const securityHeaders = [
  {
    // HSTS without `preload` — Pitfall 6: preload is irrevocable
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    // CSP: 'unsafe-inline' required for Next.js App Router + Tailwind v4
    // inline <style> injection (Pitfall 5). nonce-based CSP is deferred
    // because it requires dynamic rendering — out of Phase 5 scope.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
