import type { NextConfig } from "next";
import { resolveApiUpstream } from "./lib/api-upstream";
import { scripts } from "./package.json";

const nextConfig: NextConfig = {
  async rewrites() {
    const upstream = resolveApiUpstream({
      mode: process.env.NEXT_PUBLIC_API_MODE,
      upstream: process.env.API_UPSTREAM,
      frontendPort: /--port\s+(\d+)/.exec(scripts.dev)?.[1],
    });
    if (!upstream) return [];
    return {
      beforeFiles: [
        { source: "/api/v1/:path*", destination: `${upstream}/api/v1/:path*` },
      ],
    };
  },
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Client session recovery can omit protected pages during validation.
    // Validate instant navigation on routes that explicitly opt in.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
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
