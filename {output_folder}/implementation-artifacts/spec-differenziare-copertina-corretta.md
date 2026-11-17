---
title: 'Distinguere copertina già corretta dagli errori di ritaglio'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'one-shot'
baseline_commit: '282838cd17387f933af66aaf71f8feb806337060'
---

# Distinguere copertina già corretta dagli errori di ritaglio

## Intent

**Problem:** Quando una locandina è già ben inquadrata, l’analisi può non trovare un ritaglio e il programma mostra lo stesso errore usato per timeout, bassa confidenza o verifica fallita. Questo confonde un esito valido con un guasto e può bloccare la pubblicazione.

**Approach:** Richiedere all’analisi una classificazione esplicita “già corretta”, accettarla solo con alta confidenza e verifica visiva positiva, e comunicarla separatamente dagli errori. In caso di esito valido si conserva l’originale e la pubblicazione prosegue; in caso di incertezza o errore la bozza resta distinguibile come fallita e richiede revisione.

## Suggested Review Order

**Riconoscimento e verifica**

- La classificazione positiva richiede un’esplicita risposta ad alta confidenza e una seconda verifica visiva.
  [`poster-crop.ts:131`](../../lib/poster-crop.ts#L131)

- Un poster verificato come già corretto restituisce l’originale senza applicare un crop.
  [`poster-crop.ts:140`](../../lib/poster-crop.ts#L140)

**Contratto e comportamento dell’interfaccia**

- L’endpoint distingue l’esito invariato dai motivi di errore.
  [`route.ts:56`](../../app/api/crop-image/route.ts#L56)

- Il client conserva lo stato “nessun ritaglio necessario” separato dal fallimento.
  [`draft-image-crop.ts:130`](../../lib/draft-image-crop.ts#L130)

- La bozza mantiene l’originale, classifica lo stato e continua il rilevamento delle sezioni multiple.
  [`page.tsx:388`](../../app/crea/page.tsx#L388)

- L’interfaccia mostra un messaggio di successo specifico e l’autopubblicazione accetta l’esito valido.
  [`EventDisplay.tsx:513`](../../app/components/EventDisplay.tsx#L513)
  [`event-autopilot.ts:53`](../../lib/event-autopilot.ts#L53)

**Regressioni e documentazione**

- I test coprono classificazione positiva, rifiuto della verifica e confidenza insufficiente.
  [`poster-crop.test.mjs:30`](../../lib/poster-crop.test.mjs#L30)

- Gli E2E coprono pubblicazione originale, poster multipli e autopubblicazione.
  [`create-event-via-image.cy.ts:189`](../../cypress/e2e/create-event-via-image.cy.ts#L189)

- Il contratto HTTP documenta la distinzione tra invariato ed errore.
  [`API_REFERENCE.md:440`](../../docs/API_REFERENCE.md#L440)
