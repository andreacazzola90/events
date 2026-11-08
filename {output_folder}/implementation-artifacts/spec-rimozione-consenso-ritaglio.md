---
title: 'Rimozione del consenso al ritaglio dalla schermata evento'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'one-shot'
baseline_commit: 'e2d2272591ea019c0c6aa21a31a984ce4507f86f'
---

# Rimozione del consenso al ritaglio dalla schermata evento

## Intent

**Problem:** La schermata di ritaglio mostra una richiesta di consenso facoltativa che può essere confusa con un requisito per scansionare la locandina.

**Approach:** Rimuovere la richiesta e l’invio degli esempi di ritaglio dalla schermata evento. La scansione e il ritaglio manuale restano disponibili; l’endpoint continua a richiedere un consenso esplicito per salvare campioni.

## Suggested Review Order

**Interfaccia e comportamento**

- Il ritaglio manuale continua senza raccogliere o inviare campioni.
  [`EventDisplay.tsx:147`](../../app/components/EventDisplay.tsx#L147)
- Il test e2e verifica l’assenza del consenso e dell’invio al relativo endpoint.
  [`orchestrated-event-scanning.cy.ts:202`](../../cypress/e2e/orchestrated-event-scanning.cy.ts#L202)

**Documentazione**

- L’API chiarisce che l’interfaccia non offre più il consenso al crop learning.
  [`API_REFERENCE.md:421`](../../docs/API_REFERENCE.md#L421)
