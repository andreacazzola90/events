import * as Sentry from '@sentry/nextjs';
import { redactTelegramTelemetry } from './lib/telegram-connection';

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;

const release =
  process.env.APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  release,
  tracesSampleRate: 0.0,
  beforeBreadcrumb: breadcrumb => redactTelegramTelemetry(breadcrumb),
  beforeSend: event => redactTelegramTelemetry(event),
  beforeSendTransaction: event => redactTelegramTelemetry(event),
});

Sentry.setTag('runtime', 'node');
