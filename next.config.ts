import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium"],
  // Enable output file tracing for better Vercel deployment
  output: "standalone",
};

export default nextConfig;
