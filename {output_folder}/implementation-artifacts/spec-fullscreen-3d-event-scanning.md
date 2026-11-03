---
title: 'Scansione evento con animazione 3D a tutta pagina'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: '0074acbd8e9c6c519284639ffeaf926508c531a5'
context: []
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Quando si carica una locandina o si invia un link, l'animazione attuale resta dentro il riquadro di caricamento ed e bidimensionale. L'utente richiede un'animazione 3D accattivante che occupi tutta la pagina, lasciando escluso il menu.

**Approach:** Durante la scansione mostrare una scena Three.js a tutta area utile sotto il menu, riprendendo il tema del razzo esistente con geometrie tridimensionali, illuminazione, profondita e movimento. Mantenere visibile il messaggio della fase reale senza percentuali simulate. Il menu resta visibile e utilizzabile; completamento ed errori restituiscono il controllo al flusso esistente.

## Boundaries & Constraints

**Always:** Avvio all'inizio effettivo dell'elaborazione di link, immagine, PDF o immagine condivisa. Coprire la pagina sotto il menu anche se viene ridimensionata o cambia orientamento. Bloccare le interazioni con i contenuti coperti senza bloccare la navigazione. Liberare renderer, geometrie, materiali, observer e frame all'uscita. Supportare mobile, desktop, reduced motion e WebGL non disponibile. Preservare i controlli di privacy, duplicati e pubblicazione automatica.

**Ask First:** Modifiche alle API, ai tempi di pubblicazione, alla navigazione o all'aspetto delle pagine estranee alla creazione evento; acquisto o caricamento remoto di asset.

**Never:** Ritardi artificiali per mostrare l'animazione, avanzamenti inventati, menu coperto, richieste reali a servizi AI nei test, modifica delle regole di autopubblicazione. Non sostituire il vero 3D con un SVG o con sole trasformazioni CSS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Link | Invio URL valido e richiesta in corso | Scena 3D immediata sotto il menu | Su errore o timeout scena rimossa, messaggio esistente visibile |
| Locandina o PDF | File accettato e richiesta avviata | Stessa esperienza immersiva, fase immagine/PDF corretta | File rifiutato non avvia la scena; errore libera la pagina |
| Immagine condivisa | Handler condiviso in elaborazione | Stessa scena senza indicatori duplicati | Ripristino su errore |
| Risultato | Risposta valida o nessun evento | Uscita dalla scena di scansione; editor/autopilota secondo stato reale | Nessuna pubblicazione anticipata |
| Navigazione | Menu usato durante la scansione | Navigazione funzionante e scena smontata | Nessun frame o renderer residuo |
| Accessibilita | Movimento ridotto o WebGL assente | Composizione statica o fallback leggibile con messaggio di stato | Nessuna pagina vuota o errore non gestito |
| Layout | Mobile, desktop, resize | Canvas correttamente inquadrato senza sovrapporre il menu | Nessuno scroll orizzontale |

</frozen-after-approval>

## Code Map

- `app/components/LoadingAnimation.tsx`: seleziona attualmente il razzo SVG per scan-image, scan-link e shared-image.
- `app/components/RocketLaunchAnimation.tsx`: animazione attuale usata anche nelle fasi successive dell'autopilota; preservarne i contratti.
- `app/components/ImageUploader.tsx`: controlla la richiesta immagine/PDF e il relativo indicatore locale.
- `app/crea/page.tsx`: controlla loadingLink e processingSharedImage; conserva il flusso autopilota dopo l'estrazione.
- `app/components/Header.tsx` e `app/globals.css`: menu globale e stile site-header; riferimento per il limite superiore della scena.
- `cypress/e2e/create-event-via-image.cy.ts` e `cypress/e2e/create-event-via-link.cy.ts`: test esistenti dei flussi con API simulate.

## Tasks & Acceptance

**Execution:**
- [x] `app/components/ScanScene3D.tsx`: scena Three.js caricata solo durante la scansione, overlay sotto il menu, gestione risorse, fallback e movimento ridotto.
- [x] `package.json` e lockfile esistente: aggiungere Three.js e i tipi necessari, senza introdurre un framework 3D aggiuntivo.
- [x] `app/components/LoadingAnimation.tsx`: collegare le sole fasi di scansione alla nuova scena; conservare messaggi e attributi di fase.
- [x] `app/components/ScanScene3D.module.css`: layout immersivo responsive isolato in un modulo CSS, gerarchia di sovrapposizione e messaggio accessibile, senza cambiare gli stili globali del sito.
- [x] Test Cypress esistenti: verificare scenari della matrice usando risposte simulate, includendo successo, errore e accessibilita del menu.
- [x] Verifica Playwright: screenshot e controlli dei pixel del canvas a dimensioni desktop e mobile; verificare movimento reale, inquadratura e assenza di sovrapposizioni.

**Acceptance Criteria:**
- Given una scansione in attesa, when l'utente guarda la pagina, then vede una scena realmente tridimensionale che occupa lo spazio sotto il menu.
- Given la scena visibile, when l'utente usa il menu, then puo navigare senza restare bloccato nell'overlay.
- Given una scansione conclusa o fallita, when viene aggiornato lo stato reale, then la scena scompare senza attese aggiunte e il risultato o l'errore resta accessibile.
- Given prefers-reduced-motion, when parte la scansione, then il messaggio resta leggibile senza movimento continuo.

## Spec Change Log

## Design Notes

Ipotesi locale: le tre fasi di scansione condividono LoadingAnimation; sostituire questo punto consente di coprire link, locandine e condivisioni senza introdurre uno stato parallelo alle richieste. La verifica discriminante usa una risposta API ritardata e simulata: scena visibile durante l'attesa, rimossa alla risposta o all'errore. Se il componente viene smontato prima della fine della scansione, spostare la responsabilita solo al piu vicino proprietario dello stato reale.

Il razzo resta il soggetto riconoscibile. Una scena luminosa con materiali chiari, accenti corallo e verde acqua e ombre definite evita di trasformare il caricamento in una schermata scura indistinta. La scena non contiene istruzioni d'uso o testi promozionali.

## Verification

**Commands:**
- ESLint sui soli file TypeScript modificati: nessun nuovo errore.
- `npx tsc --noEmit`: nessun errore di tipo introdotto.
- Test mirati nelle suite Cypress immagine e link, con API simulate: scenari della matrice rispettati.
- `node --experimental-strip-types --test lib/event-autopilot.test.mjs`: regole dell'autopilota invariate.

**Browser:**
- Avviare o riusare un server locale funzionante, senza conflitti con processi Next esistenti, e comunicare l'URL.
- Playwright a 390px e 1280px: canvas non vuoto, pixel diversi tra due frame con movimento consentito, menu cliccabile e inquadratura completa.
- Movimento ridotto e fallback WebGL: stato leggibile, nessun errore non gestito, layout stabile.

## Implementation Notes

- Stili isolati in ScanScene3D.module.css invece di aggiungere regole a globals.css.
- Import dinamico Three.js, gestione ridimensionamento del menu, risorse GPU liberate all'uscita e fallback su perdita del contesto WebGL.
- Revisione: corretti il bubbling dei clic/drop dal portale all'uploader e il ripristino di inert con scansioni sovrapposte, tramite conteggio condiviso.
- Aggiornati i selettori di scansione nella suite immagini, preservando quelli delle fasi successive dell'autopilota.
- ESLint e TypeScript superati. Test autopilota: 6/6. Suite Cypress Fullscreen 3D scanning finale: 21/21, tre test legacy esclusi dal filtro. Test immagini mirati: 16 superati durante la verifica delle correzioni.
- Playwright: controlli visivi e pixel a 390px e 1280px, movimento ridotto statico e animazione attiva; apertura nativa con Enter, chiusura con Escape e focus restituito al menu verificati nel browser.
- Anteprima sul server preesistente http://localhost:3000/crea. Nessun server utente fermato e nessun commit creato.
- Limite della verifica: Safari e GPU di dispositivi mobili fisici non testati. L'installazione npm segnala vulnerabilita nelle dipendenze del progetto; nessun aggiornamento estraneo a questa modifica applicato.

## Suggested Review Order

**Collegamento Alla Scansione**

- Le sole fasi di scansione attivano la scena, senza cambiare l'autopilota.
	[LoadingAnimation.tsx:13](../../app/components/LoadingAnimation.tsx#L13)

**Scena E Interazioni**

- Conteggio condiviso per ripristinare correttamente la pagina anche con scansioni sovrapposte.
	[ScanScene3D.tsx:17](../../app/components/ScanScene3D.tsx#L17)
- Limite superiore misurato dal menu e rilascio delle risorse al termine.
	[ScanScene3D.tsx:38](../../app/components/ScanScene3D.tsx#L38)
- Layout a tutta area con messaggio leggibile e fallback statico.
	[ScanScene3D.module.css:1](../../app/components/ScanScene3D.module.css#L1)

**Test**

- Casi simulati per sorgenti, errori, focus, navigazione e WebGL.
	[create-event-via-link.cy.ts:144](../../cypress/e2e/create-event-via-link.cy.ts#L144)