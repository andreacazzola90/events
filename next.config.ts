import * as Sentry from "@sentry/nextjs";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const imagesConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24,
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
      // Host esterni per immagini evento
      {
        protocol: "https",
        hostname: "www.vicenzatoday.it",
      },
      {
        protocol: "https",
        hostname: "www.visitschio.it",
      },
      {
        protocol: "https",
        hostname: "visitpedemontana.com",
      },
    ],
  },
};

const nextConfig = {
  turbopack: {},
  compress: true,
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer", "tesseract.js", "sharp"],
  ...imagesConfig,
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, must-revalidate" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/:path*.{ico,png,jpg,jpeg,svg,webp,woff,woff2}",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  // Only use standalone output for Vercel deployment, not for local development
  ...(process.env.VERCEL && {
    output: "standalone",
  }),
};

export default Sentry.withSentryConfig(nextConfig, {
  silent: true,
});
