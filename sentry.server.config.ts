import * as Sentry from '@sentry/nextjs';
import { redactTelegramTelemetry } from './lib/telegram-connection';
import { redactInstagramTelemetry } from './lib/instagram-scan-connection';
import { redactPersonalMessagingTelemetry } from './lib/personal-messaging-telemetry';

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;

const release =
  process.env.APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  release,
  tracesSampleRate: 0.0,
  beforeBreadcrumb: breadcrumb => redactPersonalMessagingTelemetry(redactInstagramTelemetry(redactTelegramTelemetry(breadcrumb))),
  beforeSend: event => redactPersonalMessagingTelemetry(redactInstagramTelemetry(redactTelegramTelemetry(event))),
  beforeSendTransaction: event => redactPersonalMessagingTelemetry(redactInstagramTelemetry(redactTelegramTelemetry(event))),
});

Sentry.setTag('runtime', 'node');
