---
title: 'Eventi automatici dai nuovi messaggi dei gruppi Telegram autorizzati'
type: 'feature'
created: '2026-11-08'
status: 'draft'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Il collegamento personale Telegram esistente verifica soltanto canali broadcast e conserva metadati. Non permette di selezionare gruppi e non importa messaggi o locandine.

**Approach:** Estendere il worker MTProto e la gestione admin per selezionare gruppi gia frequentati, autorizzarli singolarmente e acquisire soltanto messaggi successivi all'attivazione. La pipeline eventi esistente estrae annunci di eventi pubblici da testo e immagini, valida le evidenze e pubblica automaticamente, con deduplicazione e risultati visibili.

## Boundaries & Constraints

**Always:** Account e fonti isolati per proprietario admin; consenso esplicito per fonte; sessioni cifrate soltanto nel worker; identita immutabili distinte per gruppi base e supergruppi; verifica dell'appartenenza e delle restrizioni prima della lettura. Conservare cursori durevoli e avanzare solo dopo acquisizione persistita. Nessuna lettura anteriore all'attivazione o alla riattivazione. Riutilizzare estrazione, deduplicazione, copertine e creazione eventi esistenti. Scartare conversazioni personali e informazioni identificative non necessarie; non pubblicare nomi degli interlocutori, ID dei gruppi privati o link d'invito. Esporre errori sanitizzati, backlog e conteggi senza contenuti delle conversazioni.

**Ask First:** Applicare migrazioni a database condivisi, acquistare hosting, effettuare deploy, collegare account reali o attivare acquisizioni reali. L'utente inserisce telefono, codice e 2FA soltanto nell'interfaccia protetta. Non chiedere segreti in chat. Verificare separatamente la configurazione dei provider AI e l'autorizzazione a trattare annunci e locandine.

**Never:** WhatsApp in questa fase; messaggi diretti, chat segrete, gruppi non selezionati, adesioni automatiche, aggiramento di contenuti protetti, importazione dello storico precedente al consenso, invio di messaggi, conservazione di archivi completi. Nessuna modifica alle tre modifiche locali preesistenti. Non dichiarare pronta un'integrazione reale verificata soltanto con provider simulati.

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

- `services/messaging-worker/src/adapters.ts` -- MTProto oggi bloccato in modalita metadata-only; WhatsApp resta invariato.
- `services/messaging-worker/src/engine.ts`, `store.ts`, `http.ts` -- revisioni, sessioni cifrate, comandi autenticati e limiti.
- `lib/personal-messaging.ts`, `app/api/admin/messaging/route.ts` -- contratto e proxy admin con controllo ruolo e origine.
- `app/admin/MessagingAccountsTab.tsx` -- login protetto, elenco, autorizzazione e pausa.
- `lib/social-event-extraction.ts`, `lib/event-duplicates.ts` -- estrazione verificata e pubblicazione condivise.
- `lib/telegram-event-scanning.ts` -- pipeline bot da preservare, non adatta direttamente alle sessioni MTProto.
- `prisma/schema.prisma` -- modelli personali preparati ma non usati come archivio sessioni.
- `app/api/cron/scrape-visitpedemontana/route.ts` -- cron aggregato con budget, dry run e pipeline bot esistenti.

## Tasks & Acceptance

**Execution:**
- [ ] `services/messaging-worker/src/adapters.ts` -- consentire elenco/verifica di gruppi base e supergruppi, baseline e letture circoscritte alle fonti autorizzate; scaricare esclusivamente foto supportate con limiti. Mantenere canali esistenti e separazione WhatsApp.
- [ ] `services/messaging-worker/src/engine.ts`, `store.ts`, `http.ts` -- conservare identita tecniche e cursori nella cifratura; aggiungere acquisizione e conferma interne autenticate, con fencing delle revisioni, batch limitati e ripristino senza browser aperto.
- [ ] `lib/personal-messaging.ts`, `app/api/admin/messaging/route.ts` -- estendere tipi, validazione e stato pubblico; sincronizzare grant applicativi senza esportare sessioni/access hash; invalidare grant prima delle revoche remote.
- [ ] `prisma/schema.prisma`, `prisma/migrations/20261108000000_personal_telegram_group_scanning/migration.sql` -- preparare modelli additivi per job e ricevute personali, revisioni e retention; nessuna sessione MTProto nel database.
- [ ] `lib/personal-telegram-scanning.ts` -- acquisire batch dal worker solo per admin autorizzati, persistere idempotentemente prima di confermare cursori; estrarre e pubblicare tramite helper condivisi, ricontrollando grant e lease nella transazione.
- [ ] `app/api/cron/scrape-visitpedemontana/route.ts` -- integrare scansione personale con budget esplicito e risultati separati; preservare cron web e bot anche in caso di errore personale.
- [ ] `app/admin/MessagingAccountsTab.tsx` -- selezione gruppi, consenso alla pubblicazione automatica, stato di scansione, errori e pausa; chiarire frequenza legata al cron, non promettere tempo reale.
- [ ] `services/messaging-worker/src/adapters.test.mjs`, `engine.test.mjs`, `lib/personal-messaging.test.mjs`, `lib/personal-telegram-scanning.test.mjs`, `cypress/e2e/personal-messaging.cy.ts` -- coprire matrice, isolamento, baseline, backlog, errori persistenti e revoche concorrenti.
- [ ] `docs/DEPLOY_RUNBOOK.md`, `docs/API_REFERENCE.md` -- documentare migrazioni, configurazione, privacy, retention e verifica reale separata.

**Acceptance Criteria:**
- Given un admin collegato, when autorizza un gruppo, then vede la fonte attiva per pubblicazione automatica senza pubblicazioni retroattive.
- Given un cron configurato e un nuovo annuncio valido, when termina la scansione, then l'evento appare nei normali elenchi del sito senza duplicati.
- Given account diversi, when richiedono stato o scansione, then non accedono a gruppi, sessioni o job altrui.
- Given una pausa confermata, when un job non ancora pubblicato tenta il commit, then il grant revocato impedisce la pubblicazione.

## Spec Change Log

## Design Notes

L'acquisizione e' guidata dal cron applicativo esistente: non richiede una scheda admin aperta. Il worker resta su host persistente separato da Vercel. Il database applicativo conserva autorizzazioni e job per rendere atomico il controllo delle revoche con la pubblicazione; il volume cifrato conserva sessioni e cursori. Retention massima dei contenuti pendenti: 24 ore; cancellazione dopo esito definitivo. Batch, retry e budget espliciti evitano perdite silenziose e promesse di quota illimitata.

## Verification

**Commands:**
- `npm --prefix services/messaging-worker run check` -- nessun errore TypeScript.
- `npm --prefix services/messaging-worker test` -- test worker e regressioni verdi.
- `node --experimental-strip-types --test lib/personal-messaging.test.mjs lib/personal-telegram-scanning.test.mjs lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs` -- matrice e pipeline preesistenti verdi.
- `npx prisma validate` -- schema valido, senza applicare migrazioni.
- `npx tsc --noEmit` e ESLint sui file modificati -- nessuna nuova regressione.
- Cypress mirato con API simulate -- login, selezione gruppi, consenso, stato e revoca.
