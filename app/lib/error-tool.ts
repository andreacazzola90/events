'use client';

import * as Sentry from '@sentry/nextjs';

export type ErrorSeverity = 'info' | 'warning' | 'error';

export interface AppErrorEntry {
  message: string;
  source?: string;
  severity: ErrorSeverity;
  details?: unknown;
  timestamp: string;
}

const STORAGE_KEY = 'eventscanner_error_logs';
const MAX_LOG_ENTRIES = 50;

export function logClientError(input: {
  message: string;
  source?: string;
  severity?: ErrorSeverity;
  details?: unknown;
}) {
  const { message, source, severity = 'error', details } = input;
  const entry: AppErrorEntry = {
    message,
    source,
    severity,
    details,
    timestamp: new Date().toISOString(),
  };

  // Console logging (severity-aware)
  if (severity === 'error') {
    console.error('[ErrorTool]', entry);
  } else if (severity === 'warning') {
    console.warn('[ErrorTool]', entry);
  } else {
    console.log('[ErrorTool]', entry);
  }

  // Persist to localStorage (best-effort) per analisi locale
  try {
    const existingRaw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const existing: AppErrorEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
    const next = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore persistence errors
  }

  // Invia l'errore a Sentry (se il DSN è configurato)
  try {
    const level: Sentry.SeverityLevel =
      severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';

    Sentry.captureMessage(message, {
      level,
      extra: {
        source,
        details,
        timestamp: entry.timestamp,
      },
    });
  } catch {
    // Non rompere mai il flusso se Sentry fallisce
  }
}

export function getClientErrorLogs(): AppErrorEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppErrorEntry[]) : [];
  } catch {
    return [];
  }
}
