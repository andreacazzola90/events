---
title: 'Creazione eventi reattiva'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: 'bd2e7e1'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** La pubblicazione attende geocodifica e caricamento della locandina aggiuntiva; il browser aggiunge pause fisse e salva gli eventi multipli in sequenza. Le animazioni esistenti simulano fasi tecniche senza conoscere il progresso reale.

**Approach:** Confermare appena evento e copertina sono salvati, completando sul server le attivita accessorie. Ridurre le attese nel browser e offrire feedback animato immediato, senza dichiarare successo anticipatamente.

## Boundaries & Constraints

**Always:** Ritaglio e verifica della copertina prima della pubblicazione; autenticazione, controllo duplicati e salvataggio durevole prima del 201. Mantenere bozze recuperabili, pulsanti sincronizzati, compatibilita JSON/multipart ed estensione. Preservare le consegne Google Calendar gia accodate e gli stati immagine esistenti.

**Ask First:** Nuova infrastruttura di code, migrazioni, servizi a pagamento, modifiche ai controlli privacy o pubblicazione automatica.

**Never:** Lanciare promesse server senza gestione del ciclo di vita; spostare il lavoro pesante nel browser; cambiare copertina dopo la conferma; navigare prima del salvataggio; percentuali o fasi inventate; creare eventi reali durante i test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Creazione | Geocodifica lenta, evento valido | 201 senza attendere coordinate; completamento server | Coordinate opzionali |
| Locandina extra | Poster multipart valido | Copertina salvata prima del 201; galleria completata dopo | Errore accessorio non annulla evento |
| Modifica concorrente | Luogo modificato durante geocodifica | Nessuna sovrascrittura delle nuove coordinate | Aggiornamento condizionale |
| Errore database | Creazione fallita | Nessuna conferma o arricchimento dell'evento inesistente | Bozza e retry disponibili |
| Batch parziale | Successi, duplicati e fallimenti | Stato per evento; retry solo dei non salvati | Non ripubblicare i successi |
| Attesa scansione | API lenta o errore | Animazione immediata e stato reale leggibile | Termine su risposta, errore o annullamento |
| Movimento ridotto | prefers-reduced-motion | Indicatore statico, stato comunque visibile | Nessuna informazione persa |

</frozen-after-approval>

## Code Map

- `app/api/events/route.ts`: POST, geocodifica bloccante, galleria, after() gia usato per apprendimento e prewarm.
- `lib/geocoding.ts`: provider esterno, coordinate nullable, cache delle richieste.
- `app/crea/page.tsx`: batch sequenziale, stati ottimistici, pausa cache di 300 ms, scansione link.
- `app/components/EventDisplay.tsx`: pubblicazione singola con pause di 300 e 1500 ms.
- `app/components/LoadingAnimation.tsx`: componente condiviso, fasi simulate e colori non coerenti.
- `app/components/ImageUploader.tsx`: ricezione temporizzata e scansione immagine/PDF.
- `app/globals.css`: stili e animazioni condivise.

## Tasks & Acceptance

**Execution:**
- [x] `app/api/events/route.ts` -- trasferire geocodifica e attachPosterImage in after(), isolando gli errori delle attivita indipendenti; aggiornare coordinate solo se luogo e versione non sono cambiati, invalidare cache dopo gli aggiornamenti.
- [x] `lib/geocoding.ts` -- limitare la durata delle chiamate esterne senza alterare matching e cache; evitare che il lavoro accessorio consumi tutto il budget server.
- [x] `app/crea/page.tsx` -- rimuovere la pausa cache; pubblicare al massimo due eventi indipendenti contemporaneamente, conservando ordine visivo, guardia in-flight e retry dei soli falliti.
- [x] `app/components/EventDisplay.tsx` -- rimuovere pause artificiali mantenendo conferma, errori e destinazione di navigazione.
- [x] `app/components/LoadingAnimation.tsx`, `app/globals.css` -- animazione discreta coerente con il sito, icone Lucide, dimensioni stabili, contrasto, role=status e movimento ridotto; niente finto avanzamento.
- [x] `app/components/ImageUploader.tsx`, `app/crea/page.tsx` -- collegare gli stati reali e gestire i timer residui senza aggiornamenti obsoleti.
- [x] `lib/event-create-api.test.mjs` -- test POST con dipendenze mock e callback after controllabili, seguendo il pattern VM di ai-reprocess-api.test.mjs; coprire i casi server della matrice.
- [x] `cypress/e2e/create-event-via-image.cy.ts` -- estendere test mock esistenti per attesa, batch parziale, concorrenza limitata, retry e movimento ridotto; aggiungere qui un caso link isolato.

**Acceptance Criteria:**
- Given geocodifica e upload poster sospesi, when il database conferma, then POST restituisce 201 prima del loro completamento.
- Given una pubblicazione confermata, when il browser riceve risposta, then non introduce pause intenzionali prima della navigazione.
- Given due eventi indipendenti, when pubblicati, then il secondo puo iniziare prima della risposta del primo, senza superare due richieste attive.
- Given una richiesta lenta, when avviata, then il feedback appare immediatamente e resta leggibile su desktop e mobile senza sovrapposizioni.

## Spec Change Log

## Design Notes

after() riduce la latenza percepita, ma non e una coda durevole: coordinate e galleria possono mancare se l'esecuzione server viene interrotta. La copertina principale resta parte del salvataggio. La scansione AI resta server-side e va attesa per ottenere dati attendibili; non viene mostrata una bozza inventata.

## Verification

- `node --experimental-strip-types --test lib/event-create-api.test.mjs` -- risposte anticipate, errori isolati, aggiornamenti concorrenti protetti.
- `npx cypress run --spec cypress/e2e/create-event-via-image.cy.ts --env parallelCoverOnly=true --config trashAssetsBeforeRuns=false` -- API mock, nessun salvataggio reale.
- `npx tsc --noEmit` e ESLint sui file toccati -- nessun errore introdotto.
- Screenshot desktop/mobile e movimento ridotto sul server locale; verificare animazione, testo, layout e fine dell'attesa. Consultare Figma per il lavoro visuale durante l'implementazione.

### Implementation Verification (2026-11-03)

- Stato mantenuto `in-progress` per la review del parent; nessuna review o approvazione avviata. Blocco congelato non modificato.
- `node --experimental-strip-types --test lib/event-create-api.test.mjs lib/geocoding.test.mjs`: 14 pass, 0 fail. Include copertina bloccante, geocodifica/galleria differite, errori indipendenti, guardia su id/luogo/versione/coordinate originali, invalidazione cache e budget geocodifica condiviso di 5 secondi.
- Cypress con il comando sopra: run finale 28 pass, 0 fail, 4 pending legacy esclusi. Tutti i POST API hanno un fallback mock; pubblicazione, crop, cover search e scansioni sono mock. Batch di quattro eventi con successo/fallimento/duplicato, limite due, ordine e retry dei soli non salvati verificati.
- `npx tsc --noEmit`, ESLint mirato su tutti i file TypeScript/JavaScript modificati, errori editor e `git diff --check`: pass.
- Screenshot verificati in `cypress/screenshots/create-event-via-image.cy.ts/responsive-link-{1280-animated,390-animated,390-reduced}.png`; testo leggibile, nessun overflow, stato sotto header fisso. Browser Puppeteer con API mock: tre controlli pass, trasformazione spinner variabile oppure statica con reduced motion, attesa terminata sulla risposta. Catture aggiuntive in `/tmp/event-create-{1280-animated,390-animated,390-reduced}.png`.
- Il CSS attuale usa superfici scure, testo crema e accento arancio: preservati i token esistenti senza cambiare il tema globale. La variante diagnostica webpack ha mostrato incompatibilita nei vecchi test picker; il server standard Turbopack passa tutti i test selezionati.
- Server standard lasciato attivo: `http://localhost:3000`, terminale `619e38ae-9876-43d7-9aca-765eccd6c455`.
- Consultazione Figma bloccata: `tool_search` non disponibile nella sessione, impossibile caricare gli strumenti ufficiali differiti secondo il contratto. Nessun file remoto creato o modificato; Playwright differito non caricato, usato Puppeteer locale.
- Nessun evento reale, scrittura DB/storage, deployment, commit, branch, push o subagent. Limite residuo: arricchimenti `after()` best-effort, non durevoli in caso di interruzione server. Errori di idratazione preesistenti mostrati dal dev overlay, fuori scope.

### Final Review And Verification (2026-11-03)

- Tre revisori indipendenti: diff, casi limite e accettazione. Review iniziale cieca ripetuta con il diff integrale dopo il rilevamento di un artefatto terminale troncato.
- Patch applicate e testate: copertine manuali possedute dal contenitore della bozza, errori persistenti anche dal comando inferiore, pubblicazione delle singole schede tramite coordinatore comune, attesa tra bozze potenzialmente duplicate e budget abortabile per upload/cleanup della galleria.
- I comandi di scansione sono nascosti quando esistono bozze e il reset e bloccato durante la pubblicazione. La segnalazione sulla scomparsa del comando superiore e stata respinta: il comando resta nella pagina anche con una sola bozza.
- Requisito aggiunto dall'utente: `Eventi Simili` esclude le date precedenti a oggi in Europe/Rome, con filtro obbligatorio esterno ai criteri alternativi. Regression test osservato fallire prima della correzione e passare dopo; 15 test della pagina evento passano.
- Verifica finale: 96 test Node pass, 32 test Cypress pass e 4 legacy esclusi; TypeScript senza cache incrementale, ESLint mirato e diagnostica editor passano. Tutte le API mutanti dei test sono simulate.
- Consultata dalla sessione principale la guida ufficiale Figma `figma-generate-design`, riutilizzando token e componente esistenti. Nessun file Figma target fornito, nessun file remoto creato o modificato.
- Tre schermate storiche sovrascritte da Cypress sono state ripristinate ai byte della baseline; le nuove schermate responsive restano disponibili. Catture diagnostiche archiviate in `/tmp/events-responsive-final-artifacts`.
- Nessun commit, deployment o pubblicazione reale. La corsa tra richieste duplicate di client esterni resta preesistente e fuori scope; gli esiti incerti della galleria non provocano cancellazioni potenzialmente distruttive.

## Suggested Review Order

- Coordinatore comune: due pubblicazioni indipendenti, retry e protezione delle bozze.
	[page.tsx](../../app/crea/page.tsx#L280)
- Risposta dopo il salvataggio essenziale; arricchimenti isolati e coordinate protette.
	[route.ts](../../app/api/events/route.ts#L195)
- Copertine manuali conservate quando cambia l'editor.
	[EventDisplay.tsx](../../app/components/EventDisplay.tsx#L80)
- Feedback reale, accessibile e coerente con il sito.
	[LoadingAnimation.tsx](../../app/components/LoadingAnimation.tsx#L12)
- Nessun evento passato nei suggerimenti per categoria, zona o settimana.
	[events/page.tsx](../../app/events/[slug]/page.tsx#L109)
- Casi server con dipendenze simulate e browser con errori parziali.
	[event-create-api.test.mjs](../../lib/event-create-api.test.mjs)
	[create-event-via-image.cy.ts](../../cypress/e2e/create-event-via-image.cy.ts#L340)