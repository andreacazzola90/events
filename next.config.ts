import * as Sentry from "@sentry/nextjs";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const imagesConfig = {
  images: {
    remotePatterns: [
      // Supabase bucket host (se configurato)
      ...(supabaseHostname
        ? [
            {
              protocol: "https",
              hostname: supabaseHostname,
            },
          ]
        : []),
      // Host esterno per immagini evento (es. VicenzaToday)
      {
        protocol: "https",
        hostname: "www.vicenzatoday.it",
      },
    ],
  },
};

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
