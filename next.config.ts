import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Security headers applied to all routes. These are the minimum set for a
  // production web app handling real customer data.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // clickjacking
          { key: "X-Content-Type-Options", value: "nosniff" }, // MIME sniffing
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // HSTS only meaningful over HTTPS; dev is HTTP so this is a no-op locally
          // but applies in production behind the HTTPS gateway.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // CSP: allow NextAuth inline styles + self. No external origins except
          // the z-ai SDK (server-side only, never in browser).
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' ws: wss:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
