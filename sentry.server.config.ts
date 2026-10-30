import * as Sentry from '@sentry/nextjs';
import { redactTelegramTelemetry } from './lib/telegram-connection';
import { redactInstagramTelemetry } from './lib/instagram-scan-connection';

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;

const release =
  process.env.APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  release,
  tracesSampleRate: 0.0,
  beforeBreadcrumb: breadcrumb => redactInstagramTelemetry(redactTelegramTelemetry(breadcrumb)),
  beforeSend: event => redactInstagramTelemetry(redactTelegramTelemetry(event)),
  beforeSendTransaction: event => redactInstagramTelemetry(redactTelegramTelemetry(event)),
});

Sentry.setTag('runtime', 'node');
