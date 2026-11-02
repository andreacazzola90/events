---
title: 'Anteprime e PDP eventi in stile streaming'
type: 'feature'
created: '2026-11-02'
status: 'done'
route: 'one-shot'
---

# Anteprime e PDP eventi in stile streaming

## Intent

**Problem:** Le preview degli eventi e la pagina dettaglio mostravano immagini piccole, pannelli chiari e cornici poco coerenti con la nuova homepage.

**Approach:** Usare copertine ampie con testo leggibile su sfumature scure, rimuovere i bordi decorativi e mantenere accessibili preferiti e metadati in tutte le larghezze.

## Suggested Review Order

**PDP evento**

- La struttura separa poster e contenuti, conservando metadati e azioni.
  [`page.tsx:169`](../../app/events/[slug]/page.tsx#L169)

- La pagina applica il tema scuro, il gradiente e il fallback per le immagini mancanti.
  [`globals.css:1990`](../../app/globals.css#L1990)

**Eventi correlati**

- Le schede correlate condividono la presentazione scura e senza bordi.
  [`page.tsx:304`](../../app/events/[slug]/page.tsx#L304)

**Preview eventi**

- La lista mantiene preferiti e badge mentre elimina la barra laterale di categoria.
  [`EventList.tsx:547`](../../app/components/EventList.tsx#L547)

- Le cover ospitano titolo e dettagli su un overlay sfumato.
  [`globals.css:1168`](../../app/globals.css#L1168)
