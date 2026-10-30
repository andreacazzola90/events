---
title: 'Creazione da foto mobile e copertina Facebook consigliata'
type: 'bugfix'
created: '2026-10-30'
status: 'done'
baseline_commit: '98d679df763bd51af6de817de62634eba0bd414f'
context: []
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Su mobile il selettore fotocamera/galleria puo restare aperto dopo la scelta della foto e la generazione della bozza. Quando il ritaglio automatico fallisce su una foto di un evento Facebook, la ricerca attuale non privilegia la copertina della pagina di quell'evento.

**Approach:** Chiudere il selettore al momento della scelta e impedire che il click degli input nascosti lo riapra. Nella ricerca delle copertine provare prima la pagina Facebook dell'evento, se identificabile, e proporre la sua immagine verificata prima dei risultati generici.

## Boundaries & Constraints

**Always:** Conservare la conferma esplicita della copertina. Riutilizzare download protetti, controllo dei redirect, limiti di byte e pixel, normalizzazione JPEG e token firmati esistenti. Mantenere annullamento delle richieste obsolete, scelta manuale e indipendenza delle bozze multiple. Nessuna immagine originale privata deve tornare pubblicabile dopo il fallimento del ritaglio. Controllare che la pagina appartenga allo stesso evento attraverso titolo e contesto, senza accettare immagini di login o profili.

**Ask First:** Introdurre login Facebook, nuove credenziali, servizi a pagamento, modifiche alle autorizzazioni o pubblicazione automatica della copertina.

**Never:** Modificare segreti, usare le credenziali personali per accedere a Facebook, aggirare restrizioni della piattaforma, inviare screenshot o testo OCR alla ricerca copertine, salvare eventi reali durante i test o modificare la soglia di sicurezza del ritaglio.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Scelta mobile | Selettore aperto, scelta fotocamera o galleria | Chiusura immediata, senza riapertura dal click dell'input nascosto | Annullare la scelta non blocca un nuovo caricamento |
| Elaborazione | Foto valida, lenta o con errore | Selettore chiuso durante elaborazione e visualizzazione bozza | Errore leggibile e nuovo tentativo disponibile |
| Appunti | Foto incollata dal selettore | Stessa chiusura del flusso fotocamera/galleria | In assenza di immagine resta possibile riprovare |
| Facebook noto | Ritaglio fallito e sourceUrl Facebook events valido | Leggere prima la pagina e proporre la copertina dello stesso evento | Se inaccessibile continuare con ricerca esistente |
| Facebook senza link | Ritaglio fallito, solo titolo/data/luogo | Cercare prima pagine Facebook events pertinenti e verificarne la copertina | Nessuna corrispondenza certa: ricerca generica o nessuna immagine |
| Pagina estranea | Profilo, altro evento, altra edizione, login o redirect privato | Nessuna copertina ricavata da quella pagina | Nessun download non consentito |
| Modifica concorrente | Copertina manuale scelta mentre arriva Facebook | Mantenere la scelta manuale | Risultato tardivo ignorato |

</frozen-after-approval>

## Code Map

- `app/components/ImageUploader.tsx`: possiede selettore mobile, input nascosti e processFile; il click degli input puo risalire a handleAreaClick.
- `app/components/EventDisplay.tsx`: monta EventCoverPicker e dispone di eventData.sourceUrl.
- `app/components/EventCoverPicker.tsx`: invia attualmente solo titolo/data/luogo e richiede conferma esplicita.
- `lib/event-cover.ts`: valida input, verifica corrispondenza evento, scarica candidati e firma anteprime; attualmente esce subito senza provider configurato.
- `lib/event-cover-network.ts`: confine di rete protetto da riutilizzare anche per Facebook.
- `lib/event-image.ts`: estrazione esistente dell'immagine dalla pagina HTML.
- `lib/event-cover.test.mjs`: test isolati con dipendenze iniettate.
- `cypress/e2e/create-event-via-image.cy.ts`: test esistenti con upload, crop fallito e copertine simulate.

## Tasks & Acceptance

**Execution:**
- [x] `cypress/e2e/create-event-via-image.cy.ts` -- aggiungere regressione mobile che riproduca il click reale dell'input nascosto e verifichi chiusura immediata e dopo estrazione, senza chiamate reali ai modelli.
- [x] `app/components/ImageUploader.tsx` -- impedire propagazione dei click degli input e chiudere il selettore all'ingresso del flusso di elaborazione; verificare anche gli appunti.
- [x] `lib/event-cover.test.mjs` -- coprire ordine Facebook/priorita, input sourceUrl limitato e opzionale, pagina non pertinente, errore di rete e fallback senza provider configurato.
- [x] `lib/event-cover.ts` -- accettare solo un link pubblico Facebook events validato e limitato come campo opzionale; provare pagina diretta prima della ricerca, poi risultati Facebook pertinenti prima della ricerca generica, mantenendo corrispondenza evento e protezioni di rete.
- [x] `app/components/EventCoverPicker.tsx`, `app/components/EventDisplay.tsx` -- inoltrare solo il link evento ammissibile e includerlo nelle dipendenze della ricerca, senza testo privato e senza sostituire automaticamente immagini confermate.
- [x] `cypress/e2e/create-event-via-image.cy.ts` -- adeguare asserzioni sui campi consentiti e verificare proposta Facebook dopo crop fallito, conferma manuale e indipendenza di eventi multipli.

**Acceptance Criteria:**
- Given una creazione da foto su mobile, when viene selezionata la foto, then la barra fotocamera/galleria scompare e non ricompare durante elaborazione o bozza.
- Given un ritaglio fallito e un evento Facebook identificabile, when viene cercata una copertina, then la pagina dell'evento ha priorita rispetto alla ricerca generica e l'immagine appare come proposta da confermare.
- Given un evento gia in modifica, when una ricerca precedente termina, then nessuna scelta manuale viene sovrascritta.

## Spec Change Log

## Design Notes

Ipotesi locale del difetto mobile: cameraInputRef.current.click() e fileInputRef.current.click() propagano il click al riquadro che richiama handleAreaClick, impostando nuovamente showSourcePicker. La verifica discriminante deve osservare la chiusura prima che finisca la richiesta: il finally attuale puo nascondere la riapertura soltanto a elaborazione conclusa. Confermare con il test prima della correzione.

La pagina Facebook va letta lato server attraverso fetchCoverResource, senza dipendere da chiavi di ricerca per un URL gia noto. Per URL assente, titolo/data/luogo sono indizi di ricerca, non prova dell'identita dell'evento. Login, markup non leggibile o immagine assente devono degradare senza bloccare la bozza. Nessun redesign dell'interfaccia.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/event-cover.test.mjs lib/event-cover-network.test.mjs lib/event-image.test.mjs` -- test isolati verdi, inclusa priorita Facebook e sicurezza.
- `npx cypress run --spec cypress/e2e/create-event-via-image.cy.ts --env parallelCoverOnly=true --config trashAssetsBeforeRuns=false` -- test con API simulate verdi; preservare screenshot gia versionati.
- `npx eslint app/components/ImageUploader.tsx app/components/EventCoverPicker.tsx app/components/EventDisplay.tsx lib/event-cover.ts` -- nessun nuovo errore.
- `npx tsc --noEmit` -- nessun errore introdotto.

Esiti: 46 test Node e 24 test Cypress isolati passati; 4 test legacy esclusi intenzionalmente. Cypress finale usa anche `requestTimeout=10000`. ESLint e TypeScript passati. Viewport mobile 390x844 e desktop verificati, con conferma esplicita e nessuna immagine originale dopo il fallimento. Nessuna inferenza reale o pubblicazione reale. La pagina Facebook pubblica effettiva non e stata verificata: login, rate limit e markup non accessibile possono impedire il recupero e attivare il fallback.

La priorita e inoltrata come booleano opzionale `preferFacebook`, solo dopo crop fallito; `sourceUrl` e opzionale e viene ridotto al link canonico senza parametri. Il tentativo Facebook usa al massimo 8 secondi del budget totale di 20 secondi. I test attendono l'inizializzazione client nel caso annullamento e salvano i dettagli manuali prima della pubblicazione simulata. Avvisi di hydration nel layout preesistenti non modificati.

Revisione completata con controlli indipendenti di difetti, casi limite e criteri approvati. Risolti con regressioni: separatori HTML-escaped nelle immagini firmate, titoli di ricerca di altra edizione, date esplicitamente incompatibili e moduli login nelle pagine Facebook, retry nel fallback dopo download fallito. Riconosciuta la data italiana con slash per non confonderla con un timestamp di pubblicazione diverso. La verifica della corrispondenza resta euristica e non sostituisce la conferma dell'utente.

## Suggested Review Order

**Flusso da foto**

- Chiude il selettore prima dell'elaborazione e isola i click degli input.
	[ImageUploader.tsx:26](../../app/components/ImageUploader.tsx#L26)
- Attiva la priorita Facebook soltanto dopo un ritaglio fallito.
	[EventDisplay.tsx:472](../../app/components/EventDisplay.tsx#L472)
- Inoltra campi limitati e conserva conferma esplicita e annullamento.
	[EventCoverPicker.tsx:19](../../app/components/EventCoverPicker.tsx#L19)

**Ricerca E Validazione**

- Prova la pagina Facebook prima della ricerca generica, senza credenziali personali.
	[event-cover.ts:223](../../lib/event-cover.ts#L223)
- Accetta soltanto link evento canonici e rimuove parametri di tracciamento.
	[event-image.ts:16](../../lib/event-image.ts#L16)

**Regressioni**

- Copre selezione mobile, conferma delle copertine e conservazione delle modifiche manuali.
	[create-event-via-image.cy.ts:10](../../cypress/e2e/create-event-via-image.cy.ts#L10)
- Verifica candidati, fallback, login, date e confine di rete.
	[event-cover.test.mjs:1](../../lib/event-cover.test.mjs#L1)