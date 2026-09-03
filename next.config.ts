import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone build (minimal server.js + only the
  // traced node_modules) for a small production Docker image. Vercel builds its
  // own serverless output, so this is opt-in via the Dockerfile only.
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' as const } : {}),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
  // Ensure all prompt files are bundled in production (Vercel, etc.)
  outputFileTracingIncludes: {
    '/api/chat': ['./agent/prompts/*.md'],
  },
};

export default nextConfig;
