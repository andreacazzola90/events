---
title: 'Spinner durante il caricamento degli eventi in homepage'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
route: 'one-shot'
---

# Spinner durante il caricamento degli eventi in homepage

## Intent

**Problem:** Quando si selezionano oggi, domani o un altro periodo in homepage, il messaggio “Nessun evento trovato” appare mentre la richiesta degli eventi è ancora in corso.

**Approach:** Segnalare lo stato di caricamento con uno spinner al posto dello stato vuoto, mantenendo visibili i filtri.

## Suggested Review Order

- Attiva lo stato di caricamento per ogni richiesta, anche dopo il caricamento iniziale.
  [`EventList.tsx:171`](../../app/components/EventList.tsx#L171)

- Mostra lo spinner prima dello stato “nessun evento”.
  [`EventList.tsx:521`](../../app/components/EventList.tsx#L521)

- Nasconde la paginazione mentre lo spinner sostituisce le schede.
  [`EventList.tsx:656`](../../app/components/EventList.tsx#L656)
