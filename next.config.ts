import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone build (minimal server.js + only the
  // traced node_modules) for a small production Docker image.
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  // Ensure all prompt files are bundled in production (Vercel, etc.)
  outputFileTracingIncludes: {
    '/api/chat': ['./agent/prompts/*.md'],
    // The RDS CA bundle is read at runtime by db/client.ts. The Dockerfile also
    // copies it explicitly; this covers trace-based deploys (Vercel, etc.).
    '/api/**': ['./certs/*.pem'],
  },
};

export default nextConfig;
