---
title: 'Scansione orchestrata e riscansione delle bozze evento'
type: 'feature'
created: '2026-10-14'
status: 'in-review'
baseline_commit: '7c06d782c30699953d5a69793da982ae418ecf28'
context: []
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** La scansione dei programmi PDF trova molti titoli ma perde i dettagli. Sul programma FESAV segnalato, 48 pagine e 49.122 caratteri diventano 2.956 caratteri di contesto per 88 titoli candidati. La rielaborazione attuale non rilegge la fonte e non recupera le informazioni perse.

**Approach:** Introdurre una pipeline orchestrata con ruoli AI specializzati: censimento, estrazione dei dettagli per evento, ricerca web con recupero dell'immagine pertinente e controllo finale. Aggiungere Riscansione nella revisione delle bozze per rileggere la fonte e proporre informazioni aggiornate per il solo evento selezionato. L'utente ha scelto di realizzare entrambe le parti nello stesso intervento.

## Boundaries & Constraints

**Always:** Conservare il testo delle pagine e il collegamento tra candidato e fonte; distinguere eventi diversi nella stessa giornata. Riutilizzare Groq, ricerca Tavily/Google e selezione immagini esistenti. Limitare concorrenza, richieste e durata; attendere le attivita avviate e mostrare errori e risultati incompleti. Non inventare campi mancanti. Applicare le modifiche soltanto alle bozze, mantenendo la pubblicazione esplicita. Conservare il linguaggio visivo esistente.

**Ask First:** Nuovi servizi a pagamento, migrazioni del database, worker esterni, salvataggio persistente dei documenti caricati o estensione alla scansione cron. Per un PDF caricato senza URL, richiedere nuovamente il documento quando non e piu disponibile nella sessione.

**Never:** Un'unica sintesi globale come unica evidenza per tutti gli eventi; immagini generiche spacciate per immagini verificate dell'evento; selezione automatica del primo risultato ambiguo; pubblicazione automatica; processi avviati dopo la risposta HTTP senza un sistema affidabile di esecuzione.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Programma lungo | PDF con molti eventi e piu eventi per pagina | Censimento con riferimenti pagina, dettagli ricavati dal contesto pertinente senza distruggerlo | Candidati dubbi e campi mancanti restano segnalati |
| Arricchimento | Evento identificato da titolo, data e luogo | Cercare pubblicazioni corrispondenti; aggiungere informazioni e immagine soltanto se pertinenti | Fonte discordante non sovrascrive dati attendibili |
| Ricerca indisponibile | Provider assente, timeout o errore | Conservare estrazione originale e indicare arricchimento non completato | Non dichiarare verificato un evento non controllato |
| Riscansione | Bozza con URL pubblico di PDF o pagina | Rileggere fonte, riconoscere lo stesso evento e aggiornare soltanto quella bozza | Corrispondenza assente o ambigua non cambia la bozza |
| Risposta obsoleta | Modifiche o cambio evento durante richiesta | Scartare risultato obsoleto; nessuna pubblicazione durante applicazione | Messaggio chiaro e possibilita di riprovare |
| Fonte assente | PDF caricato non piu disponibile | Richiedere documento o URL sorgente | Non simulare una nuova scansione dal vecchio testo |
| Limite esecuzione | Documento o ricerca supera budget | Elaborazione in batch controllati con conteggi conclusi, falliti e pendenti | Mai presentare un risultato parziale come completo |
| URL non sicuro | URL locale, privato o redirect vietato | Rifiutare acquisizione e riscansione | Riutilizzare ed estendere validazioni esistenti |

</frozen-after-approval>

## Estensione approvata — 2026-11-05

Migliorare i ritagli usando coppie originale/correzione manuale conservate privatamente solo dopo consenso esplicito, separate per account. Riutilizzare al massimo tre coppie recenti dello stesso account e dimensione sorgente nella richiesta di analisi esistente: recupero di esempi, non fine-tuning né nuove chiamate/provider. Cancellare dopo 180 giorni. Guest e utenti senza consenso mantengono il flusso attuale senza salvare immagini.

## Code Map

- `lib/pdf-event-processing.ts`, `lib/pdf-text.ts`, `app/api/process-pdf/route.ts`: PDF oggi riassunto prima di una singola estrazione Groq.
- `lib/event-processor.ts`, `lib/google-search.ts`, `lib/event-image.ts`, `app/api/process-link/route.ts`: scansione link e selezione immagini.
- `app/api/ai/reprocess-event/route.ts`, `app/components/EventDisplay.tsx`, `app/components/MultipleEventsEditor.tsx`, `app/crea/page.tsx`: rielaborazione e bozze; manca la riscansione.
- `lib/poster-crop.ts`, `lib/poster-crop-learning.ts`, `lib/scan-learning-store.ts`, `app/api/crop-image/route.ts`, `app/api/scan-learning/crop-sample/route.ts`: crop verificato e apprendimento delle coordinate.
- `app/components/EventImageCropper.tsx`, `app/lib/supabase.ts`, `prisma/schema.prisma`, `prisma/migrations/`, `vercel.json`: editor crop, storage server-only, metadati e cron.

## Tasks & Acceptance

**Execution:**
- [x] `lib/pdf-text.ts`, `lib/pdf-event-processing.ts`, `lib/event-scan-pipeline.ts` -- censire eventi, mantenere riferimenti alle pagine e limitare budget, concorrenza ed errori parziali.
- [x] `lib/event-processor.ts`, `app/api/process-pdf/route.ts`, `app/api/process-link/route.ts`, `app/types/event.ts` -- integrare la pipeline senza rompere i contratti correnti.
- [x] `app/api/ai/rescan-event/route.ts`, `app/components/EventDisplay.tsx`, `app/components/MultipleEventsEditor.tsx`, `app/components/ImageUploader.tsx`, `app/crea/page.tsx` -- proporre la riscansione di una fonte validata e proteggere la bozza da risposte obsolete.
- [x] `lib/poster-crop-learning.ts`, `lib/scan-learning-store.ts`, `app/api/scan-learning/crop-sample/route.ts`, `app/api/crop-image/route.ts`, `lib/vision-ai.ts`, `app/components/EventImageCropper.tsx`, `app/lib/supabase.ts`, `prisma/schema.prisma` -- consenso, esempi privati per account e recupero massimo di tre coppie, mantenendo verifica/fallback.
- [x] `prisma/migrations/`, `app/api/cron/cleanup-crop-learning/route.ts`, `vercel.json`, `lib/pdf-text.test.mjs`, `lib/event-scan-pipeline.test.mjs`, `lib/scan-learning.test.mjs`, `lib/event-media.test.mjs`, `lib/ai-reprocess-api.test.mjs`, `cypress/e2e/`, `docs/API_REFERENCE.md`, `docs/PROJECT_OVERVIEW.md`, `docs/DEPLOY_RUNBOOK.md` -- scadenza, test e documentazione.

**Acceptance Criteria:**
- Given due attività nella stessa data, when si scansiona il PDF, then restano distinte con prove legate alle rispettive pagine.
- Given più bozze, when se ne riscansiona una, then solo quella riceve una proposta e la pubblicazione resta esplicita; errori/limiti mostrano stati parziali.
- Given consenso esplicito, when un account applica un crop manuale, then originale e correzione sono privati e accessibili solo a quell'account.
- Given esempi recenti dello stesso account e dimensione, when si ritaglia, then al massimo tre coppie aiutano i provider esistenti e il risultato supera la verifica attuale.
- Given guest, rifiuto del consenso o dati scaduti, when si ritaglia o gira la pulizia, then non si riusano immagini altrui e si cancellano file/righe oltre 180 giorni.

## Spec Change Log

## Design Notes

Gli agenti sono ruoli coordinati; titoli euristici non sono conteggi certi e le prove restano legate ai candidati. Esempi crop privati, per account e input non fidato; senza consenso/provider si mantiene il flusso corrente.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/pdf-text.test.mjs lib/pdf-url.test.mjs lib/event-scan-pipeline.test.mjs lib/scan-learning.test.mjs lib/event-media.test.mjs lib/ai-reprocess-api.test.mjs lib/pdf-download.test.mjs lib/http-scraper.test.mjs lib/daily-cron.test.mjs lib/event-rescan.test.mjs` -- regressioni con provider simulati.
- `npx prisma validate && npx prisma generate`; `npx tsc --noEmit --incremental false`; `npx eslint <file modificati>` -- schema, tipi e lint.
- `npx cypress run --config trashAssetsBeforeRuns=false --spec cypress/e2e/orchestrated-event-scanning.cy.ts` -- flussi browser di riscansione e consenso.

**Manual checks:** Desktop/mobile, bucket Supabase privato attivo e isolamento su account reali, pulizia 180 giorni e confronto eventi FESAV su pagine distribuite non verificati in questa sessione; i test automatici coprono bozza multipla, consenso, isolamento e retention con provider/storage simulati. Nessuna pubblicazione di prova.

## Suggested Review Order

**PDF e link: acquisizione, prove e limiti**

- Inizia dal confine API che distingue upload PDF e URL pubblici.
  [`process-pdf/route.ts:8`](../../app/api/process-pdf/route.ts#L8)

- La pipeline conserva prove per pagina e rende visibili i risultati parziali.
  [`pdf-event-processing.ts:25`](../../lib/pdf-event-processing.ts#L25)

- Censimento e batch limitati impediscono di dichiarare completa una scansione incompleta.
  [`event-scan-pipeline.ts:119`](../../lib/event-scan-pipeline.ts#L119)

- Download e redirect sono limitati prima di passare il contenuto al parser.
  [`pdf-download.ts:6`](../../lib/pdf-download.ts#L6)

- Il link scanner riutilizza le fonti esistenti e blocca navigazioni non validate.
  [`process-link/route.ts:8`](../../app/api/process-link/route.ts#L8)

**Riscansione delle bozze**

- L’endpoint rilegge una fonte pubblica e restituisce solo una proposta prudente.
  [`rescan-event/route.ts:38`](../../app/api/ai/rescan-event/route.ts#L38)

- Il matching rifiuta i risultati mancanti o ambigui invece di scegliere arbitrariamente.
  [`event-rescan.ts:53`](../../lib/event-rescan.ts#L53)

- Il client scarta risposte obsolete e richiede applicazione esplicita alla bozza.
  [`EventDisplay.tsx:323`](../../app/components/EventDisplay.tsx#L323)

- Chiavi stabili preservano lo stato dell’editor quando cambia il draft selezionato.
  [`MultipleEventsEditor.tsx:57`](../../app/components/MultipleEventsEditor.tsx#L57)

**Ritagli privati con consenso**

- Autenticazione, consenso e validazione precedono qualunque salvataggio.
  [`crop-sample/route.ts:30`](../../app/api/scan-learning/crop-sample/route.ts#L30)

- Recupero per account/dimensione e retention limitano l’uso degli esempi.
  [`scan-learning-store.ts:72`](../../lib/scan-learning-store.ts#L72)

- Gli oggetti sono conservati nel bucket privato, senza URL pubblici.
  [`supabase.ts:156`](../../app/lib/supabase.ts#L156)

- Al massimo tre coppie vengono aggiunte alla richiesta vision già esistente.
  [`vision-ai.ts:87`](../../lib/vision-ai.ts#L87)

- I crop appresi restano soggetti alla verifica visiva e al fallback esistenti.
  [`poster-crop.ts:19`](../../lib/poster-crop.ts#L19)

- Lo schema lega i campioni all’account e consente la cancellazione correlata.
  [`schema.prisma:416`](../../prisma/schema.prisma#L416)

- La pulizia giornaliera elimina gli oggetti scaduti prima delle righe.
  [`cleanup-crop-learning/route.ts:7`](../../app/api/cron/cleanup-crop-learning/route.ts#L7)

**Verifica e operatività**

- I test browser coprono bozze multiple, risposte obsolete e consenso facoltativo.
  [`orchestrated-event-scanning.cy.ts:3`](../../cypress/e2e/orchestrated-event-scanning.cy.ts#L3)

- I test unitari esercitano prove pagina, limiti e scansioni parziali.
  [`event-scan-pipeline.test.mjs:44`](../../lib/event-scan-pipeline.test.mjs#L44)

- I casi missing/ambiguous proteggono la bozza da aggiornamenti non sicuri.
  [`event-rescan.test.mjs:18`](../../lib/event-rescan.test.mjs#L18)

- I test di account e dimensione verificano il limite di tre coppie.
  [`scan-learning.test.mjs:207`](../../lib/scan-learning.test.mjs#L207)

- Le istruzioni distinguono setup richiesto e verifiche ancora da fare dopo il deploy.
  [`DEPLOY_RUNBOOK.md:164`](../../docs/DEPLOY_RUNBOOK.md#L164)

- La reference documenta i contratti PDF, riscansione e consenso crop.
  [`API_REFERENCE.md:388`](../../docs/API_REFERENCE.md#L388)