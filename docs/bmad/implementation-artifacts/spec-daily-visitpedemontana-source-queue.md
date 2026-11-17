---
title: 'Coda equa per le sorgenti VisitPedemontana'
type: 'feature'
created: '2026-11-17'
status: 'in-progress'
baseline_commit: '92481627eff1870937e5337e6c3f6797b1e7a00b'
context: []
---

<frozen-after-approval reason="intent chiarito con l'utente">

## Intent

**Problema:** La scansione VisitPedemontana lavora le sorgenti web in sequenza entro un budget limitato. Le sorgenti oltre il budget vengono rinviate; l'ordinamento per `startedAt` non garantisce che una sorgente rinviata riceva tempo nei run successivi.

**Approccio:** Rendere durevole e fair la coda delle sorgenti attive. I run giornalieri devono dare precedenza alle sorgenti rinviate, riprenderle al cron successivo e rispettare sempre i cooldown, senza aggiungere uno scheduler esterno.

## Boundaries & Constraints

**Always:** Rispettare `rateLimitRetryAt`; conservare checkpoint e motivi di rinvio; impedire che run concorrenti elaborino la stessa sorgente; favorire le sorgenti in arretrato rispetto a scansioni già completate; restare compatibili con il singolo cron giornaliero Vercel.

**Ask First:** Aggiungere uno scheduler esterno o un cron più frequente; ignorare cooldown; aumentare il budget oltre i limiti del piano/funzione; cambiare la frequenza giornaliera delle scansioni.

**Never:** Dichiarare completata una sorgente solo perché è stata selezionata; perdere `pendingEventLinks`/`nextApiPage`; introdurre dipendenze di coda gestita senza approvazione.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Budget esaurito | Sorgente attiva non ancora elaborata | Resta pending ed è prioritaria nel prossimo cron giornaliero | Persistire checkpoint e motivo di rinvio |
| Cooldown attivo | `rateLimitRetryAt > now` | Non avviare la sorgente; riprovarla a un cron successivo quando il cooldown è scaduto | Conservare il retry time |
| Run concorrenti | Due invocazioni selezionano la stessa sorgente | Una sola acquisisce il lease e avvia lo scraping | L'altra la salta senza sovrascrivere lo stato |
| Capacità insufficiente persistente | Arretrato maggiore del budget giornaliero | Avanzare l'arretrato con precedenza equa tra i run | Esporre pending/failed nei risultati; non promettere completamento giornaliero |

</frozen-after-approval>

## Code Map

- `app/api/cron/scrape-visitpedemontana/route.ts` -- carica le sorgenti, rispetta cooldown, applica budget e salva checkpoint per sorgente.
- `prisma/schema.prisma` -- `CronJobRun` persiste stato e `resultJson`; richiede i campi necessari allo scheduling e ai lease atomici.
- `prisma/migrations/` -- migrazione SQL per i campi di retry/lease.
- `app/lib/google-calendar.ts` -- pattern esistente di claim condizionale e verifica del lease.
- `app/api/cron/daily/route.ts` e `lib/cron-jobs.ts` -- fan-out giornaliero esistente da mantenere.
- `app/api/admin/cron-status/route.ts` -- espone i run aggregati e per sorgente.
- `lib/cron-source-run-status.test.mjs` e test cron esistenti -- verificare copertura e riutilizzare i pattern di test appropriati.

## Tasks & Acceptance

**Execution:**
- [ ] `prisma/schema.prisma` e `prisma/migrations/` -- aggiungere scheduling, lease e versione monotona per i run sorgente; migrare le vecchie righe `running` senza lease evitando claim durante la finestra massima del worker legacy.
- [ ] `app/api/cron/scrape-visitpedemontana/route.ts` -- fail closed se non si carica lo stato; usare claim compare-and-set sulla versione letta; preservare/mergiare tutto lo stato utile invece di scrivere `null`; ruotare gli incompleti.
- [ ] `lib/cron-source-scheduler.ts` e test dedicati -- verificare cooldown, claim concorrente e stantio, lease legacy, checkpoint/metadati, esiti incompleti, rinvio budget e round-robin quando una sola sorgente arretrata entra nel budget.
- [ ] `docs/DEPLOY_RUNBOOK.md` -- documentare la migrazione e che i retry automatici avvengono al cron giornaliero successivo.

**Acceptance Criteria:**
- Given una sorgente rinviata per budget, when parte il cron successivo, then viene considerata prima delle sorgenti già completate e il suo checkpoint viene ripreso.
- Given una sorgente con cooldown futuro, when parte il cron, then non viene avviata prima di `rateLimitRetryAt` e resta nella coda.
- Given due invocazioni concorrenti, when entrambe tentano di acquisire la stessa sorgente, then al massimo una ottiene il lease valido.
- Given due worker che hanno letto la stessa versione, when il primo termina prima che il secondo acquisisca il lease, then il secondo non può reclamare lo stato superato né sovrascrivere il checkpoint più recente.
- Given un rinvio budget calcolato da uno snapshot superato, when un altro worker ha aggiornato lo stato, then il rinvio fallisce condizionalmente senza sovrascriverlo.
- Given una vecchia riga `running` priva di lease durante il deploy, when il nuovo worker tenta il claim entro la durata massima legacy, then non avvia un secondo scraping.
- Given un risultato parziale o con `collectionIncomplete`/`deferred`, when viene persistito, then mantiene i metadati incompleti e la posizione in coda finché esiste lavoro residuo.
- Given più sorgenti arretrate e budget sufficiente per una sola, when un run lascia ancora incompleta la sorgente corrente, then il suo turno passa in fondo e il cron successivo prova la successiva eleggibile.
- Given il caricamento dei run sorgente fallisce, when la route prepara il lavoro, then non acquisisce lease né avvia scraping con checkpoint sconosciuti e restituisce un errore esplicito senza sovrascrivere lo stato.
- Given più sorgenti arretrate di quante ne stiano nel budget di un run, when si ripetono i cron giornalieri e ogni sorgente può fare progresso entro il proprio turno, then la coda avanza senza starvation.

## Design Notes

Un'unica pianificazione Vercel giornaliera non può riprendere una sorgente appena scade il cooldown: la latenza massima dipende dal cron successivo. La coda deve ruotare le sorgenti che restano incomplete; una priorità FIFO immutabile può tenere le stesse sorgenti davanti a tutte le altre. I claim e i rinvii devono confrontare atomicamente la versione dello stato letto; un lease libero non autorizza a scrivere uno snapshot precedente. Se lo stato non è leggibile, il worker deve fallire prima del claim. I campi di stato non riconosciuti dal worker vanno preservati, mai cancellati scrivendo `null`; risultati parziali o incompleti mantengono il proprio `resultJson` e posizione in coda. Durante il rollout, le righe legacy `running` senza lease restano non acquisibili finché un worker precedente potrebbe essere attivo. Se il lavoro giornaliero supera stabilmente la capacità, nessuna politica di scheduling può garantire il completamento di tutte le sorgenti ogni giorno: la garanzia è progresso fair dell'arretrato quando le sorgenti possono avanzare entro il budget, non completamento entro un singolo run.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/cron-source-scheduler.test.mjs` -- casi di ordinamento, cooldown, claim e recupero dopo budget superati.
- `npx prisma generate` -- client aggiornato allo schema.
- `npx eslint app/api/cron/scrape-visitpedemontana lib/cron-source-scheduler.ts` -- nessun errore nuovo.
- `npx tsc --noEmit -p .` -- nessun errore di tipo nuovo.

## Spec Change Log

- **Trigger:** La revisione ha confermato perdita di checkpoint se il caricamento dei run fallisce prima di un claim valido e possibile starvation con `queuedAt` FIFO immutabile.
  **Amendment:** Richiesti fail-closed prima di qualunque claim, nessuna scrittura `null` su stato sconosciuto e rotazione in fondo per sorgenti ancora incomplete; aggiunti criteri e test per entrambi i casi.
  **Known-bad state avoided:** Avviare una scansione da stato vuoto dopo un errore DB e riproporre la stessa sorgente arretrata davanti alle altre ogni giorno.
  **KEEP:** Conservare migrazione additiva nullable, lease atomico con verifica del proprietario, cooldown `rateLimitRetryAt`, checkpoint esistenti, retry al solo cron giornaliero e nessuno scheduler esterno.
- **Trigger:** La seconda revisione ha rilevato che un claim o rinvio con snapshot vecchio può sovrascrivere uno stato più recente; inoltre, la claim può azzerare metadati non inclusi nei tre campi checkpoint, righe legacy `running` possono essere reclamate, e un lease finish rifiutato può essere riportato come successo.
  **Amendment:** Richiesti compare-and-set su versione, preservazione/merge dell'intero stato utile, protezione transitoria dei run legacy, stato queued per risultati incompleti e propagazione dei completamenti non persistiti; aggiunti criteri e test mirati.
  **Known-bad state avoided:** Claim sequenziale su snapshot obsoleto, overwrite di metadati parziali, doppio scraping durante il deploy e successo non persistito.
  **KEEP:** Mantenere fail-closed sul caricamento, round-robin degli incompleti, migrazione additiva, cooldown rispettati, checkpoint esistenti, lease owner-checked, retry al cron giornaliero e nessuno scheduler esterno.
- **Chiarimento dalla revisione acceptance:** Non imporre `status='queued'` al record DB quando `resultJson` e `queuedAt` persistono correttamente un risultato parziale; l'interfaccia lo etichetta già come completato parzialmente. Il `false` del finish non è un difetto azionabile nel limite corrente: lease di sei minuti e durata massima della route di cinque minuti.
  **KEEP:** Conservare `resultJson` parziale e la posizione in coda; non aggiungere gestione d'errore per il false del finish senza evidenza di un percorso raggiungibile.

## Suggested Review Order

**Selezione e ripresa delle sorgenti**

- Il cron giornaliero ordina l'arretrato e salta cooldown e lease attivi.
  [`route.ts:1011`](../../../app/api/cron/scrape-visitpedemontana/route.ts#L1011)

- La priorità dell'arretrato ruota a ogni tentativo incompleto, usando lo stato durevole della sorgente.
  [`cron-source-scheduler.ts:16`](../../../lib/cron-source-scheduler.ts#L16)

- Il retry mantiene `rateLimitRetryAt` come limite minimo per entrambi gli stati persistiti.
  [`route.ts:250`](../../../app/api/cron/scrape-visitpedemontana/route.ts#L250)

**Lease e persistenza**

- Il compare-and-set concede un lease a un solo worker e il rilascio verifica proprietario e scadenza.
  [`cron-source-scheduler.ts:66`](../../../lib/cron-source-scheduler.ts#L66)

- I campi nullable e l'indice aggiungono scheduling senza cambiare gli altri run cron.
  [`schema.prisma:430`](../../../prisma/schema.prisma#L430)

- La migrazione SQL aggiunge soltanto colonne nullable e indice.
  [`migration.sql:1`](../../../prisma/migrations/20261117164500_add_visitpedemontana_source_queue/migration.sql#L1)

**Copertura e operatività**

- I test isolano fair queue, cooldown, claim concorrente e recupero dei checkpoint.
  [`cron-source-scheduler.test.mjs:46`](../../../lib/cron-source-scheduler.test.mjs#L46)

- Le regressioni assicurano che checkpoint e cooldown esistenti sopravvivano ai rinvii.
  [`cron-execution.test.mjs:244`](../../../lib/cron-execution.test.mjs#L244)

- Il runbook descrive applicazione della migrazione e retry al cron giornaliero.
  [`DEPLOY_RUNBOOK.md:304`](../../../docs/DEPLOY_RUNBOOK.md#L304)
