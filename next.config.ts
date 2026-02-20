import type { NextConfig } from "next";
import * as Sentry from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer", "tesseract.js", "sharp"],
  // Only use standalone output for Vercel deployment, not for local development
  ...(process.env.VERCEL && {
    output: "standalone",
  }),
};

export default Sentry.withSentryConfig(nextConfig, {
  silent: true,
});
