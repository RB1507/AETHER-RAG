import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Produce a minimal self-contained server (.next/standalone) for bundling
     into the packaged desktop app. */
  output: "standalone",

  /* Proxy API calls to the FastAPI backend */
  async rewrites() {
    return [
      {
        source: '/backend/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
