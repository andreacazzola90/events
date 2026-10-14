---
title: 'Scansione orchestrata e riscansione delle bozze evento'
type: 'feature'
created: '2026-10-14'
status: 'draft'
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

## Code Map

- `lib/pdf-event-processing.ts`, `lib/pdf-text.ts`: acquisizione PDF, perdita di contesto e titoli euristici.
- `lib/event-processor.ts`, `lib/google-search.ts`, `lib/event-image.ts`: scansione link, arricchimento e immagini riutilizzabili.
- `app/api/process-pdf/route.ts`, `app/api/process-link/route.ts`: ingressi di scansione; timeout e controlli URL da rispettare.
- `app/api/ai/reprocess-event/route.ts`: rielaborazione senza acquisizione; deve restare distinta dalla riscansione.
- `app/components/EventDisplay.tsx`, `app/components/MultipleEventsEditor.tsx`, `app/crea/page.tsx`: revisione, stato bozza e pubblicazione.
- `app/components/ImageUploader.tsx`, `app/types/event.ts`: documento originale e contratto evento.

## Tasks & Acceptance

**Execution:**
- [ ] `lib/pdf-text.ts`, `lib/pdf-event-processing.ts` -- mantenere pagine complete e riferimenti dei candidati; separare censimento e dettaglio senza usare la sintesi globale come evidenza unica.
- [ ] `lib/event-scan-pipeline.ts` -- introdurre orchestratore testabile, ruoli specializzati, concorrenza limitata, conteggi e risultati parziali espliciti; riutilizzare ricerca e immagini verificate.
- [ ] `lib/event-processor.ts`, `app/api/process-pdf/route.ts`, `app/api/process-link/route.ts`, `app/types/event.ts` -- collegare pipeline e contratti mantenendo compatibilita e budget; dividere in batch quando necessario.
- [ ] `app/api/ai/rescan-event/route.ts` -- rileggere una fonte pubblica validata, riconoscere il candidato e restituire una proposta senza scritture evento.
- [ ] `app/components/EventDisplay.tsx`, `app/components/MultipleEventsEditor.tsx`, `app/components/ImageUploader.tsx`, `app/crea/page.tsx` -- aggiungere Riscansione con caricamento ed errori, proteggere modifiche concorrenti, conservare documenti disponibili e sincronizzare bozze multiple e comandi di pubblicazione.
- [ ] `lib/pdf-text.test.mjs`, `lib/event-scan-pipeline.test.mjs`, `lib/ai-reprocess-api.test.mjs`, `cypress/e2e/` -- coprire perdita contesto, corrispondenze, fallimenti parziali e aggiornamento della sola bozza; riutilizzare test e helper esistenti.
- [ ] `docs/API_REFERENCE.md` -- documentare nuovi contratti e comportamento in caso di limiti o dati mancanti.

**Acceptance Criteria:**
- Given un programma con due attivita nella stessa data, when viene scansionato, then restano eventi distinti con dettagli sostenuti dalle rispettive fonti.
- Given un candidato oltre i primi 3.000 caratteri, when viene estratto, then il suo testo pertinente raggiunge il ruolo di dettaglio senza la perdita osservata nel PDF FESAV.
- Given piu bozze, when una viene riscansionata, then soltanto quella viene aggiornata e la successiva pubblicazione usa i dati revisionati.
- Given attivita AI o web fallite, when l'orchestratore conclude, then conteggi e stato distinguono completamento, errori e lavoro pendente.
- Given una riscansione, when arriva il risultato, then nessun evento viene creato o pubblicato senza comando esplicito dell'utente.

## Spec Change Log

## Design Notes

Gli agenti sono ruoli applicativi coordinati, non processi autonomi senza controllo. Le pagine complete restano disponibili; ogni chiamata riceve solo il contesto pertinente al candidato, suddiviso senza perdita quando supera il budget. Titoli euristici e conteggio iniziale sono candidati da verificare, non il numero certo di eventi. Per FESAV verificare anche date e luoghi ereditati da intestazioni condivise. Evitare un nuovo framework agentico quando funzioni tipizzate e dipendenze esistenti bastano.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/pdf-text.test.mjs lib/pdf-url.test.mjs lib/event-scan-pipeline.test.mjs lib/ai-reprocess-api.test.mjs` -- regressioni della pipeline e API superate con servizi esterni simulati.
- `npx tsc --noEmit --incremental false` -- nessun nuovo errore TypeScript.
- `npx eslint <file modificati>` -- nessun nuovo errore nei file coinvolti.

**Browser:** Verificare su desktop e mobile Riscansione, stato occupato, errori, protezione modifiche concorrenti e aggiornamento di una bozza multipla. Sul PDF FESAV confrontare alcuni eventi distribuiti tra inizio, centro e fine con il testo originale; non pubblicare dati di prova. La verifica live AI dipende da disponibilita e quote dei provider, da dichiarare se impediscono la prova.