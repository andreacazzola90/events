---
title: 'Eventi automatici dai nuovi messaggi dei gruppi Telegram autorizzati'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '265d0d8c78c171ba071767bf29ab05a34440e156'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Il collegamento Telegram personale esistente gestisce soltanto metadati di canali, non messaggi dei gruppi.

**Approach:** Selezionare gruppi gia frequentati, autorizzarli singolarmente e acquisire solo nuovi messaggi. Riutilizzare la pipeline eventi per estrarre testo/locandine e pubblicare automaticamente eventi pubblici comprovati.

## Boundaries & Constraints

**Always:** Isolamento per admin, consenso per fonte, sessioni cifrate nel worker, identita immutabili, verifica appartenenza/restrizioni. Cursori durevoli avanzati solo dopo persistenza. Baseline nuova anche alla riattivazione. Scartare conversazioni personali; niente interlocutori, ID privati o inviti nelle pubblicazioni. Errori sanitizzati, backlog e conteggi visibili.

**Ask First:** Migrazioni condivise, hosting, deploy e connessioni/acquisizioni reali. Credenziali solo nella UI protetta, mai in chat. Confermare configurazione e autorizzazione al trattamento AI degli annunci.

**Never:** WhatsApp, chat dirette/segrete, fonti non selezionate, adesioni/invii automatici, contenuti protetti, storico precedente al consenso, archivi completi. Preservare modifiche locali. Distinguere test simulati da verifica reale.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Selezione | Sessione collegata, gruppi gia frequentati | Elenco paginato di gruppi supportati, senza anteprime delle conversazioni | Timeout e limiti espliciti |
| Prima autorizzazione | Gruppo verificato e consenso | Memorizzare posizione iniziale; nessun evento dai messaggi precedenti | Nessun grant attivo senza baseline valida |
| Nuovi annunci | Testo, foto o foto con didascalia dopo la baseline | Accodare e pubblicare soltanto eventi pubblici comprovati | Retry limitati e stato visibile |
| Messaggi non pertinenti | Conversazione, servizio, allegato non supportato, evento privato | Scartare senza pubblicare o conservare dati inutili | Conteggio degli scarti |
| Backlog e riavvio | Piu messaggi del limite, servizio riavviato | Riprendere dal cursore senza saltare annunci | Non avanzare dopo scritture fallite |
| Duplicazione | Messaggio riletto o evento gia acquisito dal bot/web | Nessun evento duplicato | Vincoli unici e lock esistenti |
| Revoca | Pausa, disconnessione, ruolo rimosso o appartenenza persa | Bloccare nuove acquisizioni e pubblicazioni non ancora concluse | Revisioni e invalidazione dei job |
| Protezioni e quota | Gruppo protetto, FloodWait, foto eccessiva | Non aggirare restrizioni; rinviare o scartare esplicitamente | Nessuna falsa risposta di successo |
| Dry run | Cron in modalita simulazione | Nessun evento, ricevuta, grant o avanzamento cursore | Report separato |

</frozen-after-approval>

## Code Map

- `services/messaging-worker/src/` -- adattatori, sessioni cifrate, revisioni e HTTP autenticato.
- `lib/personal-messaging.ts`, `app/api/admin/messaging/route.ts` -- contratto e proxy admin.
- `lib/social-event-extraction.ts`, `lib/event-duplicates.ts` -- helper da riutilizzare.
- `lib/telegram-event-scanning.ts` -- pipeline bot da preservare.
- `prisma/schema.prisma` -- modelli personali preparati; sessioni autorevoli nel worker.

## Tasks & Acceptance

**Execution:**
- [x] `services/messaging-worker/src/adapters.ts` -- elenco/verifica gruppi base e supergruppi, baseline, letture autorizzate e foto limitate; preservare canali/WhatsApp.
- [x] `services/messaging-worker/src/engine.ts`, `store.ts`, `http.ts` -- cursori cifrati, acquisizione/conferma interne, revisioni, batch e ripristino senza browser.
- [x] `lib/personal-messaging.ts`, `app/api/admin/messaging/route.ts` -- tipi/validazione, grant applicativi; revoca locale prima di quella remota; nessun access hash pubblico.
- [x] `prisma/schema.prisma`, `prisma/migrations/20261108000000_personal_telegram_group_scanning/migration.sql` -- modelli additivi per job/ricevute, revisioni e retention, senza sessioni.
- [x] `lib/personal-telegram-scanning.ts` -- persistenza idempotente prima della conferma cursori; pubblicazione condivisa con grant/lease ricontrollati nella transazione.
- [x] `app/api/cron/scrape-visitpedemontana/route.ts` -- scansione personale con budget/report separati; errori non bloccano web/bot.
- [x] `app/admin/MessagingAccountsTab.tsx` -- gruppi, consenso alla pubblicazione, stato/errori/pausa; frequenza del cron, non tempo reale.
- [x] `services/messaging-worker/src/adapters.test.mjs`, `engine.test.mjs`, `lib/personal-messaging.test.mjs`, `lib/personal-telegram-scanning.test.mjs`, `cypress/e2e/messaging-connections.cy.ts` -- matrice, isolamento e revoche concorrenti.
- [x] `docs/DEPLOY_RUNBOOK.md`, `docs/API_REFERENCE.md` -- configurazione, migrazioni, privacy e verifica reale separata.

**Acceptance Criteria:**
- Given un admin collegato, when autorizza un gruppo, then vede la fonte attiva per pubblicazione automatica senza pubblicazioni retroattive.
- Given un cron configurato e un nuovo annuncio valido, when termina la scansione, then l'evento appare nei normali elenchi del sito senza duplicati.
- Given account diversi, when richiedono stato o scansione, then non accedono a gruppi, sessioni o job altrui.
- Given una pausa confermata, when un job non ancora pubblicato tenta il commit, then il grant revocato impedisce la pubblicazione.

## Spec Change Log

- 2026-11-08 corrective pass: use bounded ascending history pages and account for every returned message ID (including service messages); add independently callable retention cleanup and clarify deletion latency; preserve scan errors across status polling; include personal scan outcomes in aggregate cron status; paginate bounded dialog enumeration while retaining administered broadcasts. Poster OCR remains local-only, combines filtered caption and OCR excerpts, and sends text only to providers; no unverified crop or raw photo is published.
- 2026-11-08 ripresa: generazione applicativa contro risposte tardive dopo revoca, ruolo admin ricontrollato nel commit, ACK adottato solo dopo scrittura durevole e polling invalidato dalla pausa. Trasporti temporaneamente offline conservano consenso e sono ripristinabili dal cron; annunci privati/protetti esclusi prima di foto/OCR e date numeriche preservate nella redazione.

## Design Notes

Cron esistente, worker persistente separato da Vercel. Grant/job nel database rendono atomica la revoca con la pubblicazione; sessioni/cursori nel volume cifrato. Contenuti pendenti: massimo 24 ore, cancellati dopo esito definitivo. Limiti espliciti, niente quote illimitate.

## Verification

**Commands:**
- `npm --prefix services/messaging-worker run check` -- nessun errore TypeScript.
- `npm --prefix services/messaging-worker test` -- test worker e regressioni verdi.
- `node --experimental-strip-types --test lib/personal-messaging.test.mjs lib/personal-telegram-scanning.test.mjs lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs` -- matrice e pipeline preesistenti verdi.
- `npx prisma validate` -- schema valido, senza applicare migrazioni.
- `npx tsc --noEmit` e ESLint sui file modificati -- nessuna nuova regressione.
- Cypress mirato con API simulate -- login, selezione gruppi, consenso, stato e revoca.

**Esito verificato (2026-11-08):** 50 test worker, 97 test pipeline/contratti/cron/bot e 13 test Cypress superati. TypeScript app/worker, Prisma validate, ESLint mirato e diff-check superati. Nessun login reale, deploy o migrazione condivisa eseguiti; nessun commit/push. Verifica reale e scheduler di pulizia frequente restano attivita operative autorizzate separatamente.

## Suggested Review Order

**Acquisizione e consenso**

- Entrata cron, queue durevole e pubblicazione condivisa.
  [`personal-telegram-scanning.ts:346`](../../lib/personal-telegram-scanning.ts#L346)
- Grant applicativi: solo autorizzazioni esplicite, risposte tardive invalidate.
  [`personal-telegram-scanning.ts:104`](../../lib/personal-telegram-scanning.ts#L104)
- Ruolo admin e revisioni ricontrollati nella transazione di pubblicazione.
  [`personal-telegram-scanning.ts:26`](../../lib/personal-telegram-scanning.ts#L26)

**Messaggi e cursori**

- Pagine cronologiche, messaggi privati/protetti scartati prima delle foto.
  [`adapters.ts:173`](../../services/messaging-worker/src/adapters.ts#L173)
- Conferma del cursore adottata solo dopo scrittura riuscita.
  [`engine.ts:354`](../../services/messaging-worker/src/engine.ts#L354)

**Supporto e verifiche**

- Selezione fonti e consenso nella UI esistente.
  [`MessagingAccountsTab.tsx:124`](../../app/admin/MessagingAccountsTab.tsx#L124)
- Privacy, deployment separato e limiti reali di retention.
  [`DEPLOY_RUNBOOK.md:9`](../../docs/DEPLOY_RUNBOOK.md#L9)
- Regressioni grant, OCR locale e persistenza prima dell'ACK.
  [`personal-telegram-scanning.test.mjs:1`](../../lib/personal-telegram-scanning.test.mjs#L1)
