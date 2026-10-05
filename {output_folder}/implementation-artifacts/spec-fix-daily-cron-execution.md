---
title: 'Ripristinare esecuzione giornaliera e stato dei cron'
type: 'bugfix'
created: '2026-10-05'
status: 'done'
baseline_commit: '17627ca45e268b1dc74e05200c265f432840d11f'
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** L'admin andreacazzola90@gmail.com vede cron apparentemente fermi al 29 settembre. Il database configurato registra un avvio di Visit pedemontana il 5 ottobre e nuove importazioni, ma VisitSchio resta al 29 settembre. Lo stato generale visitpedemontana viene aggiornato soltanto dal comando manuale; il dispatcher automatico puo' consumare il timeout sulla prima fonte prima di avviare la seconda.

**Approach:** Ripartire il tempo disponibile tra tutte le fonti attive, interrompere in modo cooperativo la lavorazione prima della scadenza e dare precedenza alle fonti meno recentemente avviate. Registrare lo stato generale anche per le chiamate automatiche, distinguendo successi, errori e lavoro rinviato. Verificare separatamente che il deployment utilizzi la configurazione Chromium gia' corretta nel codice locale.

## Boundaries & Constraints

**Always:** Conservare la chiamata Vercel giornaliera esistente, il controllo CRON_SECRET, la deduplicazione e il comportamento dry-run. Le fonti sono globali e non devono essere attribuite artificialmente a un account. Gli eventi gia' salvati restano intatti. Il database conserva una sola riga per jobKey: non affermare di conoscere lo storico completo degli avvii giornalieri. Rispettare il limite serverless di 300 secondi e lasciare margine per la registrazione del risultato. Usare test deterministici con scraper e orologio simulati, senza consumare chiamate AI o scrivere eventi reali. Non esporre segreti nelle verifiche.

**Ask First:** Cambiare provider di scheduling, frequenza, schema del database o avviare un deployment. Richiedere conferma prima di esecuzioni live che importano eventi o pubblicano storie Instagram. Se non ci sono accessi a Vercel, dichiarare che la configurazione in produzione non e' verificata.

**Never:** Toccare modifiche UI preesistenti, modificare password o ruoli, aggiungere un cron per utente, disattivare l'autenticazione, cancellare registri o eventi. Non simulare che una chiamata cron sia riuscita se e' terminata con partial-error. La pubblicazione automatica Instagram e' fuori ambito: non ha una schedulazione in vercel.json e non va attivata implicitamente.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Due fonti attive | Prima fonte con molti nuovi link | Entrambe ricevono tempo di esecuzione; lavoro eccedente rinviato | Risultato esplicito senza dichiarare completamento integrale |
| Fonte mai avviata o vecchia | Registri mancanti o startedAt anteriore | Priorita' rispetto a una fonte appena avviata | Lettura registri indisponibile non blocca lo scraping |
| Chiamata automatica | Bearer corretto | Stato generale e stati delle fonti aggiornati | Errori di scraping visibili anche senza trigger manuale |
| Browser non avviabile | Errore Chromium | Fonte fallita; altre fonti tentate se c'e' tempo | Messaggio conservato; nessun falso successo |
| Dry-run | dryRun=1 | Nessun evento scritto, risultati riconoscibili come prova | Non usare il dry-run come conferma di avvio automatico |
| Autorizzazione errata | Bearer mancante o errato con secret configurato | HTTP 401 e nessuno scraper avviato | Nessuna mutazione dei registri |
| Chiamata manuale | Risposta partial-error dallo scraper | Stato manuale failed, non completed | Preservare dettagli di ciascuna fonte |

</frozen-after-approval>

## Code Map

- `app/api/cron/scrape-visitpedemontana/route.ts`: selezione fonti, listing, loop processEventLink e registri per fonte; proprietario dell'esecuzione automatica.
- `app/api/admin/run-cron/instagram-story/route.ts`: trigger manuale; attualmente considera successo qualsiasi risposta HTTP 2xx.
- `lib/browser-vercel.ts`: configurazione Chromium serverless; gia' contiene la selezione del runtime Lambda per estrarre libnss3.
- `prisma/schema.prisma`: CronSource globale; CronJobRun ha jobKey univoco, quindi non e' uno storico.
- `vercel.json`: unica chiamata scraper giornaliera alle 04:15 UTC, durata massima 300 secondi.
- `lib/event-scan-groups.test.mjs`: riferimento per node:test e import TypeScript nelle verifiche locali.

## Tasks & Acceptance

**Execution:**
- [x] `app/api/cron/scrape-visitpedemontana/route.ts`: dispatcher equo, scadenze cooperative nei loop listing/API/eventi e stato generale aggiornato.
- [x] `lib/cron-execution.test.mjs`: 17 test con node:test, TypeScript transpile e VM sul dispatcher e scraper reali, senza nuovo modulo di produzione e senza database reale.
- [x] `app/api/admin/run-cron/instagram-story/route.ts` e `vercel.json`: esiti applicativi falliti interpretati, errori circoscritti al job target e timeout proxy portato a 300 secondi.
- [x] Query read-only: Visit pedemontana ha importato 21, 28, 16, 29, 11 e 17 eventi rispettivamente dal 30 settembre al 5 ottobre; VisitSchio ultimo avvio 29 settembre. Nessun progetto Vercel collegato localmente e nessun VERCEL_TOKEN disponibile: deployment e log produzione non verificabili da questa sessione.

**Acceptance Criteria:**
- Given due fonti con backlog, when parte la chiamata giornaliera, then la prima non esaurisce deliberatamente tutto il tempo disponibile e la seconda viene tentata.
- Given un avvio automatico, when termina, then lo stato generale riflette quell'avvio senza richiedere un click manuale.
- Given importazioni successive al 29 settembre, when si comunica la diagnosi, then si distingue tra importazione osservata, avvio automatico provato e dati storici non disponibili.
- Given test e controlli statici, when terminano, then le verifiche della correzione passano e gli eventuali problemi preesistenti sono riportati separatamente.

## Spec Change Log

## Design Notes

La ripartizione e' cooperativa: non abbandonare promesse in corso con Promise.race, perche' continuerebbero a lavorare e scrivere dati. Una singola estrazione puo' comunque durare piu' del previsto; mantenere margine e verificare i timeout esistenti prima di promettere un limite assoluto. Ordinare per ultimo avvio riduce la starvation anche quando un'estrazione supera il budget. Non ricostruire uno storico degli avvii dalle sole date degli eventi: giornate senza nuovi eventi non dimostrano mancati avvii.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/cron-execution.test.mjs`: 17/17 PASS; prima del fix 8/9 FAIL, incluso seconda fonte non avviata.
- `npx eslint app/api/cron/scrape-visitpedemontana/route.ts app/api/admin/run-cron/instagram-story/route.ts lib/cron-execution.test.mjs`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- Query Prisma read-only: date importazioni e ultimi registri, senza token o dati di autenticazione.

## Review Outcomes

Tre revisioni indipendenti completate: blind adversarial, edge cases e acceptance audit. Riparati i rilievi su riserva di tempo per l'estrazione, budget minimi utili, continuazione API e link rinviati, errori API espliciti, checkpoint della fonte di fallback e aggiornamenti condizionati a startedAt. La continuita' e' verificata con due esecuzioni non-dry simulate, senza database reale. Il cursore e i link pendenti usano resultJson, senza migrazioni. Il dry-run conserva i checkpoint precedenti senza avanzare la scansione reale.

Limiti preesistenti annotati in deferred-work.md: una singola estrazione non e' cancellabile cooperativamente e il trigger manuale comunica lo stato fallito nel JSON ma mantiene HTTP 200. Nessun commit, push o deployment eseguito. Vercel di produzione resta da verificare e aggiornare.

## Suggested Review Order

**Dispatcher e stato**

- Avvio automatico, ripartizione equa e registro generale aggiornato.
	[route.ts:892](../../app/api/cron/scrape-visitpedemontana/route.ts#L892)
- Riserva per lavorare gli eventi, senza dedicare tutto il tempo alla raccolta.
	[route.ts:237](../../app/api/cron/scrape-visitpedemontana/route.ts#L237)
- Checkpoint dei link rinviati e ripresa della scansione successiva.
	[route.ts:858](../../app/api/cron/scrape-visitpedemontana/route.ts#L858)
- Esiti applicativi e aggiornamenti manuali circoscritti alla propria esecuzione.
	[instagram-story/route.ts:69](../../app/api/admin/run-cron/instagram-story/route.ts#L69)

**Verifiche e configurazione**

- Test deterministici sul dispatcher e sulle estrazioni reali simulate.
	[cron-execution.test.mjs:125](../../lib/cron-execution.test.mjs#L125)
- Timeout coerente per il proxy manuale, senza modificare il cron giornaliero.
	[vercel.json:15](../../vercel.json#L15)