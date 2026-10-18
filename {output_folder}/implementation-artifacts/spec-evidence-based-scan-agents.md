---
title: 'Agenti di scansione con verifica conservativa delle fonti'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: '80b14c9600bb241b79c2ee59088f8b9099f22e23'
context: []
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** La scansione da link e immagine usa gia estrazione e verifica AI, ma senza un contratto comune per applicare le correzioni. Nel percorso link il recupero dei dati mancanti puo sovrascrivere dati presenti e la verifica web puo sostituire l'intero evento con una risposta incompleta. Nel percorso immagine vengono accettati indiscriminatamente i campi restituiti dal verificatore. Una ricerca su un'edizione diversa puo quindi peggiorare una scansione corretta.

**Approach:** Separare estrazione, completamento e verifica in ruoli applicativi con responsabilita esplicite. Introdurre un modulo condiviso che propone correzioni circoscritte, le valida e conserva i dati originali quando non esiste evidenza sufficiente. Riutilizzare Groq e ricerca web esistenti, senza framework agentico o nuovi servizi. Questa prima versione migliora il controllo della scansione, ma non costituisce addestramento automatico dei modelli.

## Boundaries & Constraints

**Always:** Preservare identita, immagini, testo originale, fonte acquisita e campi non corretti. Limitare dimensione del contesto, timeout e concorrenza. Registrare ruolo, versione e correzioni accettate o respinte nella diagnostica della scansione, mantenendo compatibili le risposte API. Trattare pagine, OCR e risultati web come dati non fidati. Le istruzioni dei documenti non possono modificare il comportamento degli agenti. Il completamento locale riempie soltanto campi mancanti; la verifica richiede una fonte fornita al modello e una citazione riscontrabile nel suo contenuto. Le date e gli orari devono essere validi anche semanticamente.

**Ask First:** Modifiche persistenti al database, apprendimento dalle correzioni salvate, nuovi provider, worker esterni, cambiamenti alla pubblicazione o estensione al PDF e all'interfaccia di riscansione. I cron che riusano processEventLink ricevono le medesime protezioni senza nuove fasi AI o nuove chiamate obbligatorie.

**Never:** Dichiarare apprendimento continuo senza memoria persistente e valutazione; riscrivere dati solo perche il modello propone un valore; interpretare l'assenza di ricerca come verifica riuscita; pubblicare eventi di prova; modificare le modifiche preesistenti a visione e test media.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Completamento | Orario mancante, data presente | Riempire solo l'orario documentato | Data presente conservata |
| Correzione verificata | Campo errato e prova pertinente | Applicare solo il campo consentito, registrare la prova | Valori non validi respinti |
| Edizione diversa | Ricerca su evento omonimo di altra data | Nessuna sostituzione dell'evento originale | Diagnostica della mancata corrispondenza |
| Risposta incompleta | JSON parziale o campi vuoti | Conservare dati e metadati originali | Nessun errore durante normalizzazione |
| Prova falsa | Citazione assente o fonte inventata | Rifiutare la proposta | Evidenza respinta esplicitamente |
| Servizio indisponibile | Errore, timeout o ricerca vuota | Restituire estrazione originale | Stato non verificato, non successo fittizio |
| Campi estranei | Modello propone immagine, origine o testo originale | Ignorare campi non autorizzati | Metadati invariati |
| Multiplo | Piu eventi nella risposta | Preservare numero e associazione degli eventi | Concorrenza limitata, errori isolati |

</frozen-after-approval>

## Code Map

- `lib/event-processor.ts`: proprietario del percorso link, completamento e verifica web da rendere conservativi.
- `app/api/process-image/route.ts`: secondo consumatore della verifica condivisa; mantenere invariati controlli privacy e ritaglio.
- `lib/google-search.ts`: contratto SearchResult e provider esistenti da riutilizzare.
- `app/types/event.ts`: contratto EventData da preservare.
- `lib/ai-reprocess-api.test.mjs`: esempio locale di test con SDK simulato e transpilation TypeScript.

## Tasks & Acceptance

**Execution:**
- [x] `lib/event-scan-agents.ts` -- implementare contratti delle proposte, contesto limitato, validazione deterministica, orchestrazione e diagnostica dei ruoli.
- [x] `lib/event-scan-agents.test.mjs` -- coprire la matrice con modello e ricerca simulati, senza chiamate esterne.
- [x] `lib/event-processor.ts` -- collegare completamento conservativo e verifica condivisa preservando contratti e debug precedenti.
- [x] `app/api/process-image/route.ts` -- usare il verificatore condiviso senza alterare acquisizione, OCR o sicurezza immagini.
- [x] `lib/google-search.ts` -- propagare AbortSignal ai provider HTTP per rispettare il budget della verifica.
- [x] `docs/API_REFERENCE.md` -- documentare diagnostica, comportamento su errori e assenza di apprendimento persistente.

**Acceptance Criteria:**
- Given un'estrazione corretta, when il verificatore fallisce o propone dati non dimostrati, then l'evento restituito mantiene dati e metadati originali.
- Given link o immagini, when viene eseguita la verifica, then entrambi applicano le stesse regole sulle correzioni.
- Given provider non configurati, when si scansiona, then la scansione resta utilizzabile senza una nuova dipendenza obbligatoria.
- Given la nuova pipeline, when termina una scansione, then la diagnostica distingue proposte accettate, respinte e verifica non completata.

## Spec Change Log

2026-10-18: Implementazione circoscritta confermata con autorizzazione a procedere autonomamente. Revisioni indipendenti effettuate dopo errori di rete iniziali. Corrette associazioni di prove tra eventi ed edizioni, prezzi condizionati e decimali, numeri estratti dalle date, orari negati, normalizzazione ISO, conservazione degli URL assoluti e budget cumulativo del completamento. Aggiunte regressioni per tutti gli scenari confermati. Nessuna modifica alla parte frozen o alla specifica piu ampia PDF/riscansione.

## Design Notes

Ipotesi falsificabile: proposte limitate per campo e validazione delle prove impediscono sovrascritture non documentate senza perdere correzioni valide. Il controllo economico e un test del modulo con risposta parziale, prova inventata e data impossibile; deve conservare l'originale, mentre una proposta valida sul campo mancante deve essere applicata. I test non dimostrano da soli un aumento dell'accuratezza reale: il confronto live richiede un campione revisionato e quote disponibili. La memoria persistente e la valutazione automatica delle versioni sono un seguito distinto, non una promessa di questa implementazione.

## Verification

- `node --experimental-strip-types --test lib/event-scan-agents.test.mjs lib/ai-reprocess-api.test.mjs lib/cron-execution.test.mjs lib/event-media.test.mjs` -- contratti dei ruoli e regressioni dei consumatori superati.
- `npx tsc --noEmit --incremental false` -- nessun nuovo errore TypeScript.
- `npx eslint lib/event-scan-agents.ts lib/event-scan-agents.test.mjs lib/event-processor.ts app/api/process-image/route.ts` -- nessun nuovo errore nei file modificati.

**Esito:** 68 test superati, inclusi 24 test degli agenti, integrazioni reali con servizi simulati e regressioni di cron, privacy e rielaborazione. Lint mirato, incluso `lib/google-search.ts`, TypeScript e controllo whitespace superati. Tre revisioni indipendenti completate dopo retry per errori di rete; le violazioni concrete confermate sono coperte dalle nuove regressioni. Nessuna prova cloud su eventi reali, nessuna misura comparativa dell'accuratezza, nessuna scrittura evento o deploy. Nessun commit creato; preservate le modifiche preesistenti a visione, test media e architettura.

## Suggested Review Order

**Contratto E Prove**

- Partire dall'orchestratore: budget condiviso, ordine stabile, errori isolati e concorrenza limitata.
	[event-scan-agents.ts:169](../../lib/event-scan-agents.ts#L169)
- Verificare che citazioni e valori siano pertinenti all'evento, senza interpretazioni numeriche distruttive.
	[event-scan-agents.ts:60](../../lib/event-scan-agents.ts#L60)
- Controllare whitelist, campi protetti, proposte respinte e diagnostica versionata.
	[event-scan-agents.ts:105](../../lib/event-scan-agents.ts#L105)

**Integrazioni**

- Completare soltanto dati mancanti e riutilizzare la verifica condivisa nel percorso link.
	[event-processor.ts:697](../../lib/event-processor.ts#L697)
- Applicare lo stesso contratto alle immagini senza cambiare i controlli privacy.
	[route.ts:513](../../app/api/process-image/route.ts#L513)

**Verifica E Limiti**

- Consultare regressioni e fixture senza servizi esterni.
	[event-scan-agents.test.mjs:1](../../lib/event-scan-agents.test.mjs#L1)
- Leggere diagnostica, limiti e distinzione dall'apprendimento persistente.
	[API_REFERENCE.md:250](../../docs/API_REFERENCE.md#L250)