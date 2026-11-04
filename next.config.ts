import type { NextConfig } from "next";

// Everything here is constant per response. The Content-Security-Policy is
// not — it carries a per-request nonce — so it's set in middleware instead.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Server Actions carry session cookies, so their built-in Origin/Host
    // check is what stands between a logged-in user and a cross-site POST.
    // Naming the origin explicitly keeps that check correct behind
    // Cloudflare and Traefik, which both rewrite Host.
    serverActions: {
      allowedOrigins: [
        new URL(process.env.ZEQQAT_PUBLIC_URL ?? "http://localhost:3000").host,
      ],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
