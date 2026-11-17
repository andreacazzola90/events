# Investigation: Scraping giornalieri non avviati

## Hand-off Brief

1. **What happened.** L'utente riferisce che uno scraping VisitPedemontana non parte nel cron giornaliero delle 19; l'ultimo caso indicato è il 16 novembre 2026.
2. **Where the case stands.** Il codice permette di differire o saltare singole sorgenti web per rate limit o budget di tempo, ma il ramo effettivo del run non è confermato.
3. **What's needed next.** Confrontare lo storico admin del 16 novembre con `rateLimitRetryAt`, stato della sorgente e tempo residuo; senza quel payload il caso resta bloccato sui log.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-11-17 |
| Status           | Blocked on evidence |
| System           | macOS; cron configurato su Vercel |
| Evidence sources | Configurazione Vercel; sorgenti cron; storico admin disponibile ma payload di produzione non fornito |

## Problem Statement

L'utente riferisce che un cronjob parte ogni giorno verso le 19, ma non tutti gli scraping partono; ha specificato che si riferisce a VisitPedemontana e che l'ultimo caso è stato il 16 novembre 2026 intorno alle 19. L'orario è approssimativo; gli esiti effettivi del run non sono disponibili.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `vercel.json` | Available | Il solo cron dichiarato ha percorso `/api/cron/daily` e schedule `0 18 * * *`. |
| Sorgenti cron | Available | Route giornaliera, dispatcher e route di scraping sono stati tracciati. |
| Documentazione cron | Available | `docs/DEPLOY_RUNBOOK.md` descrive finestra oraria, autenticazione, fan-out e osservabilità. |
| Cronologia Git | Available | Sono presenti modifiche recenti all'orchestrazione e al tracciamento degli stati cron. |
| Test risultati | Partial | Esistono test cron nel repository; non è stata eseguita una suite in questa fase né verificata la copertura di ogni condizione runtime. |
| Storico cron admin | Partial | `GET /api/admin/cron-status?includeSourceRuns=1` restituisce `daily-dispatch`, `visitpedemontana` e `scrape-source:*`; manca il payload del run del 16 novembre. |
| Log dashboard Vercel / esiti cron | Missing | Necessari per identificare gli scraping e le date saltate. |
| Configurazione deploy e variabili runtime | Missing | Necessarie se la causa dipende da ambiente o limiti del provider. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Tracciare `/api/cron/daily`, dispatcher e selezione delle sorgenti | High | Done | Fan-out di sei job dopo autenticazione; il dispatch non dimostra l'avvio o completamento downstream. |
| 2 | Ottenere log e stato del run VisitPedemontana del 2026-11-16 | High | Blocked | La data approssimativa è nota; servono esiti per job e sorgente, oltre ai log Vercel se presenti. |
| 3 | Confrontare schedule, fuso orario e limiti di esecuzione Vercel | Medium | Done | La finestra Vercel spiega l'avvio variabile nell'ora; restano da verificare i limiti nel deployment effettivo. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-11-17 | L'utente riferisce che il cron parte verso le 19 e alcuni scraping non partono. | Messaggio utente | Confirmed as report |
| 2026-11-17 | La configurazione del repository pianifica `/api/cron/daily` ogni giorno alle 18:00. | `vercel.json` | Confirmed |
| 2026-11-17 | La documentazione indica che Vercel Hobby può avviare il cron in un momento qualsiasi dell'ora prevista e che la route aggregatrice inoltra le chiamate ai job. | `docs/DEPLOY_RUNBOOK.md` | Confirmed as documented behavior |
| 2026-11-17 | L'utente precisa che lo scraping interessato è VisitPedemontana e che l'ultimo run osservato è stato il giorno precedente verso le 19. | Messaggio utente | Confirmed as report; orario approssimativo |

## Confirmed Findings

### Finding 1: È configurato un solo cron Vercel giornaliero

**Evidence:** `vercel.json` configura `path: "/api/cron/daily"` e `schedule: "0 18 * * *"`.

**Detail:** La configurazione dichiara una chiamata giornaliera alla route aggregatrice. Da sola non dimostra che tutte le sorgenti scraping vengano avviate né che la chiamata sia stata eseguita con successo.

### Finding 2: Il fan-out parte solo dopo il controllo di autenticazione

**Evidence:** `app/api/cron/daily/route.ts:20-31,44-48`; `lib/cron-jobs.ts:1-8`; `lib/cron-dispatch.ts:3-29`.

**Detail:** Una volta autorizzata, la route itera i sei job configurati e li avvia in parallelo. Chiama il dispatcher un risultato per job, ma non prova che il codice downstream abbia iniziato o completato il lavoro.

### Finding 3: Una sorgente web può essere saltata senza saltare l'intero cron

**Evidence:** `app/api/cron/scrape-visitpedemontana/route.ts:242-253,990-1017`.

**Detail:** Le sorgenti con `rateLimitRetryAt` futuro vengono differite; se il budget web residuo è inferiore a 120 secondi, la sorgente è registrata come skipped. Il codice quindi consente che la route aggregatrice venga chiamata mentre singole sorgenti non iniziano lo scraping.

### Finding 4: L'orario segnalato è compatibile con la schedule configurata

**Evidence:** `vercel.json`; `docs/DEPLOY_RUNBOOK.md:302`.

**Detail:** La configurazione è alle 18:00 UTC e la documentazione dice che Vercel può avviare il cron in qualsiasi momento dell'ora pianificata. Il run delle 18:00 UTC corrisponde alle 19:00 in Italia nel periodo invernale; l'ora osservata non indica di per sé un ritardo anomalo.

### Finding 5: VisitPedemontana può saltare sorgenti web singole

**Evidence:** `app/api/cron/scrape-visitpedemontana/route.ts:176-224,236-253,938-960,983-1017`.

**Detail:** La route carica le sorgenti `CronSource` attive (con una sorgente di default se la lista è vuota o il caricamento fallisce), differisce una sorgente con `rateLimitRetryAt` futuro e processa in sequenza le sorgenti web. Se il budget residuo è inferiore a 120 secondi, registra la sorgente come skipped. Questi rami spiegano come il job VisitPedemontana possa essere invocato ma non avviare lo scraping di tutte le sorgenti.

## Deduced Conclusions

### Deduction 1: La schedule non sembra omettere selettivamente i job configurati

**Based on:** Finding 2.

**Reasoning:** Dopo l'autorizzazione, `/api/cron/daily` avvia con `Promise.all` tutti i sei job presenti in `CRON_JOBS`. Quindi, se alcuni job non sono stati richiesti, le cause da verificare sono prima del fan-out (trigger o autorizzazione) o durante l'invocazione; il codice non mostra una selezione casuale o basata sul giorno per questi job.

**Conclusion:** Se con “non partono tutti gli scraping” si intendono le sorgenti web di VisitPedemontana, il punto più probabile non è il fan-out Vercel ma il ciclo sequenziale interno alla route, che può differire o saltare singole sorgenti. È una deduzione sul flusso implementato, non la conferma di cosa sia accaduto nei run reali.

### Deduction 2: L'avvio verso le 19 è coerente con la finestra Vercel

**Based on:** Findings 1 and 4.

**Reasoning:** La configurazione è alle 18:00 UTC; nel periodo invernale italiano sono le 19:00 e Vercel può avviare il cron in un momento qualsiasi dell'ora prevista.

**Conclusion:** L'orario riferito non dimostra che il cron sia partito in ritardo o che sia stata saltata una schedulazione.

## Hypothesized Paths

### Hypothesis 1: La route aggregatrice non lancia tutte le sorgenti in ogni esecuzione

**Status:** Open

**Theory:** Alcune sorgenti web possono essere differite dal rate limit o saltate per budget insufficiente; route aggregate possono inoltre fallire o andare in timeout.

**Supporting indicators:** L'utente identifica VisitPedemontana; dentro la route le sorgenti web sono sequenziali e hanno condizioni di `rateLimitRetryAt` futuro e budget residuo inferiore a 120 secondi.

**Would confirm:** Gli esiti `cronJobRun` e i log del run interessato mostrano per la sorgente mancante `skipped`, `rateLimitRetryAt` futuro, errore o tempo insufficiente.

**Would refute:** Log completi mostrano che ogni scraper è stato lanciato e completato; il problema sarebbe allora a valle dell'avvio.

**Resolution:** La traccia ha confermato che queste condizioni di skip sono raggiungibili nel codice; è ancora aperto se si siano verificate nei run segnalati.

### Hypothesis 2: Il cron viene avviato con un orario variabile all'interno dell'ora pianificata

**Status:** Confirmed

**Theory:** L'utente osserva il trigger ogni sera intorno alle 19 perché la schedule Vercel è alle 18:00 UTC e la piattaforma può avviarla in qualunque momento dell'ora prevista.

**Supporting indicators:** `vercel.json` pianifica `0 18 * * *`; `docs/DEPLOY_RUNBOOK.md:302` documenta la finestra di avvio.

**Would confirm:** La dashboard Vercel mostra l'invocazione all'interno dell'ora pianificata.

**Would refute:** Una configurazione Production diversa o log della dashboard collocano il trigger fuori da tale finestra.

**Resolution:** Confermata come comportamento documentato e coerente con l'orario riportato; non prova che i job interni siano partiti.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Esiti del run del 16 novembre intorno alle 19 | Identifica se la route è partita e quale sorgente è stata saltata | Pannello Cron admin o `GET /api/admin/cron-status?includeSourceRuns=1` autenticato |
| Log Vercel della funzione `/api/cron/daily` e della route VisitPedemontana | Distingue trigger fallito, route interrotta e skip a livello sorgente | Dashboard Vercel → Logs/Crons, intervallo del 16 novembre 18:00–20:00 ora italiana |
| Stato e `resultJson` della sorgente mancante | Conferma `rateLimitRetryAt`, errore o budget insufficiente | Storico admin (`scrape-source:*`) e log applicativi |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | Ramo di skip per sorgente in `app/api/cron/scrape-visitpedemontana/route.ts:242-253,990-1017` |
| Trigger | `vercel.json` → `/api/cron/daily` → dispatcher → `/api/cron/scrape-visitpedemontana` |
| Condition | `rateLimitRetryAt` futuro oppure meno di 120 secondi di budget web residuo; il ciclo delle sorgenti è sequenziale |
| Related files | `lib/cron-jobs.ts`; `lib/cron-dispatch.ts`; `app/api/cron/daily/route.ts` |

## Conclusion

**Confidence:** Low

Per VisitPedemontana il codice conferma due condizioni che possono far saltare una singola sorgente: un `rateLimitRetryAt` ancora nel futuro oppure un budget residuo inferiore a 120 secondi quando la route raggiunge quella sorgente. Il dispatcher, se autorizzato, invoca tutti i job configurati. L'ultimo run è stato identificato come il 16 novembre intorno alle 19, ma senza il relativo payload admin o i log Vercel non è confermato quale ramo abbia causato il caso reale.

## Recommended Next Steps

### Fix direction

Nessuna proposta prima di identificare il punto in cui il flusso si interrompe.

### Diagnostic

Nel pannello Cron admin, verificare il run del 16 novembre intorno alle 19. Lo storico è servito dall'endpoint admin autenticato `GET /api/admin/cron-status?includeSourceRuns=1` (`app/api/admin/cron-status/route.ts:6-31`). Confrontare `daily-dispatch`, `visitpedemontana` e le righe `scrape-source:*`, in particolare `resultJson`, `status`, `rateLimitRetryAt` ed eventuali indicazioni di budget/skipped.

## Reproduction Plan

Non ancora definito; servono una data del run e il nome della sorgente mancante.

## Side Findings

- L'output folder degli artefatti BMAD non è definito; il dossier è stato creato nel fallback previsto `investigations/`.

