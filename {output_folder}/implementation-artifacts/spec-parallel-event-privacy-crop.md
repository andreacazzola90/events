---
title: 'Ritaglio privacy della bozza prima della pubblicazione'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: '35304ee9a7c9af901ac512afb73402332ef74cc3'
context: []
---

<frozen-after-approval reason="Intento aggiornato dall'utente: crop prima di Pubblica con stato visibile">

## Intent

**Problem:** Gli screenshot social possono includere avatar e nomi non appartenenti alla locandina. La loro rimozione non deve impedire il salvataggio dell'evento.

**Approach:** Avviare estrazione e crop in parallelo al caricamento. Mostrare la bozza appena pronti i dati, con originale e stato immagine in elaborazione; sostituire la copertina soltanto dopo crop Sharp e verifica vision. Pubblicare poi la copertina mostrata, senza altre analisi AI; qualsiasi errore mantiene l'originale.

## Boundaries & Constraints

**Always:** Preservare foto, loghi e testo propri della locandina. Limitare il budget AI; proteggere modifiche manuali concorrenti e bozze successive da risultati tardivi. Pubblica resta disabilitato fino a esito crop o fallback. Nessuna scrittura DB/storage prima della pubblicazione. Il fallback originale non garantisce privacy.

**Ask First:** Costi API, cambi di infrastruttura, pubblicazione di dati di prova in produzione, rimozione dell'originale come fallback.

**Never:** Riconoscimento persone, blur o ricostruzione dell'immagine; crop di PDF, scraping o copertine ritagliate manualmente; modifica dei segreti; promessa di servizio gratuito illimitato.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Crop valido | Upload immagine e locandina individuata | Bozza subito con originale e stato; crop verificato sostituisce copertina prima di Pubblica | Nessuna attesa per mostrare i dati |
| AI indisponibile | Chiave assente, quota, timeout, JSON errato | Termina stato immagine, bozza mantiene originale e puo essere pubblicata | Nessun errore di creazione |
| Ambiguita | Overlay, piu locandine non associabili, dati personali residui | Nessuna sostituzione | Astensione |
| Modifica concorrente | Copertina manuale o bozza successiva | Non sovrascrivere | Annullare o ignorare risultato precedente |
| Nessuna pubblicazione | Utente esce o cambia bozza | Nessun evento o file storage creato | Annullare ramo e rilasciare object URL |
| Fuori scope | PDF, URL esterno, ritaglio manuale | Flusso esistente | Nessuna chiamata crop |

</frozen-after-approval>

## Code Map

- `lib/vision-ai.ts`: provider esistenti, budget e annullamento opzionali.
- `lib/poster-crop.ts`: validazione bounds/privacy e operazioni Sharp.
- `app/api/crop-image/route.ts`: validazione upload, crop e JPEG/204 senza persistenza.
- `lib/draft-image-crop.ts`: richiesta browser annullabile con timeout e fallback.
- `app/api/events/route.ts`: salva soltanto la copertina selezionata; nessun crop dopo risposta.
- `app/components/ImageUploader.tsx`, `SharedImageHandler.tsx`: avvio crop parallelo all'estrazione e passaggio promise.
- `app/crea/page.tsx`, `EventDisplay.tsx`, `MultipleEventsEditor.tsx`: stato bozza, sostituzione immagini e precedenza manuale.
- `lib/event-media.test.mjs`: fixture VM, immagini sintetiche, regressioni crop e POST.

## Tasks & Acceptance

**Execution:**
- [x] `lib/vision-ai.ts` -- rendere configurabile budget e signal senza cambiare default estrazione.
- [x] `lib/poster-crop.ts` -- localizzare con riferimento quadrato, ritagliare e verificare con astensione.
- [x] `app/api/crop-image/route.ts`, `lib/draft-image-crop.ts` -- crop annullabile senza DB/storage e fallback esplicito.
- [x] `app/api/events/route.ts` -- rimuovere il crop dopo pubblicazione, salvare la copertina scelta senza ulteriori analisi.
- [x] `app/components/ImageUploader.tsx`, `SharedImageHandler.tsx`, `EventDisplay.tsx`, `MultipleEventsEditor.tsx`, `app/crea/page.tsx` -- bozza visibile mentre immagine si elabora, sostituzione automatica, pubblicazione successiva, precedenza manuale e annullamento su reset.
- [x] `lib/event-media.test.mjs`, `cypress/e2e/create-event-via-image.cy.ts` -- verificare matrice, parallelismo, pixel, EXIF e multipart browser.
- [x] `OPENAI_SETUP.md`, `docs/API_REFERENCE.md` -- documentare provider gratuito condizionato e fallback.

**Acceptance Criteria:**
- Given crop sospeso, when l'estrazione restituisce i dati, then la bozza e visibile con originale e stato immagine in elaborazione, senza chiamate di pubblicazione.
- Given bozza e crop verificato, when termina la richiesta crop, then cambia soltanto la copertina ancora originale e Pubblica si abilita senza reload.
- Given qualunque fallimento del ramo crop, when termina la richiesta, then rimane l'originale, termina lo stato e Pubblica si abilita.
- Given nuova bozza o modifica manuale, when arriva un vecchio risultato crop, then non viene sovrascritta l'immagine scelta.
- Given crop terminato, when si pubblica, then viene salvata la copertina mostrata senza altra richiesta vision o sostituzione dopo 201.
- Given screenshot con avatar esterno e artista interno, when il crop e valido, then esclude avatar e preserva artista.

## Spec Change Log

- Bounds su immagini non quadrate: riprodotto con test fallito il rifiuto di un riquadro ad alta confidenza che supera di pochi pixel il bordo originale entrando nel padding sintetico. Ora si interseca il rettangolo con l'originale e si rivalidano area/coordinate prima della seconda verifica privacy. Nessuna riduzione delle soglie; riquadri di solo padding restano rifiutati. 45 test Node, tipi/lint/editor passati; endpoint Groq reale HTTP 200 su fixture sintetica. Causa sul file specifico dell'utente ancora non confermata, per assenza del file originale locale.

- Affidabilita provider: confermati Groq configurato e ritaglio reale HTTP 200, anche con `/api/process-image` concorrente (estrazione HTTP 200, crop 682x1140 in circa 1,6 secondi su screenshot sintetico). Alcune prove precedenti restituivano fallback servizio: ora motivo e status provider sono distinguibili tramite header e UI. Nessuna conferma sull'esatto screenshot dell'utente, non disponibile come file locale.
- Quota gratuita: solo il crop Groq puo riprovare una volta HTTP 429 rispettando `Retry-After`, attesa <=20 secondi e budget residuo. Budget crop 45 secondi, annullamento server 50/client 55; nessun retry infinito, modifica chiavi o upgrade. Estrazione invariata. OpenRouter verificato da catalogo come gratuito ma modelli provati hanno restituito 429/output troncato: non attivati come fallback non verificato.
- Verifica finale provider: 44 test Node, 6 test Cypress isolati, TypeScript/ESLint/editor puliti. Il riproduttore supporta `--http --with-extraction`; nessuna mutazione DB o pubblicazione di prova. Nessun deployment.

- Visibilita esito crop: il booleano transitorio e sostituito da stato idle/processing/completed/failed. Indicatore persistente vicino alla copertina con icona, colore e testo; fallimento esplicito con originale mantenuto, anche se il crop termina prima dell'estrazione. Copertina manuale distinta. Sei test Cypress isolati passati, tipi/lint/editor puliti; screenshot mobile verificata.

- Cambio esplicito di intento dell'utente: spostare il crop PRIMA di Pubblica, mostrare bozza/stato e sostituire l'immagine prima della persistenza. Questo supera il precedente completamento tramite `after()`; invariati fallback, verifiche privacy, budget breve e precedenza manuale.
- Revisione bozza: proprieta/cancellazione del crop registrata all'inizio della scansione, callback obsolete ignorate anche prima dell'handoff. Lettura dello share-target riutilizzata durante replay Strict Mode per non consumare due volte lo stesso file.
- Revisione bozza: copertine manuali propagate subito al parent, senza richiedere Salva modifiche prima di Pubblica. La rielaborazione AI consulta immagine e callback correnti e rifiuta risposte obsolete dopo crop o modifica manuale.

- Revisione: aggiunto limite di 16 milioni di pixel prima del padding quadrato per evitare allocazioni eccessive; conservati crop e fallback esistenti.
- Revisione: eliminazione dei crop solo su mancato collegamento confermato, mai dopo esito DB incerto; preservata protezione da modifiche concorrenti.
- Revisione: flag conservato dopo rielaborazione AI e nomi PNG/WebP coerenti in entrambi i percorsi di pubblicazione; preservata precedenza crop manuale.

## Design Notes

Due richieste HTTP indipendenti partono al caricamento: estrazione senza crop e crop senza DB/storage. La pagina riceve la promise di crop insieme ai dati estratti, mostra subito la bozza e applica il blob solo alla generazione ancora attiva e alle copertine ancora originali. Il timeout finisce con fallback, non con una bozza bloccata. Il server non conserva job o risultati. Il salvataggio rimane una richiesta esplicita successiva; `after()` resta solo per calendario e prewarm preesistenti. Nessuna migrazione DB necessaria.

## Verification

- `node --experimental-strip-types --test lib/event-media.test.mjs`: test focalizzati e regressioni senza provider reali.
- `npx tsc --noEmit`: controllo TypeScript.
- ESLint dei file modificati: nessun nuovo errore.
- Verifica runtime di persistenza solo con ambiente isolato; nessun evento reale identificato nella richiesta e nessun dato produzione da creare implicitamente.

**Risultati correnti:** 42 test Node passati (media + reprocess), cinque test Cypress isolati passati, quattro legacy esclusi intenzionalmente. TypeScript, ESLint e diagnostica editor senza errori. Browser con crop sospeso verifica bozza visibile, stato e Pubblica disabilitato, sostituzione, fallback, copertina manuale senza salvataggio dettagli, piu eventi e risposta AI tardiva. Il payload pubblicato contiene la stessa URL della copertina visualizzata. Fixture crop JPEG valida; verificati viewport desktop/mobile con screenshot e nessun overflow mobile. Test componenti coprono unmount/scansione obsoleta prima dell'handoff e lettura singola share-target nel replay Strict Mode. Nessuna inferenza o mutazione DB reale in questa iterazione; nessun deployment. I test simulano provider e persistenza.

## Suggested Review Order

### Storico Superato: Header Delle Storie

- Riproduzione live su screenshot sintetico analogo: il protocollo testuale restituiva `POSTER_BOUNDS: null`; con JSON ma senza bordo header restava incluso l'account e la verifica rifiutava il crop.
- Correzione: JSON nativo solo per il ramo crop, campo `socialHeaderBottom` validato e usato come limite superiore del ritaglio, margini eliminabili distinti da contenuti essenziali. Parser compatibili con formato legacy; estrazione invariata.
- Prova live dopo correzione: riquadro localizzato, header escluso, verifica `safe:true, confidence:0.95`, crop 682x1140 da 760x1240. L'immagine reale allegata non era disponibile come file locale; nessuna dichiarazione di accuratezza su quell'esatto file.
- Osservato anche HTTP 429 Groq per token al minuto: fallback originale previsto, senza upgrade o retry. La prova successiva e passata dopo il ripristino della quota.
- 42 test Node passati, TypeScript ed ESLint passati. Verifica DB in sola lettura senza risultati per questo titolo; nessuna pubblicazione o mutazione DB. Anteprima rimane originale fino alla pubblicazione, come da contratto.
- Riproduttore: `node --experimental-strip-types scripts/diagnose-poster-crop.mjs` oppure percorso immagine autorizzata; non scrive DB o storage.

- Endpoint della bozza indipendente dalla pubblicazione.
	[app/api/crop-image/route.ts](../../app/api/crop-image/route.ts)
- Stato, annullamento e sostituzione prima di Pubblica.
	[app/crea/page.tsx](../../app/crea/page.tsx)
- Promise browser con fallback e timeout.
	[lib/draft-image-crop.ts](../../lib/draft-image-crop.ts)
- Coordinate quadrate, preservazione artwork e verifica finale.
	[poster-crop.ts:5](../../lib/poster-crop.ts#L5)
- Precedenza crop manuale e provenienza durante rielaborazione.
	[EventDisplay.tsx:111](../../app/components/EventDisplay.tsx#L111)
- Test della bozza mentre il crop resta sospeso.
  [cypress/e2e/create-event-via-image.cy.ts](../../cypress/e2e/create-event-via-image.cy.ts)
- Setup, gratuita condizionata e limiti privacy.
	[OPENAI_SETUP.md](../../OPENAI_SETUP.md)