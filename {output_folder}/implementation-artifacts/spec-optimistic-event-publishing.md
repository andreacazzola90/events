---
title: 'Optimistic Event Publishing'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'one-shot'
baseline_commit: 'HEAD'
---

# Optimistic Event Publishing

## Intent

**Problem:** Publishing waited on the API without an immediate event-level status, and the user needed clear confirmation only after database creation plus a recoverable failure path.

**Approach:** Show a provisional card immediately with per-event pending, created, or duplicate status. Confirm successful database responses with a toast; on failure, retain the draft, show the error, and keep publishing available for retry.

## Suggested Review Order

- The submission begins with provisional event cards before the first network wait.
  [`page.tsx:166`](../../app/crea/page.tsx#L166)

- Per-event status and the confirmed success toast reflect actual API outcomes.
  [`page.tsx:263`](../../app/crea/page.tsx#L263)

- The provisional card communicates pending, created, and duplicate states accessibly.
  [`page.tsx:559`](../../app/crea/page.tsx#L559)