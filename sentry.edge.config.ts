import * as Sentry from '@sentry/nextjs';

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;

const release =
  process.env.APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  release,
  tracesSampleRate: 0.0,
});

Sentry.setTag('runtime', 'edge');
