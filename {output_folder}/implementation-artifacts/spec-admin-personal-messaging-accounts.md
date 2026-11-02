---
title: 'Account personali Telegram e WhatsApp in admin'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'a81ae5d3829d37e93bfc89527af11335b73008ee'
context: []
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** L'admin deve collegare i propri account Telegram e WhatsApp per predisporre l'importazione degli eventi dai canali seguiti. Il bot Telegram esistente non rappresenta un account personale e non ne eredita le iscrizioni.

**Approach:** Aggiungere una scheda Account e canali in admin, con collegamento personale Telegram tramite codice e 2FA quando richiesta, WhatsApp tramite QR, stato reale della connessione, scelta delle fonti e disconnessione. Preparare un worker Node persistente separato da Next/Vercel per le sessioni; questa fase abilita gli accessi, non introduce un nuovo scraper o pubblicazioni automatiche.

## Boundaries & Constraints

**Always:** Operazioni riservate agli admin verificati sul database, isolamento per proprietario, massimo un account per piattaforma e admin. Sessioni cifrate con AES-GCM e contesto proprietario/piattaforma; chiave obbligatoria lato server. Password 2FA e codici solo transitori durante l'autenticazione, mai salvati o registrati. QR effimero visibile soltanto all'admin proprietario. Elenco limitato ai metadati dei canali; nessuna lettura o persistenza dei contenuti delle chat personali. Consenso alla ripubblicazione distinto dal login e richiesto per ogni fonte. Stato non disponibile se worker assente: mai simulare account collegati.

**Ask First:** Deploy del worker, scelta o acquisto hosting, attivazione di credenziali reali, applicazione di migrazioni su database condivisi e avvio della raccolta/pubblicazione. Il consenso dell'utente del 2026-11-02 autorizza l'implementazione di account personali, servizio persistente e collegamento WhatsApp non ufficiale con rischio di blocco; non autorizza spese o deploy.

**Never:** Inviare messaggi, iscriversi automaticamente ai canali, leggere conversazioni individuali, aggirare contenuti protetti, esportare sessioni nel browser, esporre chiavi in risposte/log/Sentry/localStorage, richiedere segreti in chat. Non sostituire il bot Telegram, non cambiare cron o importazione manuale. Non promettere storico completo o accesso universale ai canali WhatsApp.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Telegram | Telefono, codice, eventuale 2FA | Collegato solo dopo conferma del provider | Codice errato/scaduto, rate limit e 2FA errata distinguibili; tentativi limitati |
| WhatsApp | Richiesta collegamento e scansione QR | QR rinnovabile e stato aggiornato dal provider | Scadenza, logout e restrizioni non diventano successo |
| Fonti | Account collegato | Metadati dei canali accessibili, ricerca e selezione esplicita | Chat personali escluse; canale non accessibile non attivabile |
| WhatsApp parziale | Elenco iscrizioni non disponibile al client | Inserimento link/ID del canale con verifica reale di accesso | Funzione indisponibile segnalata; nessun elenco fittizio |
| Consenso | Fonte selezionata senza conferma dei diritti | Fonte non autorizzata alla futura importazione | Il solo accesso all'account non implica consenso |
| Pausa/revoca | Fonte attiva o account collegato | Stop autorizzazione, invalidazione operazioni in corso, cancellazione sessione alla disconnessione | Logout remoto non confermato segnalato; nessun ripristino da callback tardive |
| Worker offline | Timeout o configurazione assente | Stato servizio non disponibile e azioni non eseguibili | Nessun segreto, dettaglio SDK o successo locale ingannevole |

</frozen-after-approval>

## Code Map

- `app/admin/AdminLogClient.tsx`: schede admin e punto di inserimento della nuova gestione.
- `app/api/admin/telegram/route.ts`: riferimento per sessione e ruolo persistito, senza modificarne il contratto bot.
- `lib/telegram-connection.ts`: riferimento per cifratura e same-origin; i segreti personali devono avere contesto distinto.
- `prisma/schema.prisma`: utenti e dati Telegram bot; nuove relazioni personali indipendenti.
- `lib/social-event-extraction.ts`: percorso di futura estrazione da riusare, fuori dall'esecuzione di questa fase.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/` -- preparare account, sessione cifrata, fonti, consenso, revisioni e scadenza login; non applicare migrazioni condivise.
- [x] `services/messaging-worker/` -- servizio Node persistente con SDK MTProto mantenuto e Baileys, autenticazione app-worker server-side, login a scadenza, sessioni durevoli cifrate, recupero dopo riavvio e logout. Dipendenze isolate dal bundle Vercel; versioni verificate e bloccate.
- [x] `lib/personal-messaging.ts`, `app/api/admin/messaging/route.ts` -- stato e comandi allowlist, proprietario dalla sessione, CSRF, limiti payload/timeout/tentativi, errori sanitizzati; worker non configurato restituisce indisponibilita.
- [x] `app/admin/MessagingAccountsTab.tsx`, `app/admin/AdminLogClient.tsx` -- login, QR, codice/2FA, stato, canali selezionati con consenso, pausa e disconnessione nello stile esistente; controlli accessibili e layout mobile.
- [x] `sentry.server.config.ts` -- escludere payload di autenticazione, QR e sessioni dalla telemetria del nuovo percorso.
- [x] `lib/personal-messaging.test.mjs`, `cypress/e2e/messaging-connections.cy.ts` -- testare matrice, isolamento, replay/callback tardive, riavvio e indisponibilita con provider simulati.
- [x] `docs/API_REFERENCE.md`, `docs/DEPLOY_RUNBOOK.md` -- configurazione, avvio worker, limiti WhatsApp, permessi, revoca e distinzione tra accessi predisposti e scraping non ancora attivato.

**Acceptance Criteria:**
- Given una sessione anonima o non admin, when accede alla gestione, then riceve 401/403 prima di contattare i provider.
- Given due admin, when uno richiede stato o modifica di un account, then non puo ottenere QR, fonti o sessioni dell'altro.
- Given provider simulati, when termina login e selezione, then l'admin vede solo stati confermati e nessun evento viene creato.
- Given una configurazione incompleta, when apre la scheda, then vede il prerequisito mancante senza che il bot e i cron esistenti cambino comportamento.

## Spec Change Log

## Design Notes

Ipotesi locale: estendere il contratto bot introdurrebbe un'identita errata; account personali richiedono sessioni e trasporto distinti. Verifica discriminante: completare i flussi simulati dalla nuova scheda senza chiamate a `/api/admin/telegram`, senza sessioni nel browser e senza creazione di eventi. Le API effettivamente disponibili nella versione SDK scelta determinano i canali verificabili, non una promessa dell'interfaccia.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/personal-messaging.test.mjs lib/telegram-event-scanning.test.mjs` -- nuovi contratti e bot esistente superati.
- `npx prisma validate` -- schema valido senza applicare SQL.
- `npx tsc --noEmit --incremental false` e `npx eslint <file modificati>` -- nessun errore introdotto.
- `npx cypress run --spec cypress/e2e/messaging-connections.cy.ts --config trashAssetsBeforeRuns=false` -- login e fonti con provider simulati; screenshot desktop/mobile senza overflow.

**Live:** Solo dopo configurazione e autorizzazione dell'utente; inserimento credenziali nell'interfaccia protetta, mai tramite chat. Dichiarare esplicitamente qualsiasi flusso non provato con account reali.

## Implementation Handoff (2026-11-02)

- Stato lasciato `in-progress` per workflow/review/final del lead; baseline e blocco frozen non modificati. Nessun commit, branch, staging, push, deploy, migrazione applicata o account reale collegato. Server dev esistente mantenuto.
- API admin separata, ruolo/tipo verificato sul DB prima del worker, owner soltanto dalla sessione, CSRF da origine configurata, payload/risposte allowlist, limiti body e deadline. Worker HTTP privato Bearer con confronto costante, rate limit, scadenze e generazioni per login/logout/pausa; nessun percorso di raccolta o pubblicazione.
- Worker Node >=22.18, runtime type stripping, dipendenze/lockfile isolati. Adattatori reali `teleproto@1.232.1` e `@whiskeysockets/baileys@7.0.0-rc14`, verificati tramite registry, documentazione e tipi installati; import offline e typecheck riusciti senza costruire client live. Logger SDK silenziosi; redazione Sentry server/browser/edge.
- Archivio attivo: volume locale persistente, intero stato AES-GCM con AAD owner/piattaforma dedicato, file 0600, scrittura atomica con fsync e lock heartbeat recuperabile dopo crash. Le tabelle Prisma sono preparazione soltanto e non sono usate come secondo archivio. Il ripristino di sessioni confermate e lazy su richiesta autenticata; login incompleti non sopravvivono al riavvio.
- Limite esplicito Telegram: elenco dei soli canali pubblici amministrati con `GetAdminedPublicChannels`; altri canali pubblici gia seguiti verificabili con username/link e `GetParticipant`. Nessun `getDialogs`, per evitare i messaggi personali inclusi nella risposta. Link privati/ID numerici in ingresso non supportati. Consenso su ID provider immutabile, username solo riferimento pubblico. WhatsApp: elenco iscrizioni non disponibile, fallback reale `newsletterMetadata` link/JID; visibilita metadati non equivale a iscrizione o diritti.
- Verifica Node: 8 contratti API/crypto/telemetria + 38 regressioni BOT = 46; worker 15 test fake/locali, inclusi HTTP loopback autenticato, ID fonte stabile, callback tardivi, pausa concorrente, QR privato, scadenza, tentativi, recupero cifrato e stale lock. Nessun provider/account reale o database usato dai test.
- Gate eseguiti: Prisma validate/generate con `DATABASE_URL` dummy e `DOTENV_CONFIG_PATH=/dev/null`, app `tsc --noEmit --incremental false`, worker `npm run check`, ESLint dei soli file toccati e `git diff --check`. Cypress isolato: 8/8 con `trashAssetsBeforeRuns=false`, controlli di tastiera e indisponibilita inclusi.
- Screenshot ispezionati: `cypress/screenshots/messaging-connections.cy.ts/messaging-admin-1280.png` e `messaging-admin-390.png`; nessun overflow a 1280/390 CSS px. Duplicati intermedi rimossi; screenshot preesistenti preservati. La consultazione Figma e bloccata dall'assenza del tool `tool_search` necessario a caricare strumenti differiti; nessun file Figma esterno creato.
- Restano separati e NON verificati: hosting/TLS/firewall, configurazione segreti reali, login/codice/2FA/QR reali, effettiva disponibilita dei canali dei provider, logout remoto e applicazione SQL condivisa. La UI non e abilitazione live; configurazione mancante restituisce indisponibilita. Procedure e variabili esatte nel runbook. Nessun nuovo scraper, storico, send/join/follow o pubblicazione automatica implementato.

## Corrective Handoff (2026-11-02)

Questa sezione aggiorna l'handoff precedente, non il contratto frozen. Frontmatter lasciato `in-review`; revisione finale assegnata al lead. Nessuna delega, task_complete, stage, commit, deploy, migrazione, account reale o lettura di segreti in questo passaggio.

- Motore: logout concorrenti consolidati in una promessa di cleanup; generazione invalidata subito anche durante login/verifica. Snapshot durevole `remoteRemoved:false` accodato prima della cancellazione durevole della sessione; il riavvio con quel marker non ripristina l'account. Il cleanup catturato prosegue anche se la generazione diventa obsoleta o il disco fallisce. Incertezza remota esplicita con revoca manuale del dispositivo.
- Persistenza: candidati immutabili, scritture seriali catturate alla schedulazione, controllo generazione/segnale prima dell'ammissione al disco e dopo ogni attesa prima del successo. `connected` non viene esposto prima della persistenza. Trasporti staccati chiusi senza aspettare il disco. Pausa non adotta grant ancora non confermati; il quarto start rifiutato conserva challenge/sessione/consensi correnti.
- Cancellazione: deadline HTTP 11s e chiusura del client propagati al motore. Restore/verifiche tardive non pubblicano login o nuovi grant; cancellare una lista non distrugge sessione/consensi. Una scrittura gia ammessa al filesystem non e cancellabile: viene seguita da snapshot conservativo e nessun successo viene pubblicato; fallimenti persistenti del disco richiedono riparazione prima del riavvio. Non si dichiara cancellazione atomica di I/O gia in corso.
- Provider: WhatsApp transitorio => `restoring`, sessione cifrata e consensi conservati, nessuna azione fonte; restore solo da successivo status fidato e limitato a un tentativo/5s. Due soli retry immediati per `515`; `401/403` revocano credenziali/consensi. Generazioni socket vecchie ignorate; errori di persistenza notificano il motore e chiudono il socket senza promise rejection non gestite. Telegram status usa RPC bounded di sola identita, distingue indisponibilita da revoca reale; GetParticipant accetta solo Member/Self/Creator/Admin, rifiuta Left/Banned.
- Privacy Telegram: API fissata ispezionata; `catchUp:false` da solo non basta. Guard isolato `metadataOnlyTelegram` prima di connect, blocco loop/receiver/dispatcher/recovery, RPC applicativi allowlist sotto `InvokeWithoutUpdates`. Test con client reale e trasporto stub verificano assenza dispatch e rifiuto Difference/ChannelDifference/Dialogs. Nessun fork o modifica node_modules. Frame e oggetti del protocollo possono comunque essere ricevuti/decodificati prima dello scarto: nessun handler applicativo di contenuti privati, cache dei messaggi, acquisizione dello storico o persistenza dei contenuti.
- Limite da consegnare al lead: `channels.GetChannels` restituisce solo metadati per identita/access_hash gia disponibili, non enumera tutte le iscrizioni. Resta elenco onesto `administered-public-only`, NON full followed discovery. Canali privati verificabili con ID gia nella cache metadati o esplicito `ID:access_hash` fornito da fonte indipendente; nessuna acquisizione hash dai dialoghi. Hash transitorio escluso da fonte salvata/risposta; cache non sopravvive in StringSession, ID privato ignoto resta non supportato. WhatsApp mantiene fallback manuale link/JID, senza elenco fittizio. Non e stato trovato/implementato un percorso di discovery completa compatibile con il vincolo di non acquisire messaggi personali.
- UI: un solo refresh in-flight, nessuna supersessione da poll successivo; le mutazioni abortiscono refresh obsoleti. Timeout rimuove account e campi sensibili inclusi fonte/consenso; transizione codice->2FA pulisce la credenziale. Cypress riproduce risposta status 4200ms, richiesta pendente con abort, offline e transizione 2FA.
- Red->green: quattro regressioni iniziali del motore rosse; poi timeout HTTP, tre casi UI, scritture accodate/pausa e cleanup con disco bloccato riprodotti rossi e corretti, rieseguendo gli stessi controlli. Node finale: **82/82** (8 contratto API/crypto/telemetria + 38 bot esistente + 36 worker/adattatori), nessun provider live o DB. Archivio cifrato reale temporaneo include marker/crash prima della cancellazione; timer virtuale per liveness Telegram, segnali/gate deterministici per restore/verifiche e scritture tardive.
- Gate finali: worker `npm run check`, app `npx tsc --noEmit --incremental false`, ESLint dei file interessati inclusi nuovi test, tutti senza errori. Cypress **11/11**, solo `messaging-connections.cy.ts`, config temporaneo task-free `/private/tmp/events-telegram-review.cypress.config.cjs` con override `specPattern=cypress/e2e/messaging-connections.cy.ts,trashAssetsBeforeRuns=false`; localhost3000 riusato. Screenshot 1280/390 aggiornati e ispezionati senza overflow/sovrapposizioni. Nessun full suite o task del config Cypress root eseguito.
- Residui: discovery completa dei seguiti non disponibile con il percorso metadata-only adottato; receipt/decoding tecnico non eliminabile; disponibilita provider, logout remoto e login reali non verificati per esplicito divieto. Warning Node su package type e MockTimers sperimentale, nessun errore. Hosting/TLS/segreti/deploy/migrazione restano fuori autorizzazione. Il lead deve fare la review finale; nessun esito live viene implicato dai test fake.

## Final Review (2026-11-02)

- Completate tre revisioni indipendenti: blind hunter, edge-case hunter e acceptance auditor. Corretti i difetti locali del ciclo sessione, durata delle scritture, timeout e polling; regressioni riprodotte e superate. Nessuna modifica al blocco frozen, al bot o ai cron esistenti.
- Verifica finale del lead: 46 test contratto/bot e 36 test worker, tutti superati; worker e app typecheck, Prisma validate con configurazione fittizia, ESLint scoped e whitespace check senza errori. Cypress 11/11 nel passaggio correttivo; screenshot desktop1280/mobile390 ispezionati nuovamente senza sovrapposizioni.
- Consultato l'indice ufficiale delle skill Figma; le precedenti note di indisponibilita riguardano il solo ambiente dei subagenti. Nessuna risorsa Figma remota creata.
- Completamento riferito al collegamento account e autorizzazione delle fonti implementati e verificati con mock, non all'attivazione live. Telegram non espone l'elenco completo dei seguiti nel percorso metadata-only; altri canali richiedono link/identita verificabile. WhatsApp richiede link/JID. Questa limitazione non va presentata come discovery completa, ne come scraping operativo.
- Hosting persistente, credenziali reali, prove provider, deployment e migrazione condivisa rimangono separatamente autorizzabili. Nessun commit, staging, push, evento o account reale creato. Stato `done` riguarda il codice consegnato, non tali attivazioni.

## Suggested Review Order

**Ingresso E Autorizzazione**

- Sessione admin e proprietario verificati prima di ogni comando al worker.
	[route.ts:9](../../app/api/admin/messaging/route.ts#L9)
- Contratto allowlist, cifratura contestuale e risposte senza credenziali.
	[personal-messaging.ts:1](../../lib/personal-messaging.ts#L1)

**Sessioni E Provider**

- Persistenza confermata prima del successo; revoca e timeout invalidano risultati tardivi.
	[engine.ts:61](../../services/messaging-worker/src/engine.ts#L61)
- Logout concorrenti condividono cleanup e marker durevole di incertezza.
	[engine.ts:108](../../services/messaging-worker/src/engine.ts#L108)
- Guard metadata-only e verifiche reali limitano l'accesso ai canali.
	[adapters.ts:22](../../services/messaging-worker/src/adapters.ts#L22)
- Volume cifrato, scritture atomiche e lock singolo rendono espliciti i requisiti operativi.
	[store.ts:8](../../services/messaging-worker/src/store.ts#L8)

**Interfaccia E Verifica**

- Login e fonti separati dal bot, con refresh seriale e stati non simulati.
	[MessagingAccountsTab.tsx:23](../../app/admin/MessagingAccountsTab.tsx#L23)
- Regressioni su isolamento, crash, timeout, revoca e provider finti.
	[engine.test.mjs:1](../../services/messaging-worker/src/engine.test.mjs#L1)
- Login e stati mobili verificati senza account o pubblicazioni reali.
	[messaging-connections.cy.ts:1](../../cypress/e2e/messaging-connections.cy.ts#L1)
- Prerequisiti e limiti devono essere verificati prima dell'attivazione.
	[DEPLOY_RUNBOOK.md:9](../../docs/DEPLOY_RUNBOOK.md#L9)