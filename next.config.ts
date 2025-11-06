import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer"],
  // Only use standalone output for Vercel deployment, not for local development
  ...(process.env.VERCEL && {
    output: "standalone",
  }),
};

export default nextConfig;
