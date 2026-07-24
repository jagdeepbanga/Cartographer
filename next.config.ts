import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
