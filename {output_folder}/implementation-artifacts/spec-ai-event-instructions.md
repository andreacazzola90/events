---
title: 'Istruzioni personalizzate per l’AI eventi'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'one-shot'
---

# Istruzioni personalizzate per l’AI eventi

## Intent

**Problem:** Dopo la prima estrazione, l’utente può correggere i campi manualmente ma non chiedere all’AI di reinterpretare l’evento usando il testo originale.

**Approach:** Mostrare un campo facoltativo, limitato a 1.500 caratteri, nella schermata di modifica della bozza appena estratta. Un’azione esplicita rielabora un solo evento con i dati correnti e il testo originale; aggiornare la bozza non salva né pubblica automaticamente.

## Suggested Review Order

**Modifica della bozza**

- Il campo appare solo nell’editor di una bozza e l’azione AI è separata dal salvataggio.
  [EventDisplay.tsx:489](../../app/components/EventDisplay.tsx#L489)

- L’azione invia i valori correnti senza pubblicare l’evento.
  [EventDisplay.tsx:197](../../app/components/EventDisplay.tsx#L197)

- L’endpoint rielabora un singolo evento e conserva immagine e sorgente.
  [route.ts:14](../../app/api/ai/reprocess-event/route.ts#L14)

- Le istruzioni sono limitate e delimitate come contesto facoltativo.
  [ai-instructions.ts:3](../../lib/ai-instructions.ts#L3)

**Verifiche**

- I test coprono la richiesta, l’aggiornamento e la conservazione dei dati sorgente.
  [ai-reprocess-api.test.mjs:47](../../lib/ai-reprocess-api.test.mjs#L47)
