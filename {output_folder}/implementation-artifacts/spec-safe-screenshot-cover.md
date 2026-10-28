---
title: 'Copertine sicure da screenshot con scelta di immagini web'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: '01df94783bebdc9872648198fec45db992f2c2a1'
context: []
---

<frozen-after-approval reason="Regola privacy confermata; selezione web aggiunta dall utente il 2026-10-28">

## Intent

**Problem:** Il ritaglio automatico esiste, ma un errore o un risultato incerto mantiene lo screenshot originale pubblicabile. Un nome, avatar, numero personale o altro elemento dell'interfaccia social puo quindi finire nella copertina salvata.

**Approach:** Riutilizzare localizzazione AI, ritaglio Sharp e verifica privacy esistenti. Se il ritaglio fallisce, cercare immagini dell'evento sul web e proporre una galleria selezionabile prima dell'intervento manuale. Nessuna sostituzione senza scelta esplicita; ritaglio manuale e pubblicazione senza copertina rimangono disponibili. Mai ripiegare automaticamente sullo screenshot originale.

## Boundaries & Constraints

**Always:** Conservare i contenuti propri della locandina ed escludere account, avatar e comandi esterni. Finire il controllo prima di Pubblica; preservare estrazione parallela, annullamento e precedenza manuale. Originale solo temporaneo per estrazione e revisione. Cercare con titolo, data e luogo, mostrare fonte e anteprima dei candidati distinti, richiedere selezione e conferma. Distinguere ritaglio verificato, immagine web scelta e ritaglio manuale: nessuna garanzia assoluta di anonimizzazione o identita dell'immagine.

**Ask First:** Aggiungere provider/costi, modificare segreti, intervenire sulle immagini gia salvate o pubblicare eventi di prova reali. La ricerca web condizionata al fallimento e autorizzata; indisponibilita dei provider esistenti non autorizza nuovi servizi.

**Never:** Inviare tutto l'OCR o lo screenshot al motore di ricerca, cercare identita personali, ricostruire fotografie o selezionare automaticamente il primo risultato web. Nessuna cancellazione retroattiva. PDF, scansione URL e cron invariati. Non salvare l'originale attraverso campi secondari. Non scaricare URL privati, locali o non HTTP(S), anche dopo redirect.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ritaglio valido | Screenshot con locandina individuabile | Copertina verificata prima di Pubblica | Originale escluso dal payload persistente |
| Fallimento | Quota, timeout, servizio assente o risultato respinto | Bozza senza copertina automatica; avvio ricerca web dopo estrazione dati | Motivo e stato ricerca visibili |
| Risultati web | Immagini recuperate da pagine pertinenti | Galleria con anteprima e fonte; selezione esplicita prima della scelta manuale | Deduplicare; escludere immagini generiche o illeggibili |
| Scelta web | Utente conferma un candidato | Copertina scelta applicata solo all'evento corrente | Verificare download, tipo, dimensioni e metadati prima della persistenza |
| Nessun risultato | Provider assente, timeout o immagini non valide | Stato vuoto/errore, ritaglio manuale o nessuna copertina | Mai bloccare indefinitamente o ripristinare originale |
| Originale pulito | Locandina senza elementi esterni | Immagine ricodificata e approvata dal controllo esistente | Non applicare percentuali di taglio fisse |
| Interfaccia sovrapposta | Account copre testo essenziale | Astensione dal risultato automatico | Nessuna ricostruzione o abbassamento delle soglie |
| Intervento manuale | Utente ritaglia e conferma | Scelta manuale distinta dal risultato AI | Nessuna sovrascrittura tardiva |
| Piu eventi | Un upload produce piu bozze | Regola applicata a tutte le copertine ancora derivate dallo screenshot | Preservare modifiche individuali |
| Nuova scansione | Risultato vecchio arriva dopo reset o unmount | Ignorare e rilasciare risorse | Nessuna immagine applicata alla nuova bozza |

</frozen-after-approval>

## Code Map

- `lib/poster-crop.ts`: localizzazione, limiti screenshot, ritaglio e seconda verifica; restituisce undefined nei casi incerti.
- `app/api/crop-image/route.ts`: JPEG verificato oppure risposta senza immagine e motivo; nessuna persistenza.
- `lib/draft-image-crop.ts`: richiesta annullabile e classificazione del fallimento.
- `lib/google-search.ts`: ricerca pagine con Tavily/Google gia supportati; non e una ricerca inversa per immagini.
- `lib/event-image.ts`: recupero e selezione delle immagini social metadata delle pagine; riusare i filtri esistenti.
- Endpoint e helper di ricerca copertine da aggiungere accanto alle API immagini: risultati temporanei con URL immagine, titolo e pagina fonte; rete protetta e budget limitato.
- `app/crea/page.tsx`: selezione della copertina, applicazione risultato, pubblicazione singola e multipla.
- `app/components/EventDisplay.tsx`: stato e modifica manuale; oggi mostra originale mantenuto.
- `app/components/MultipleEventsEditor.tsx`: sincronizzazione delle bozze multiple.
- `app/api/events/route.ts`: confine di persistenza da verificare per immagine principale e campi originali.
- `lib/event-media.test.mjs`, `cypress/e2e/create-event-via-image.cy.ts`: test esistenti da estendere.

## Tasks & Acceptance

**Execution:**
- [x] `app/crea/page.tsx` -- rimosso fallback originale; ricerca e scelta per evento gestite nel pannello figlio, preservando modifiche successive.
- [x] `lib/google-search.ts`, `lib/event-image.ts` e nuove API -- helper esistenti riusati senza modifiche; aggiunti ricerca e download firmato con DNS fissato, controlli redirect e limiti.
- [x] `app/components/EventDisplay.tsx`, `app/components/MultipleEventsEditor.tsx` -- galleria con fonte/conferma e stati completi nel componente EventCoverPicker; propagazione multipla esistente verificata senza modifiche al contenitore.
- [x] `app/api/events/route.ts` e chiamanti -- verificata lista esplicita dei campi persistiti, nessun upload di originalImageUrl; client singolo/multiplo rimuovono il campo temporaneo prima dell'invio.
- [x] Test Node e `cypress/e2e/create-event-via-image.cy.ts` -- coperti matrice, query, rete, selezione, concorrenza e payload con provider/storage simulati.
- [x] `docs/API_REFERENCE.md` -- documentati fallback, trattamento temporaneo, API e limiti operativi.

**Acceptance Criteria:**
- Given controllo ancora in corso, when i dati sono pronti, then la bozza appare ma Pubblica attende l'esito immagine.
- Given fallimento del controllo automatico, when viene pubblicato l'evento senza interventi manuali, then nessun pixel dello screenshot originale entra nello storage.
- Given un ritaglio verificato, when viene pubblicato, then viene salvata soltanto la copertina selezionata senza ulteriori elaborazioni dopo la risposta.
- Given foto e contatti propri della locandina, when il ritaglio e valido, then non vengono rimossi come dati dell'utente.
- Given ritaglio fallito e candidati disponibili, when la ricerca termina, then l'utente puo scegliere un'immagine web prima del ritaglio manuale, senza copertina preselezionata.
- Given risultati arrivati dopo una scelta manuale o nuova scansione, when termina la ricerca, then nessuna scelta corrente viene sovrascritta.

## Spec Change Log

- 2026-10-28: l'utente conferma la regola privacy e richiede una selezione web prima dell'intervento manuale. Ricerca e galleria entrano nell'ambito; conservare astensione, conferma esplicita e divieto di inviare dati personali alle query.

## Design Notes

Ipotesi locale: la violazione del requisito nasce dal mantenimento dell'originale in handleNewEvents quando crop.result restituisce undefined, non dall'assenza del motore di ritaglio. Controllo discriminante: simulare risposta crop 204 e verificare che il successivo payload di pubblicazione non contenga lo screenshot o un suo allegato originale.

La ricerca disponibile restituisce pagine testuali, non certifica immagini identiche. Recuperare un numero limitato di pagine e relative immagini evento; presentarle come alternative da controllare, non come originali certificati. La conferma dell'utente sostituisce l'abbinamento automatico, non i controlli tecnici su rete e file. Nessuna immagine persistita prima di Pubblica.

## Verification

- `node --experimental-strip-types --test lib/event-media.test.mjs`: regressioni ritaglio e persistenza simulate.
- Test Node della ricerca: provider simulati, nessuna query con OCR, duplicati e URL privati/redirect rifiutati.
- Cypress isolato con `--env parallelCoverOnly=true --config trashAssetsBeforeRuns=false`: galleria, selezione e payload, stati vuoti/errore, ritaglio manuale, piu eventi e risposte tardive; aggiornare aspettative del fallback.
- `npx tsc --noEmit` ed ESLint dei soli file modificati: nessun nuovo errore.
- Prova su screenshot reale autorizzato: verificare bitmap completa e conservazione della locandina. Nessun file reale fornito in questa richiesta; non dichiararne verificata l'accuratezza.

**Risultati:** 78 test Node passati (media, ricerca, rete e reprocess); 12 test Cypress isolati passati, quattro legacy esclusi per evitare chiamate reali. TypeScript, lint mirato e diagnostica editor puliti. Anteprima sintetica controllata nel browser a 1440x1000 e 390x844: immagini caricate, nessuna preselezione, conferma abilitata soltanto dopo scelta, nessun overflow orizzontale. Mock rimossi ricaricando la pagina. Nessuna inferenza reale, scrittura DB/storage o pubblicazione di prova; nessun deployment.

## Review Findings

Tre revisioni indipendenti eseguite: critica del diff, casi limite e audit dei requisiti. Risolti come patch locali:
- Conferma della copertina con gli stessi byte dell'anteprima, senza secondo download e senza finestra di pubblicazione durante un download di conferma.
- Coda browser condivisa a due richieste per evitare saturazione dovuta a bozze o anteprime simultanee; annullamento anche scegliendo Senza copertina.
- Redazione dei numeri telefonici brevi preservando le date ISO e con slash.
- Propagazione esplicita degli errori del provider solo per la ricerca copertine, senza cambiare il fallback degli altri chiamanti.
- Ritaglio della copertina corrente distinto dall'azione Ritaglia originale.

Regressioni aggiunte per i casi segnalati. Limiti residui documentati: risultati web non certificati, quote/provider esterni, rate limit locali all'istanza e token locali senza il segreto auth esistente.

## Operational Prerequisite

Prova reale con query pubblica Teatro Civico Schio: endpoint HTTP 200 con status failed e zero candidati. Configurazione effettiva: Google presente, Tavily assente. Diagnostica sanitizzata del provider: HTTP 403, API_KEY_SERVICE_BLOCKED, servizio customsearch.googleapis.com. Per ricevere immagini reali occorre autorizzare la Custom Search API nelle restrizioni della chiave Google configurata e verificarne l'abilitazione nel progetto. Nessun segreto o permesso modificato. Questo blocco esterno non impedisce crop verificato, ritaglio manuale o pubblicazione senza copertina.

## Suggested Review Order

- Fallimento del crop: nessun ripiego automatico sullo screenshot.
	[page.tsx:195](../../app/crea/page.tsx#L195)
- Ricerca, anteprime locali e scelta esplicita degli stessi byte visualizzati.
	[EventCoverPicker.tsx:16](../../app/components/EventCoverPicker.tsx#L16)
- Esclusione originale dai payload e richieste accodate annullabili.
	[draft-image-crop.ts:15](../../lib/draft-image-crop.ts#L15)
- Query solo evento, candidati deduplicati e download firmati.
	[event-cover.ts:98](../../lib/event-cover.ts#L98)
- DNS pubblico fissato alla connessione, redirect e limiti di download.
	[event-cover-network.ts:56](../../lib/event-cover-network.ts#L56)
- Regressioni browser di selezione, pubblicazione e risposte tardive.
	[create-event-via-image.cy.ts:1](../../cypress/e2e/create-event-via-image.cy.ts#L1)