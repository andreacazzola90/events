---
title: 'Rimozione immagine evento dal blocco iniziale homepage'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'one-shot'
---

# Rimozione immagine evento dal blocco iniziale homepage

## Intent

**Problem:** Il blocco iniziale della homepage usa l’immagine del primo evento di oggi come sfondo.

**Approach:** Rimuovere l’immagine dal blocco iniziale, mantenendo il gradiente e la lista degli eventi.

## Suggested Review Order

- L’hero resta indipendente dall’immagine dell’evento del giorno.
  [`page.tsx:20`](../../app/page.tsx#L20)
- Il gradiente mantiene lo sfondo grafico del blocco.
  [`globals.css:872`](../../app/globals.css#L872)
- Gli eventi di oggi restano visibili nel programma sottostante.
  [`page.tsx:69`](../../app/page.tsx#L69)
