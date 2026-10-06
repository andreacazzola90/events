---
title: 'Migliorare la selezione delle immagini evento'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'one-shot'
---

# Migliorare la selezione delle immagini evento

## Intent

**Problem:** L'importazione poteva salvare immagini generiche della pagina o screenshot come copertina dell'evento.

**Approach:** Preferire immagini dichiarate nei dati strutturati dell'evento e nei metadati social, filtrare asset generici e lasciare l'immagine vuota quando non è attendibile. Conservare lo screenshot solo per OCR.

## Suggested Review Order

**Estrazione e selezione**

- Prima i segnali strutturati dell'evento; screenshot separato dal campo immagine salvato.
  [`event-processor.ts:468`](../../lib/event-processor.ts#L468)

- Normalizzazione degli URL e filtro di loghi, placeholder e protocolli non web.
  [`event-image.ts:33`](../../lib/event-image.ts#L33)

- Il fallback HTTP usa solo metadati, senza promuovere la prima immagine trovata.
  [`http-scraper.ts:36`](../../lib/http-scraper.ts#L36)

- Test su priorità, asset generici, URL relativi e ordine degli attributi HTML.
  [`event-image.test.mjs:25`](../../lib/event-image.test.mjs#L25)