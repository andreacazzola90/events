---
title: 'Publish and Return Actions'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'one-shot'
baseline_commit: 'HEAD'
---

# Publish and Return Actions

## Intent

**Problem:** The event creation screen used a plural publish label for a single event and did not offer a clear, secondary return action beside publishing.

**Approach:** Show “Pubblica” for one event, preserve the plural label for multiple events, and pair publishing with a smaller “Torna indietro” action. Keep one action pair visible per mode and disable returning during a save.

## Suggested Review Order

- The single-event sticky actions clear the draft on return and use the singular publish label.
  [`page.tsx:533`](../../app/crea/page.tsx#L533)

- The multiple-event editor keeps the plural label and pairs it with a compact return action.
  [`MultipleEventsEditor.tsx:18`](../../app/components/MultipleEventsEditor.tsx#L18)