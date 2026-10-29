---
title: 'Favicon logo E/S'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'one-shot'
---

# Favicon logo E/S

## Intent

**Problem:** La favicon mostrava un triangolo invece del logo E/S del sito.

**Approach:** Sostituire l'icona dell'App Router con una ICO multi-dimensione generata dal logo E/S esistente e lasciare che Next.js gestisca il relativo link con cache-busting.

## Suggested Review Order

**Servizio della favicon**

- Next.js genera un link versionato alla nuova icona dell'App Router.
  [`layout.tsx:116`](../../app/layout.tsx#L116)

- La ICO include il logo E/S nelle dimensioni 16, 32 e 48 px.
  [`favicon.ico:1`](../../app/favicon.ico#L1)
