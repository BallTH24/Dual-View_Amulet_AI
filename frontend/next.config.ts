import type { NextConfig } from "next";

const BACKEND_INTERNAL_URL =
  process.env.INTERNAL_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  /* Allow requests from LAN IP and Cloudflare Tunnel on dev server (Next.js 16) */
  allowedDevOrigins: [
    "10.240.195.237",
    "10.240.195.237:3000",
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
    "*.trycloudflare.com",
  ],
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_INTERNAL_URL}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${BACKEND_INTERNAL_URL}/health`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
