import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow requests from LAN IP on dev server (Next.js 16) */
  allowedDevOrigins: [
    "10.240.195.237",
    "10.240.195.237:3000",
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
  ],
  cacheComponents: true,
  partialPrefetching: true,
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
