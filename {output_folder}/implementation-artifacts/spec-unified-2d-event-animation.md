---
title: 'Animazione 2D unificata per creazione e pubblicazione evento'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '26a0740953416a5b93d09489c683ac6abd1bec6c'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La scansione dell’evento mostra una scena 3D a schermo intero, mentre la preparazione e pubblicazione automatica usano una scena 2D distinta. Il passaggio sembra interrompere l’esperienza e l’attesa offre pochi dettagli su cosa stia succedendo.

**Approach:** Usare la stessa scena 2D illustrata durante scansione, preparazione e pubblicazione, con uno sfondo animato e piccoli cambi visivi e testuali ogni pochi secondi. I messaggi spiegano l’operazione corrente e il passaggio successivo, senza fingere avanzamenti.

## Boundaries & Constraints

**Always:** Riutilizzare una sola esperienza visiva 2D per scansione immagine, PDF, link e immagine condivisa, e per le fasi dell’autopilota. Collegare i cambi di fase agli stati reali già esistenti. Cambiare dettagli e testo a intervalli di circa tre secondi solo durante attese prolungate; i testi devono descrivere operazioni reali o il prossimo controllo previsto. Mantenere il messaggio specifico della scansione, la leggibilità mobile, lo stato accessibile e il rispetto di `prefers-reduced-motion`. Conservare invariati controlli, decisioni di pubblicazione, errori e retry.

**Ask First:** Modifiche al flusso di pubblicazione, agli endpoint, alle regole dell’autopilota o agli stati che interrompono la pubblicazione.

**Never:** WebGL/3D o seconda animazione concorrente nel flusso di creazione; percentuali, conto alla rovescia o risultati non confermati; nuove librerie o asset remoti; animazione obbligatoria con movimento ridotto.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scansione | Immagine, PDF, link o immagine condivisa in elaborazione | Scena 2D condivisa, messaggio specifico e dettagli che cambiano se l’attesa continua | Al termine la scena scompare; gli errori esistenti restano visibili |
| Preparazione evento | Copertina, sezioni o controllo duplicati in attesa | La stessa illustrazione mostra la fase reale e spiega il prossimo controllo | Duplicati o dati incompleti fermano l’autopilota come oggi |
| Pubblicazione | POST in corso o confermato | La scena continua nella fase di pubblicazione; il decollo avviene solo dopo conferma | Un errore conserva bozza, messaggio e possibilità di retry |
| Movimento ridotto | `prefers-reduced-motion: reduce` | Illustrazione e sfondo statici; messaggi e fasi continuano ad aggiornarsi | Nessuna attesa aggiunta prima della navigazione |

</frozen-after-approval>

## Code Map

- `app/components/LoadingAnimation.tsx` -- riutilizza la scena 2D durante scansioni di immagini, PDF, link e contenuti condivisi.
- `app/components/ImageUploader.tsx` -- distingue l’elaborazione di un PDF da quella di un’immagine per usare copy specifici.
- `app/components/RocketLaunchAnimation.tsx` -- illustrazione e overlay 2D condivisi, con messaggi contestuali, comportamento accessibile e blocco/ripristino della pagina.
- `app/components/SaveAnimation.tsx` -- riusa la scena 2D condivisa durante il salvataggio manuale, mantenendo il contratto di stato.
- `app/components/EventDisplay.tsx` -- invoca l’animazione nella pubblicazione manuale per evento dall’editor di scansioni multiple.
- `app/crea/page.tsx` -- collega i messaggi dell’autopilota agli stati reali e mostra icone statiche nelle schede mentre la scena è attiva.
- `app/globals.css` -- sfondo animato, dettagli periodici e regole per movimento ridotto.
- `cypress/e2e/create-event-via-link.cy.ts` -- copre overlay 2D, scansioni dei diversi ingressi, copy periodica e accessibilità.
- `cypress/e2e/create-event-via-image.cy.ts` -- copre responsive, movimento ridotto, fasi e controlli dell’autopilota.

## Tasks & Acceptance

**Execution:**
- [x] `app/components/LoadingAnimation.tsx`, `app/components/ImageUploader.tsx`, `app/components/RocketLaunchAnimation.tsx` -- riusare la stessa scena 2D per scansione e autopilota, passando fase e messaggio specifico (incluso PDF) senza sovrapporre un secondo caricamento.
- [x] `app/components/SaveAnimation.tsx` -- riusare la scena 2D condivisa per il salvataggio manuale invece della Lottie, conservando stati e callback esistenti.
- [x] `app/crea/page.tsx` -- evitare spinner animati sulle schede ottimistiche mentre la scena autopilota è visibile, mantenendo le icone di stato.
- [x] `app/globals.css` -- aggiungere sfondo animato, dettagli di scena e transizioni periodiche; rendere statici tutti i movimenti con `prefers-reduced-motion`.
- [x] `app/components/ScanScene3D.tsx`, `app/components/ScanScene3D.module.css` -- rimuovere la vecchia scena solo se la ricerca dei riferimenti conferma che non è più usata.
- [x] `cypress/e2e/create-event-via-link.cy.ts`, `cypress/e2e/create-event-via-image.cy.ts` -- sostituire le verifiche legate al canvas/fullscreen e testare scena 2D, cambi periodici, fasi autopilota e movimento ridotto.

**Acceptance Criteria:**
- Given una scansione immagine, PDF, link o condivisa, when è in corso, then è visibile la scena 2D riutilizzata anche dall’autopilota, senza canvas WebGL né overlay duplicati.
- Given una fase di attesa che dura più di alcuni secondi, when passa un intervallo, then cambiano dettagli visivi e testo esplicativo, senza percentuali e senza dichiarare completato un controllo ancora in corso.
- Given copertina, controlli duplicati o salvataggio in corso, when cambia il relativo stato reale, then la scena e il messaggio descrivono quella fase e il passaggio successivo corretto.
- Given l’utente pubblica un evento dall’editor di una scansione multipla, when il POST è in corso, then appare la stessa scena 2D e non una Lottie distinta.
- Given la scena dell’autopilota è visibile, when una scheda è pronta o in pubblicazione, then la scheda mostra un’icona di stato statica e non un secondo indicatore animato.
- Given un errore, duplicato o movimento ridotto, when la scena è mostrata, then restano rispettivamente il flusso di revisione/retry esistente o una scena senza movimento, senza cambiare l’esito di pubblicazione.

## Spec Change Log

### 2026-11-06

- Unificata la scena 2D per scansione e autopilota con copy specifiche per immagine, PDF, link e immagine condivisa; aggiunto il cambio periodico dei dettagli e rispettato `prefers-reduced-motion`.
- Rimosse le scene 3D dopo aver verificato che non restassero riferimenti attivi in `app` o `cypress`; mantenuti blocco accessibile, focus, controlli e flussi esistenti.
- La revisione ha rilevato l’overlay Lottie del salvataggio manuale in `EventDisplay`; la specifica ora richiede di riusare anche lì la scena 2D condivisa, evitando un secondo stile nel flusso di creazione.
- La revisione ha rilevato anche lo spinner delle schede ottimistiche durante l’autopilota; ora la scena centrale è l’unico elemento animato di stato in quel flusso.

## Verification

**Commands:**
- `npx cypress run --spec cypress/e2e/create-event-via-link.cy.ts --env grep='Unified 2D scanning' --config trashAssetsBeforeRuns=false` -- 22 passing, 3 pending.
- `npx cypress run --spec cypress/e2e/create-event-via-image.cy.ts --config trashAssetsBeforeRuns=false` -- 42 passing, 0 failing.
- `npx tsc --noEmit` -- nessun errore TypeScript.
- `npx eslint app/components/LoadingAnimation.tsx app/components/RocketLaunchAnimation.tsx app/components/SaveAnimation.tsx app/components/ImageUploader.tsx app/crea/page.tsx cypress/e2e/create-event-via-link.cy.ts cypress/e2e/create-event-via-image.cy.ts` -- nessun errore sui file modificati.
- `git diff --check` -- exit code 0.

## Suggested Review Order

**Una sola scena per scansione e salvataggio**

- Il dispatcher porta ogni scansione alla scena 2D usata anche nelle fasi successive.
  [`LoadingAnimation.tsx:37`](../../app/components/LoadingAnimation.tsx#L37)
- Timer, messaggi, dettagli e accessibilità restano nella stessa illustrazione.
  [`RocketLaunchAnimation.tsx:72`](../../app/components/RocketLaunchAnimation.tsx#L72)
- Anche la pubblicazione manuale riusa le fasi 2D, senza la vecchia Lottie.
  [`SaveAnimation.tsx:27`](../../app/components/SaveAnimation.tsx#L27)

**Stati reali, senza animazioni concorrenti**

- I messaggi dell’autopilota dipendono da copertina, sezioni, duplicati e POST.
  [`page.tsx:112`](../../app/crea/page.tsx#L112)
- Le schede mantengono lo stato leggibile con icone statiche durante l’autopilota.
  [`page.tsx:970`](../../app/crea/page.tsx#L970)

**Sfondo, accessibilità e regressioni**

- Lo sfondo animato segue i vincoli di movimento ridotto definiti dal CSS.
  [`globals.css:2376`](../../app/globals.css#L2376)
- I test coprono scansione, copy periodica e pubblicazione manuale nella scena unica.
  [`create-event-via-link.cy.ts:402`](../../cypress/e2e/create-event-via-link.cy.ts#L402)
- Le verifiche autopilota escludono un secondo spinner sulle schede.
  [`create-event-via-image.cy.ts:778`](../../cypress/e2e/create-event-via-image.cy.ts#L778)
