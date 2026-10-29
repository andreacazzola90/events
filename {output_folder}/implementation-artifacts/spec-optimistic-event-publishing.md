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

## Publication Controls (2026-10-29)

**Problem:** The lower publish-all button used an unavailable gradient, leaving white text on a transparent background. Cover processing and duplicate checks disabled both publication controls before the user could act.

**Approach:** Use a solid dark background with white text, initially enable both controls, and report cover-processing or duplicate-only errors after clicking. Preserve the image privacy check before any request. A shared synchronous in-flight guard and parent state disable both controls only during actual publication; errors preserve drafts and allow retry. Clicking while the cover is processing shows a message; it does not queue automatic publication.

**Review:** Independent review found a test-selector issue: contains(...).last() still selected the first button. Explicit top/bottom test IDs now exercise both handlers and the error/retry path.

**Verification:** 15 focused Cypress tests passed with `--env parallelCoverOnly=true --config trashAssetsBeforeRuns=false`, covering active controls during cropping, duplicate-only feedback, solid background, responsive widths, shared in-flight state and successful retry. TypeScript, scoped ESLint and editor diagnostics passed. All saves in these tests were mocked; no real event was published. Four legacy OCR tests are excluded by the existing filter; an unfiltered run exposed their preexisting expectation of an original image and the removed Aggiungi evento command. That unrelated test was not changed. The shared browser connection timed out; Cypress responsive/contrast assertions passed, while fixed-header-obscured cropped captures were discarded as visual evidence.

### Review Stops

- Parent publication guard, validation after click and shared sending state.
  [page.tsx:219](../../app/crea/page.tsx#L219)
- Visible footer action, accessible errors and synchronized busy state.
  [MultipleEventsEditor.tsx:40](../../app/components/MultipleEventsEditor.tsx#L40)
- Duplicate-only feedback, actual footer clicks and retry regression.
  [create-event-via-image.cy.ts:174](../../cypress/e2e/create-event-via-image.cy.ts#L174)