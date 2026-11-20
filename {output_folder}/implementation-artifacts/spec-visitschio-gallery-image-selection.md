---
title: 'Selezione immagini dalla galleria VisitSchio'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
baseline_commit: '7d7776567b69a89fa3b2c8cf8e8d5f80cbb7beeb'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La scansione di eventi VisitSchio può salvare una copertina estranea all'evento, perché non considera le immagini della galleria Deskline. In particolare, `dw-gen-gallery-image` può essere annidato nello shadow root del widget e l'`img` mostra un `src` segnaposto mentre l'immagine reale è esposta da `currentSrc`/`srcset`.

**Approach:** Raccogliere le immagini dai componenti `dw-gen-gallery-image` delle pagine VisitSchio, attraversando gli shadow root accessibili e preferendo l'URL effettivamente renderizzato. La galleria dell'evento deve prevalere sui metadati generici della pagina; i fallback già esistenti restano disponibili per le pagine senza galleria.

## Boundaries & Constraints

**Always:** Limitare l'estrazione specifica al dominio VisitSchio e ai componenti della galleria; selezionare solo URL immagine web validi; ignorare placeholder e asset generici; mantenere intatti i fallback e l'ordine di selezione per gli altri provider.

**Ask First:** Modificare direttamente eventi già salvati o introdurre scraping/API aggiuntivi per recuperare immagini non esposte dal DOM.

**Never:** Usare immagini casuali della pagina o screenshot come copertina; sovrascrivere l'estrazione della galleria con `og:image` o altri metadati generici quando una foto di galleria valida è disponibile.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Galleria renderizzata | Pagina VisitSchio con `dw-gen-gallery-image` nello shadow root | Estrarre l'immagine effettiva da `currentSrc`/`srcset` e preferirla ai metadati generici | Ignorare valori vuoti o segnaposto |
| Galleria assente o vuota | Pagina VisitSchio senza URL immagine utilizzabile nella galleria | Proseguire con la selezione immagini esistente | Nessun fallback a immagini arbitrarie |
| Altri provider | Pagina non VisitSchio con immagini strutturate/social | Conservare priorità e comportamento attuali | Nessuna regressione |

</frozen-after-approval>

## Code Map

- `lib/event-processor.ts` -- raccolta delle candidate immagine dal DOM della pagina browser; oggi cerca schema, metadati e provider Dice, senza attraversare shadow root.
- `lib/event-image.ts` -- normalizzazione URL e priorità delle candidate.
- `lib/event-image.test.mjs` -- test esistenti di priorità, URL relativi e rifiuto di asset generici.

## Tasks & Acceptance

**Execution:**
- [x] `lib/event-processor.ts` -- raccogliere le immagini dentro `dw-gen-gallery-image` anche nei root shadow aperti, usando `currentSrc` e le sorgenti della picture anziché il `src` segnaposto.
- [x] `lib/event-image.ts`, `lib/event-image.test.mjs` -- aggiungere una sorgente di priorità dedicata alla galleria VisitSchio e verificare che prevalga su immagini social/schema generiche senza alterare gli altri casi.

**Acceptance Criteria:**
- Given una pagina evento VisitSchio con immagini valide in `dw-gen-gallery-image` e un `og:image` estraneo, when la scansione estrae le candidate, then salva una delle immagini della galleria.
- Given un evento senza immagini valide nella galleria, when la scansione seleziona la copertina, then mantiene i fallback attendibili esistenti e non promuove immagini casuali o screenshot.
- Given una pagina di un altro provider, when la scansione seleziona la copertina, then le priorità esistenti restano invariate.

## Verification

**Commands:**
- `node --test lib/event-image.test.mjs` -- test mirati sulle priorità e sulla selezione delle immagini.
- `npx eslint lib/event-processor.ts lib/event-image.ts` -- nessun errore sui file modificati.
- `npx tsc --noEmit` -- nessun errore di tipi.

**Manual checks:**
- Verificare sulla pagina VisitSchio dell'evento Make Lab 2.0 che gli URL raccolti provengano dai componenti `dw-gen-gallery-image`, non dal loro `src` segnaposto o da immagini del resto della pagina.

## Suggested Review Order

**Estrazione della galleria**

- Il punto d’ingresso applica il collector solo alle pagine VisitSchio.
  [`event-processor.ts:525`](../../lib/event-processor.ts#L525)

- Il collector attraversa shadow root aperti e privilegia l’immagine effettivamente renderizzata.
  [`event-image.ts:18`](../../lib/event-image.ts#L18)

**Priorità e regressioni**

- La sorgente della galleria precede schema e metadati social generici.
  [`event-image.ts:7`](../../lib/event-image.ts#L7)

- I test coprono shadow DOM, placeholder e priorità rispetto a metadati errati.
  [`event-image.test.mjs:45`](../../lib/event-image.test.mjs#L45)

- I casi di altri domini verificano che le priorità esistenti restino invariate.
  [`event-image.test.mjs:85`](../../lib/event-image.test.mjs#L85)
