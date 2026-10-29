---
title: 'Telegram admin e pubblicazione giornaliera degli eventi'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: '8f9c407f2602389a6898826695bfdac617b5c898'
context: []
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** L'admin vuole trovare e pubblicare eventi dai social. L'utente ha scelto di iniziare da Telegram e rinviare Facebook, Instagram e WhatsApp.

**Approach:** Collegare un bot Telegram all'admin, raccogliere nuovi messaggi e locandine dalle fonti autorizzate e pubblicare automaticamente gli eventi validi nel cron giornaliero. Il bot non equivale all'account personale: non legge ogni chat seguita dall'utente.

## Boundaries & Constraints

**Always:** Gestione solo admin; token cifrati lato server, mai esposti in risposte o log. Fonti selezionate con autorizzazione alla ripubblicazione distinta dall'accesso. Riutilizzare estrazione, privacy immagini, deduplicazione e calendario. Pubblicare solo eventi sostenuti dalla fonte con titolo, data e luogo. Conservare provenienza e risultati parziali senza esporre chat private.

**Ask First:** Applicare migrazioni condivise, servizi a pagamento, worker esterni o sessioni personali Telegram. Preparare la migrazione e consentito, applicarla in produzione no. Inserire segreti nell'interfaccia protetta o configurazione server, mai in chat.

**Never:** Raccogliere password o cookie; aggirare permessi; promettere storico o stories; alterare la pubblicazione manuale esistente. Facebook, Instagram e WhatsApp sono rinviati.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connessione | Token bot | Verifica getMe e registrazione webhook HTTPS | Errore non diventa connessione riuscita |
| Raccolta | Webhook message/channel_post, testo, didascalia o foto | Verifica secret_token, fonte consentita e salvataggio durevole | Richiesta falsa rifiutata; nessun successo prima del salvataggio |
| Permessi | Bot assente o privacy mode limitante | Fonte non attiva e limite esplicito | Nessuna promessa di leggere tutto il gruppo |
| Pubblicazione | Contenuti nuovi autorizzati | Estrazione nel cron; eventi validi pubblicati | Incompleti o privati scartati con conteggio |
| Riprova | Duplicati, modifiche o cron concorrenti | Una pubblicazione per evento, ripresa persistente | Nessuna sovrascrittura automatica di eventi pubblicati |
| Revoca | Token invalido, fonte rimossa o disconnessione | Stop raccolta/elaborazione della fonte | Altre fonti proseguono; segreti eliminati |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma`: User, Event e CronJobRun; mancano dati Telegram.
- `app/lib/auth-helpers.ts`: withAdminAuth; usare import relativi per i moduli nella lib radice.
- `app/cron/CronAdminClient.tsx`: gestione scansioni esistente.
- `app/api/cron/scrape-visitpedemontana/route.ts`: cron 04:15 UTC, budget 300s, salvataggio e calendario.
- `lib/event-processor.ts`, `lib/event-duplicates.ts`: elaborazione riutilizzabile.

## Tasks & Acceptance

**Execution:**
- [x] `docs/API_REFERENCE.md`, `docs/DEPLOY_RUNBOOK.md` -- verificare Bot API ufficiale; documentare permessi, HTTPS pubblico, segreti, installazione e limiti.
- [x] `prisma/schema.prisma`, `prisma/migrations/` -- preparare connessione legata a User, fonti consentite, aggiornamenti univoci e coda con lease/riprova; includere retention e pulizia dei contenuti grezzi.
- [x] `lib/telegram-connection.ts`, `app/api/admin/telegram/route.ts` -- token cifrato, getMe, setWebhook, gestione fonti e disconnessione; proteggere proprietario e mutazioni CSRF.
- [x] `app/api/telegram/webhook/route.ts` -- verificare header segreto, payload e dimensioni; acquisire idempotentemente messaggi e modifiche solo dalle fonti ammesse, senza AI nel webhook.
- [x] `lib/telegram-event-scanning.ts`, `app/api/cron/scrape-visitpedemontana/route.ts` -- elaborare coda e foto via Bot API con limiti, privacy e deduplicazione persistente; preservare dry-run, budget condiviso, rotazione delle fonti web e calendario. Nessun token negli URL evento.
- [x] `app/cron/CronAdminClient.tsx` -- collegamento bot, fonti, consenso, disconnessione, errori e conteggi nello stile esistente; niente OAuth fittizio.
- [x] `lib/telegram-event-scanning.test.mjs`, `lib/cron-execution.test.mjs`, `cypress/e2e/telegram-connections.cy.ts` -- coprire matrice, isolamento admin, segreti, privacy, concorrenza e cron con provider simulato.

**Acceptance Criteria:**
- Given un non admin, when usa la gestione Telegram, then riceve 401/403 senza segreti.
- Given nuovi contenuti autorizzati, when termina il cron, then gli eventi validi sono pubblicati automaticamente con conteggi distinti.
- Given una fonte non autorizzata, when arriva un messaggio, then non alimenta la coda eventi.
- Given un dry-run, when termina, then non pubblica ne avanza la coda.

## Spec Change Log

- 2026-10-29: scelta S dell'utente; prima fase Telegram, altre piattaforme registrate in deferred-work.md. Conservata pubblicazione automatica.

## Design Notes

Nessun nuovo scheduler: webhook raccoglie, cron pubblica. Il bot accede anche a fonti di terzi solo se aggiunto con i permessi necessari. Le foto passano dai controlli privacy esistenti, mai pubblicate integralmente per ripiego. Nessuna funzionalita e dichiarata operativa senza configurazione e prova reale.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs` -- matrice e regressioni superate.
- `npx prisma validate`, `npx tsc --noEmit --incremental false` -- schema e tipi validi.
- `npx eslint <file modificati>` -- nessun nuovo errore.
- `npx cypress run --spec cypress/e2e/telegram-connections.cy.ts` -- gestione admin con API simulate.

**Browser:** Desktop/mobile, stati e segreti assenti dalle risposte. Prova reale solo con bot e fonte di test autorizzati, senza pubblicare eventi di prova; dichiarare verifiche impedite da configurazione esterna.

## Implementation Handoff (2026-10-29)

Status lasciato `in-progress` per revisione dell'agente principale. Baseline invariata. Nessuno step04, delega, task_complete, commit, branch, push, operazione Git remota, deploy, migrazione applicata o modifica di segreti. Nessun bot reale registrato o evento di prova pubblicato.

### Architettura Implementata

- Gestione protetta da sessione e ruolo admin persistito, senza eccezione legacy sul prefisso email. Isolamento per proprietario e CSRF same-origin da configurazione server fidata. AES-256-GCM con nonce casuale, AAD/versione e chiave obbligatoria; secret webhook conservato solo come hash. Errori Bot API/download sanitizzati, incluse redazioni Sentry per URL/token/header/body Telegram.
- Webhook ufficiale autenticato tramite `X-Telegram-Bot-Api-Secret-Token`, payload limitato e persistenza idempotente `(fonte, messaggio, updateId/versione)`. Nessuna AI nel webhook. Connessione, fonti e consenso ricontrollati sotto lock transazionale; disconnessione e revoca eliminano credenziali/contenuti pendenti.
- Consumer con lease 60s, massimo tre tentativi, retry esponenziale e cursore oldest-first persistito per fonte. Due messaggi per lotto, uno per fonte visitata; deadline Telegram 90s parallela al lavoro web. Budget cron 260s, minimo web 120s e rotazione preservati. Fonte verificata con getMe/getChat/getChatMember prima e dopo AI; consenso, token, versione e lease ricontrollati al commit.
- AI centralizzata estesa al solo testo, oltre alle foto. Citazioni coerenti per titolo/data completa/luogo; date senza anno, incomplete, passate, eventi privati o prove mescolate sono scartati. Privacy immagini riutilizzata: solo crop verificato, mai fallback originale. Copertina JPEG data URL limitata a 960x960/256 KiB prima di base64; nessuno storage aggiuntivo o URL file Telegram nei dati pubblici. Link t.me solo per canali pubblici attualmente verificati; altrimenti provenienza interna opaca.
- Dedupe esistente e creazione evento/calendario estesi con client transazionale opzionale. Eventi, ricevute e consegne calendario atomici; fingerprint univoco e lock per data ordinati contro concorrenza. Ricevute con evento opzionale consentono la normale cancellazione manuale. Raw text/file ID cancellati al completamento/fallimento terminale; dopo 72h non sono piu elaborabili e vengono eliminati al successivo cron non dry-run. Dry-run senza mutazioni Telegram/eventi/calendario/cursore.

### File Cambiati

- [Schema Prisma](../../prisma/schema.prisma) e [migrazione SQL preparata](../../prisma/migrations/20261029130000_add_telegram_scanning/migration.sql).
- [Client e sicurezza Telegram](../../lib/telegram-connection.ts), [store e gestione proprietaria](../../lib/telegram-store.ts), [consumer e pubblicazione](../../lib/telegram-event-scanning.ts).
- [API admin](../../app/api/admin/telegram/route.ts), [webhook](../../app/api/telegram/webhook/route.ts), [cron integrato](../../app/api/cron/scrape-visitpedemontana/route.ts).
- [Componente Telegram](../../app/cron/TelegramAdmin.tsx), [integrazione Cron Admin](../../app/cron/CronAdminClient.tsx).
- [AI centralizzata](../../lib/vision-ai.ts), [dedupe riutilizzabile](../../lib/event-duplicates.ts), [calendario transazionale](../../app/lib/google-calendar.ts), [redazione Sentry server](../../sentry.server.config.ts).
- [Test Telegram](../../lib/telegram-event-scanning.test.mjs), [regressioni cron](../../lib/cron-execution.test.mjs), [Cypress isolato](../../cypress/e2e/telegram-connections.cy.ts).
- [API Reference](../../docs/API_REFERENCE.md), [Deploy Runbook](../../docs/DEPLOY_RUNBOOK.md), questa spec (solo task e handoff fuori dal blocco frozen).

### Verifiche Eseguite

- `node --experimental-strip-types --test lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs lib/google-calendar.test.mjs lib/event-media.test.mjs lib/event-scan-agents.test.mjs`: **143 pass, 0 fail**. Provider/database simulati; nessuna chiamata credenziale reale o scrittura eventi. Incluse cifratura/manomissione, registrazione fallita, secret, limiti payload, update/edit idempotenti, scadenze/retry, lease concorrenti, revoca durante AI, isolamento admin, CSRF, privacy foto e URL, transazioni/calendario, dry-run e regressioni budget/rotazione web.
- `npx prisma validate`: schema valido. `npx prisma generate`: client generato localmente, migrazione non applicata.
- `npx tsc --noEmit --incremental false`: nessun errore.
- `npx eslint` su tutti i file di codice modificati: nessun errore o warning.
- `npx cypress run --spec cypress/e2e/telegram-connections.cy.ts --config trashAssetsBeforeRuns=false`: **7 pass, 0 fail**. Componente reale, risposte gestione simulate; soltanto richieste anonime alle API reali per verificare 401. Screenshot finali ispezionati a 1280px e 390px, nessun overflow o sovrapposizione. Nessun utente/bot/evento creato.
- Diagnostica editor `get_errors`: nessun errore nei file modificati. Controllo documentazione e hash blocco approvato prima/dopo aggiornamento task.
- Documentazione ufficiale Bot API/FAQ consultata via fetch_webpage: getMe, getChatMember, setWebhook.secret_token, getFile e privacy mode. Mai getUpdates insieme al webhook.

### Setup E Limiti Residui

- **Live bloccato**: servono migrazione autorizzata, bot/fonte autorizzati e HTTPS pubblico raggiungibile. Non verificate su PostgreSQL live le garanzie concorrenti/rollback: testate con client simulato e vincoli SQL preparati. Non certificati quota/accuratezza AI, permessi bot o consegna webhook reali.
- Configurare manualmente `TELEGRAM_ENCRYPTION_KEY` (64 caratteri hex), `TELEGRAM_WEBHOOK_BASE_URL` (origine HTTPS stabile), `TELEGRAM_ADMIN_ORIGIN` o `NEXTAUTH_URL`, `CRON_SECRET_KEY` e provider AI esistenti. La registrazione reale deve avvenire solo nell'interfaccia protetta dopo autorizzazione. Nessun segreto stampato o toccato.
- Limite intenzionale di due messaggi per cron e 50 fonti per connessione. Cleanup grezzi dipendente dal successivo cron riuscito; monitorare backlog/deferred. Fonti/chat personali, storico, stories, Facebook, Instagram e WhatsApp fuori ambito. Le richieste cloud gia in volo non sono richiamabili, ma i risultati successivi a una revoca non possono superare il controllo finale di pubblicazione.
- Foto non approvate omesse, nessuna garanzia di anonimizzazione dei dati trasmessi all'AI. Copertine data URL aumentano la dimensione del database in modo limitato. Pausa/revoca scarta i contenuti pendenti; riattivazione con nuovo consenso/verifica. Rimozione webhook remota non confermata segnalata onestamente (`remoteRemoved=false`).
- Figma: `tool_search` non disponibile nell'ambiente, quindi impossibile caricare correttamente skill/tool ufficiali differiti; limite dichiarato, nessuna risorsa Figma remota creata. Stile Cron Admin preservato. Revisione finale demandata all'agente principale.

## Review Patch Handoff (2026-10-29)

Patch dei percorsi gia approvati dopo revisione indipendente. Frontmatter lasciato `in-review`; blocco frozen invariato (SHA-256 `d0e473acefad7a607087c5c6fb7578dfea05572a0697cbda096d5d93641ced8b`). Questa sezione aggiorna il precedente handoff storico, senza modificare intent, vincoli o criteri approvati. Nessuna delega, commit, deploy, migrazione applicata, lettura/stampa di segreti dotenv, chiamata a bot reale o pubblicazione di eventi.

### Correzioni Dei Dodici Rilievi

1. Errori Bot API separati: 5xx/rete/rate-limit ritentabili; 401 revoca connessione corrente, 403 verifica fonte distinto da operazioni bot/file. `getFile` 400 non disattiva la fonte: caption utilizzabile senza foto, oppure fallimento del solo job. Test HTTP500 con altra acquisizione invariata e foto400 con/senza caption.
2. Revisione monotona della fonte, identita sorgente e generazione connessione confrontate prima di applicare risultati remoti. Pause/rimozioni/revoche incrementano la revisione; pubblicazione e distruzione code verificano anche job version+lease corrente. Deferred promises coprono save-pause/remove-completamento, vecchi errori dopo pausa/nuovo consenso/acquisizione, e worker-revoca contro save in volo.
3. Ciclo remoto protetto da stati persistenti `connecting`, `disconnecting`, `disconnect_unknown` e finalizzazione CAS, senza transazione DB aperta sulla rete. Un delete tardivo non puo sovrapporsi a un nuovo setWebhook. Timeout/fallimento richiede retry di disconnessione confermato; UI blocca reconnect e aggiorna stato dopo errori. Test interleaving controllato e retry, anche con risultato ambiguo.
4. Ricevute indipendenti dallo storico: messageId opzionale con FK `ON DELETE SET NULL` in schema e SQL preparato. Fingerprint persistente anche eliminando connessione/messaggi/evento e riconnettendo un altro bot; test non ripubblica l'evento cancellato.
5. Nuovi edit non supportati/protetti/inoltrati con identita valida invalidano la versione non pubblicata, svuotano payload e revocano lease. Test foto-caption verso video senza caption prima del cron e durante AI, oltre a protetti/inoltrati e invariabilita degli eventi pubblicati.
6. `removedAt` distingue stabilmente la rimozione; limite 50 esclude rimossi, include pause. Aggiunta successiva senza reconnect e recupero slot testati; indipendenza dal testo lastError verificata.
7. Evidence DD-MM-YYYY, title/location normalizzati di almeno due caratteri, annullamento nel paragrafo dell'evento con avvisi globali espliciti ancora applicabili. Test date misassociate, punteggiatura, paragrafo annullato accanto a evento valido e annullamento globale; ambiguita multi-data resta conservativa.
8. Per estrazioni multi-evento tutte le cover sono omesse, sia nel crop sia nel publisher: nessuna immagine verificata solo per il primo viene riutilizzata sugli altri. Test estrazione reale con foto sintetica e salvataggio simulato.
9. Riserva commit 17s (maxWait 2s + timeout transazione 15s), API/AI massimo 40s ridotto al residuo, controllo finale prima di pubblicare. Test AI lenta e budget insufficiente; preservati due messaggi, fonte web minimo120s, budget globale260s e fairness.
10. Cron accetta CRON_SECRET Vercel e KEY legacy configurati, fail-closed se entrambi mancanti. Proxy manuale scraper preferisce CRON_SECRET, fallback KEY e 503 senza configurazione; altri cron invariati. Test solo CRON_SECRET con header Vercel, entrambi, KEY e assenza di secret.
11. Helper minimo condiviso per advisory lock su date canoniche ordinate. Web geocoding esterno al lock; recheck duplicati e createEventWithCalendar nello stesso client transazionale usato da Telegram per evento/calendario/ricevuta. Test web in geocoding-Telegram commit-web duplicate e ordine inverso, con chiave lock condivisa.
12. Mock Telegram con snapshot rollback e transazioni serializzate: failure iniettate tra creazione evento e calendario/ricevuta ripristinano eventi, consegne, ricevute e job; retry concorrente/CAS e insert fingerprint univoco esercitati. Ispezionati SQL e confini transazione reali. Non e una prova dei lock PostgreSQL live.

### File Modificati Dalla Review Patch

- [Connessione](../../lib/telegram-connection.ts), [store](../../lib/telegram-store.ts), [consumer](../../lib/telegram-event-scanning.ts), [dedupe/lock](../../lib/event-duplicates.ts).
- [Scraper cron](../../app/api/cron/scrape-visitpedemontana/route.ts), [proxy manuale](../../app/api/admin/run-cron/instagram-story/route.ts), [UI Telegram](../../app/cron/TelegramAdmin.tsx).
- [Schema](../../prisma/schema.prisma), [SQL solo preparato](../../prisma/migrations/20261029130000_add_telegram_scanning/migration.sql).
- [Test Telegram](../../lib/telegram-event-scanning.test.mjs), [test cron](../../lib/cron-execution.test.mjs), [Cypress Telegram](../../cypress/e2e/telegram-connections.cy.ts).
- [API Reference](../../docs/API_REFERENCE.md), [Deploy Runbook](../../docs/DEPLOY_RUNBOOK.md), questa spec solo append handoff fuori frozen. Nessuna modifica agli altri lavori preesistenti.

### Output Verifiche E Rischi Residui

- Node: **216 pass, 0 fail**, con `node --experimental-strip-types --test lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs lib/google-calendar.test.mjs lib/calendar-ics.test.mjs lib/calendar-view.test.mjs lib/event-media.test.mjs lib/event-cover.test.mjs lib/event-cover-network.test.mjs lib/event-image.test.mjs lib/event-scan-agents.test.mjs`.
- Prisma: **schema valido e client generato** con `DOTENV_CONFIG_PATH=/dev/null` e DATABASE_URL locale fittizio; nessun accesso DB o SQL applicato. TypeScript `--noEmit --incremental false`: **exit0**. ESLint scoped, incluso proxy manuale: **exit0, nessun errore/warning**. Diagnostica editor dei file corretti: pulita.
- Cypress: **9 pass, 0 fail**, provider simulati, config temporaneo minimale `/tmp/events-telegram-review.cypress.config.cjs` senza dotenv/task DB, `trashAssetsBeforeRuns=false`. Server locale preesistente riutilizzato; solo richieste anonime alle API reali per verificare 401. Screenshot 1280/390px senza overflow/sovrapposizioni; nessun utente, bot o evento creato. Cypress 15 non supporta configFile:false: usato config esplicito, non modificata la configurazione di progetto.
- Test incrementalmente eseguiti dopo ogni slice. Riparati subito due adattamenti dei mock (rotazione secret reconnect e ordine inizializzazione fixture cron), poi rieseguiti gli stessi test prima di proseguire; il typecheck ha richiesto il solo allargamento `lastError` nel fixture UI.
- Garanzie DB live non certificate: lock/contesa/rollback PostgreSQL richiedono un ambiente autorizzato; qui snapshot/CAS/unique insert simulati, vincoli SQL preparati e uso client transazionale ispezionati. Migrazione e configurazione bot/HTTPS restano prerequisiti manuali. Nessun test rete Telegram/AI reale, quota, accuratezza o consegna webhook.
- Un processo interrotto puo lasciare `connecting`/`disconnecting`: il blocco e intenzionale per non riconnettere mentre una vecchia richiesta remota puo completarsi. Serve indagine/manutenzione autorizzata, non forzare active. Errori/timeout gestiti diventano `disconnect_unknown`, con encryptedToken conservato soltanto per cleanup; revoca401 o cleanup confermato lo cancellano.
- Budget cooperative del cron non equivale a hard realtime: I/O DB e web gia avviato possono ancora dipendere dai timeout infrastrutturali. Pubblicazione Telegram rifiutata se manca la riserva commit; limiti2 messaggi/50 fonti e retention72h invariati. Revisione finale e stato lasciati all'agente principale.

## Final Review (2026-10-29)

- Completate tre revisioni indipendenti: blind hunter, edge-case hunter e acceptance auditor. Segnalazioni duplicate consolidate; difetti locali corretti senza cambiare l'intento approvato. Le correzioni e i relativi test sono elencati nel Review Patch Handoff.
- Verifica finale dell'agente principale: 162 test Node focalizzati superati, TypeScript, Prisma validate con configurazione fittizia, ESLint scoped e diagnostica editor puliti. Suite estesa 216/216 e Cypress 9/9 verificati durante le correzioni; screenshot desktop/mobile ispezionati nuovamente senza sovrapposizioni.
- Consultato l'indice ufficiale delle skill Figma nella revisione finale; nessun file Figma, import o risorsa remota richiesto o creato. I limiti di accesso strumenti sopra descrivono soltanto l'ambiente dei subagenti.
- Codice completato, integrazione non attivata live. Restano configurazione bot/HTTPS/chiave server e applicazione autorizzata della migrazione; nessuna garanzia live di permessi, quota AI o lock PostgreSQL. Il server locale preesistente espone la gestione su `/cron`.
- Nessun commit automatico, push, deploy, modifica di segreti o pubblicazione di prova. Il completamento della specifica riguarda il codice e i controlli locali, non l'attivazione in produzione.

## Suggested Review Order

**Ingresso E Autorizzazione**

- Sessione admin persistita e gestione proprietaria senza esposizione di credenziali.
	[route.ts:16](../../app/api/admin/telegram/route.ts#L16)
- Ciclo del bot e revisioni delle fonti impediscono riattivazioni da risultati obsoleti.
	[telegram-store.ts:37](../../lib/telegram-store.ts#L37)

**Raccolta E Pubblicazione**

- Il webhook autentica e acquisisce senza avviare estrazione AI.
	[webhook/route.ts:7](../../app/api/telegram/webhook/route.ts#L7)
- Versioni e consenso proteggono la coda da edit, replay e revoche concorrenti.
	[telegram-store.ts:181](../../lib/telegram-store.ts#L181)
- Evento, calendario e ricevuta sono pubblicati nella stessa transazione.
	[telegram-event-scanning.ts:132](../../lib/telegram-event-scanning.ts#L132)
- Lock per data condiviso con il percorso web evita duplicati tra fonti.
	[event-duplicates.ts:14](../../lib/event-duplicates.ts#L14)
- Il cron assegna lavoro Telegram limitato senza rimuovere la rotazione web.
	[scrape-visitpedemontana/route.ts:908](../../app/api/cron/scrape-visitpedemontana/route.ts#L908)

**Interfaccia E Verifica**

- Gestione del bot, consenso per fonte e stati onesti di connessione.
	[TelegramAdmin.tsx:50](../../app/cron/TelegramAdmin.tsx#L50)
- Schema e migrazione sono preparati, non applicati al database.
	[schema.prisma:97](../../prisma/schema.prisma#L97)
- Regressioni su webhook, errori, concorrenza simulata e privacy.
	[telegram-event-scanning.test.mjs:1](../../lib/telegram-event-scanning.test.mjs#L1)
- Setup, sicurezza e limiti operativi restano espliciti prima dell'attivazione.
	[DEPLOY_RUNBOOK.md:9](../../docs/DEPLOY_RUNBOOK.md#L9)