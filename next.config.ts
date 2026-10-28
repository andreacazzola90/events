import * as Sentry from "@sentry/nextjs";
import { execFileSync } from "node:child_process";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import packageMetadata from "./package.json";

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
      {
        protocol: "http",
        hostname: "resc.deskline.net",
      },
      {
        protocol: "https",
        hostname: "resc.deskline.net",
      },
    ],
  },
};

const nextConfig = {
  turbopack: {},
  allowedDevOrigins: ["127.0.0.1"],
  compress: true,
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer", "tesseract.js", "sharp", "pdf-parse", "pdfjs-dist"],
  ...imagesConfig,
  async headers() {
    return [
      {
        source: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
          ? '/:path*'
          : '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
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

function getCommitSha() {
  const providerSha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  if (/^[a-f0-9]{7,64}$/i.test(providerSha)) return providerSha.toLowerCase();

  try {
    const localSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[a-f0-9]{7,64}$/i.test(localSha) ? localSha.toLowerCase() : "";
  } catch {
    return "";
  }
}

let buildMetadata: Record<string, string> | undefined;

export default Sentry.withSentryConfig((phase: string) => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    buildMetadata ??= {
      NEXT_PUBLIC_APP_VERSION: packageMetadata.version,
      NEXT_PUBLIC_APP_COMMIT_SHA: getCommitSha(),
      NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
    };
    return { ...nextConfig, env: buildMetadata };
  }

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...nextConfig,
      env: {
        NEXT_PUBLIC_APP_VERSION: packageMetadata.version,
        NEXT_PUBLIC_APP_COMMIT_SHA: getCommitSha(),
        NEXT_PUBLIC_APP_BUILT_AT: "",
      },
    };
  }

  return nextConfig;
}, {
  silent: true,
});
