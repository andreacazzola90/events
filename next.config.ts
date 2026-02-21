import * as Sentry from "@sentry/nextjs";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const imagesConfig = supabaseHostname
  ? {
      images: {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseHostname,
          },
        ],
      },
    }
  : {};

const nextConfig = {
  turbopack: {},
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer", "tesseract.js", "sharp"],
  ...imagesConfig,
  // Only use standalone output for Vercel deployment, not for local development
  ...(process.env.VERCEL && {
    output: "standalone",
  }),
};

export default Sentry.withSentryConfig(nextConfig, {
  silent: true,
});
