import * as Sentry from '@sentry/nextjs';

const environment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV;

const release =
  process.env.NEXT_PUBLIC_APP_VERSION ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  environment,
  release,
  tracesSampleRate: 0.0,
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
});

Sentry.setTag('runtime', 'browser');
