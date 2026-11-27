---
title: 'Selezione dei cron automatici dal pannello amministrativo'
type: 'feature'
created: '2026-11-27'
status: 'done'
baseline_commit: 'cbfd190f17df1725a3e9d28c137a50dc1e353708'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** Il dispatcher giornaliero avvia tutti i sette job senza consentire all'amministratore di scegliere quelli automatici. La selezione manuale esistente vale solo per un singolo avvio.

**Approach:** Aggiungere una configurazione globale persistente per abilitare/disabilitare ogni job automatico dal pannello Cron. Il dispatcher legge questa configurazione a ogni avvio; la selezione manuale resta indipendente e puo' avviare anche job disabilitati.

## Boundaries & Constraints

**Always:** Conservare tutti i job inizialmente abilitati per compatibilita', compresi futuri job privi di configurazione. Permettere di disabilitarli tutti. Conservare autenticazione admin, controllo origine nelle scritture, bearer del dispatcher, pianificazione Vercel e comportamento dei singoli job. Mostrare esplicitamente salvataggi riusciti, errori e job esclusi. Le impostazioni sono globali, non per account. Una modifica riguarda gli avvii successivi, non interrompe job gia' in corso. Il gruppo sorgenti web e Telegram resta unico.

**Ask First:** Applicare migrazioni al database remoto, avviare cron reali, pubblicare o distribuire il codice. La preparazione della migrazione nel repository e la generazione del client Prisma fanno parte dell'implementazione; l'applicazione remota no.

**Never:** Usare localStorage per una scelta destinata al server; riutilizzare i registri CronJobRun come impostazioni; disabilitare controlli TLS o autenticazione; correggere in questa modifica il problema dei redirect Vercel. Un errore di lettura impostazioni non deve provocare l'avvio indiscriminato di tutti i job.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prima configurazione | Nessuna riga salvata | Tutti i job sono abilitati | Nessun cambiamento implicito della pianificazione |
| Selezione parziale | Alcuni job abilitati | Solo quei job ricevono richieste automatiche | Gli altri compaiono come esclusi |
| Tutto disabilitato | Lista vuota salvata | Nessuna richiesta downstream | Risultato esplicito, non errore |
| Avvio manuale | Job automatico disabilitato | Esecuzione manuale ancora disponibile | Esiti e autorizzazioni invariati |
| Database indisponibile | Lettura o scrittura fallita | Errore visibile, nessun falso salvataggio | Dispatcher non avvia job e risponde con errore |
| Input errato | Chiavi sconosciute, duplicate, body non valido | HTTP 400, nessuna scrittura | Messaggio localizzato |
| Utente non admin | GET o PUT impostazioni | Accesso negato | Nessuna lettura/scrittura di configurazione |

</frozen-after-approval>

## Code Map

- `lib/cron-jobs.ts`: catalogo condiviso dei sette job.
- `lib/cron-dispatch.ts`: esecuzione HTTP condivisa; comportamento da preservare.
- `app/api/cron/daily/route.ts`: autenticazione, fan-out e stato aggregato.
- `app/api/admin/run-cron/route.ts`: avvio manuale indipendente, da preservare.
- `app/cron/CronJobLauncher.tsx`: selezione manuale esistente.
- `app/cron/CronAdminClient.tsx`: punto di integrazione del nuovo pannello.
- `prisma/schema.prisma`: aggiunta del modello delle impostazioni.
- `app/lib/auth-helpers.ts`: autorizzazione admin comune.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` e `prisma/migrations/20261127170000_add_cron_job_settings/migration.sql`: aggiungere CronJobSetting con jobKey univoco ed enabled booleano; nessuna applicazione remota.
- [x] `lib/cron-job-settings.ts`: lettura tipizzata con default abilitato per righe assenti e salvataggio atomico della selezione.
- [x] `app/api/admin/cron-settings/route.ts`: GET/PUT protetti, validazione rigorosa delle chiavi e gestione esplicita degli errori.
- [x] `app/api/cron/daily/route.ts`: caricare la selezione dopo l'autenticazione e prima del fan-out, registrare i job esclusi e gestire configurazione indisponibile.
- [x] `app/cron/CronScheduleSettings.tsx` e `app/cron/CronAdminClient.tsx`: checkbox, caricamento, salvataggio, conferma e stato di errore separati dall'avvio manuale.
- [x] `lib/daily-cron.test.mjs` e test mirati per impostazioni/API/UI: coprire matrice senza database reale o API esterne; aggiornare soltanto aspettative del catalogo necessarie ai test del dispatcher.
- [x] `docs/DEPLOY_RUNBOOK.md`: spiegare migrazione, configurazione globale, default, job futuri e differenza tra pianificazione e avvio manuale.

**Acceptance Criteria:**
- Given una selezione salvata, when parte un nuovo dispatcher, then solo i job abilitati vengono richiesti e gli esclusi sono riconoscibili nel risultato.
- Given un errore di caricamento o salvataggio, when l'admin usa il pannello, then vede un errore e non una conferma di salvataggio.
- Given un job disabilitato automaticamente, when viene selezionato nell'avvio manuale, then il trigger esistente resta utilizzabile.

## Spec Change Log

## Design Notes

Usare una tabella dedicata con una riga per job, senza accoppiamento allo stato dell'ultima esecuzione. Il salvataggio sostituisce atomicamente la selezione dei job noti. L'assenza di righe significa comportamento precedente; una tabella mancante non equivale a configurazione vuota e richiede errore esplicito. Non eseguire migrazioni o importazioni reali per verificare questa funzionalita'.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/daily-cron.test.mjs` e nuovi test mirati: nessun accesso di rete o mutazione remota.
- `npx prisma validate` e `npx prisma generate`: schema valido e client aggiornato, senza applicare SQL.
- ESLint sui soli file toccati e `npx tsc --noEmit --incremental false`: nessun nuovo errore.

**Implementation results:**
- Passed: `node --experimental-strip-types --test lib/daily-cron.test.mjs lib/cron-settings.test.mjs lib/cron-schedule-settings.test.mjs lib/manual-cron.test.mjs` (23 tests).
- Passed: `npx prisma validate`, `npx prisma generate`, scoped ESLint, and `npx tsc --noEmit --incremental false`.
- Manual launcher tests: 3/4 pass; the pre-existing catalog-count assertion still expects 5 jobs while the catalog has 7. Left unchanged per scope; manual API behavior tests pass.
- The SQL migration was prepared but not applied. No live jobs, remote database operations, or deployment were run.

## Review Outcomes

Revisione diretta di codice, confini API, migrazione e criteri approvati. Corretto il salvataggio per aggiornare solo le chiavi note tramite upsert nella stessa transazione: le impostazioni di un'altra versione dell'app restano intatte. Il test di conservazione e' stato osservato fallire prima della correzione e passare dopo. Aggiunto anche il caso UI di lettura iniziale fallita, salvataggio bloccato e recupero tramite Riprova.

## Suggested Review Order

**Selezione automatica**

- Il dispatcher filtra i job e blocca gli avvii quando la configurazione non e' disponibile.
  [route.ts:33](../../app/api/cron/daily/route.ts#L33)
- Default compatibili e salvataggio atomico preservano le impostazioni di altre versioni.
  [cron-job-settings.ts:9](../../lib/cron-job-settings.ts#L9)

**Amministrazione**

- Le scritture richiedono admin, origine coerente e selezione valida.
  [route.ts:21](../../app/api/admin/cron-settings/route.ts#L21)
- Il pannello salva la pianificazione separatamente dall'avvio manuale.
  [CronScheduleSettings.tsx:34](../../app/cron/CronScheduleSettings.tsx#L34)

**Schema e verifiche**

- La tabella dedicata richiede migrazione prima del deploy, senza modificare i registri delle esecuzioni.
  [migration.sql:1](../../prisma/migrations/20261127170000_add_cron_job_settings/migration.sql#L1)
- Test del dispatcher per selezione parziale, disabilitazione totale e database indisponibile.
  [daily-cron.test.mjs:221](../../lib/daily-cron.test.mjs#L221)
