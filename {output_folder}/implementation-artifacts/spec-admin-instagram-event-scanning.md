---
title: 'Scansione giornaliera Instagram (stories e post) con pubblicazione eventi'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '6afd09905b224f4dbf21c5e6d16f86660192ca1b'
context: ['{project-root}/{output_folder}/implementation-artifacts/spec-admin-social-event-scanning.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'admin vuole che Instagram venga controllato ogni giorno in automatico e che gli eventi trovati vengano creati sul sito. Le API ufficiali Meta non permettono di leggere le stories degli account seguiti: l'utente ha scelto di leggere le stories dell'account professionale collegato e i post recenti degli account Business/Creator selezionati.

**Approach:** L'admin collega un account Instagram professionale con Facebook Login for Business (OAuth). Un job del cron giornaliero legge le stories (24h) dell'account e, tramite Business Discovery, i post recenti delle fonti scelte. Estrae gli eventi con la pipeline AI ed evidence-based di Telegram e pubblica automaticamente i soli eventi validi.

## Boundaries & Constraints

**Always:** Gestione riservata agli admin. Token cifrato lato server, mai presente in risposte, log, URL degli eventi o Sentry. Stato OAuth verificato contro CSRF. Fonti aggiunte con consenso esplicito alla ripubblicazione. Riutilizzare validazione delle evidenze, privacy/crop delle immagini, deduplicazione con lock per data, calendario transazionale e ricevute idempotenti. Pubblicare solo eventi con titolo, data completa e luogo citati dalla fonte. Supportare dry-run e un budget di tempo del job.

**Ask First:** Applicare la migrazione al database condiviso, impostare i segreti di produzione, inviare l'app Meta all'App Review, aggiungere servizi a pagamento.

**Never:** Usare scraping, password, cookie o sessioni personali. Promettere la lettura delle stories di terzi. Modificare la pubblicazione di stories esistente (`InstagramStorySettings`, `generate-instagram-story`). Sovrascrivere eventi già pubblicati. Pubblicare l'immagine originale quando il crop verificato non riesce.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Collegamento | OAuth completato con Page + IG Business | Token long-lived cifrato, username e scadenza salvati | State errato o nessun IG Business → errore, nessuna connessione |
| Stories proprie | Story IMAGE nelle 24h | Media analizzato una sola volta, eventi validi pubblicati | VIDEO senza thumbnail → scartato con conteggio |
| Post fonti | Business Discovery su username consentito | Post degli ultimi 7 giorni non ancora visti elaborati | Account personale/inesistente → errore sulla fonte, le altre proseguono |
| Ripetizione | Media già elaborato o evento duplicato | Nessun nuovo evento | Ricevuta per mediaId e fingerprint |
| Token scaduto | Graph error 190 | Connessione `expired`, job fermo, UI chiede di ricollegare | Nessun retry in loop |
| Dry-run | `?dryRun=1` | Conteggi `wouldPublish` | Nessuna scrittura su eventi, ricevute o calendario |
| Disconnessione | Azione admin | Token e fonti eliminati, scansioni ferme | Ricevute conservate per evitare ripubblicazioni |

</frozen-after-approval>

## Code Map

- `lib/telegram-event-scanning.ts` -- `telegramCandidates`, `telegramFingerprint`, estrazione AI e pubblicazione transazionale da estrarre come helper condivisi.
- `lib/instagram-story-settings.ts` -- cifratura AES-GCM esistente (modello per la chiave, da non modificare).
- `app/api/cron/daily/route.ts` -- fan-out `DAILY_CRON_JOBS` (18:00 UTC).
- `app/cron/TelegramAdmin.tsx`, `app/cron/page.tsx` -- UI admin di riferimento.
- `app/lib/auth-helpers.ts` -- `withAdminAuth`; `lib/event-duplicates.ts`, `app/lib/google-calendar.ts`, `lib/poster-crop.ts`, `lib/event-cover.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/social-event-extraction.ts`, `lib/telegram-event-scanning.ts` -- spostare validazione candidati, fingerprint, estrazione AI (testo + immagine) e pubblicazione transazionale in helper condivisi, con il tipo di ricevuta parametrizzato; Telegram resta invariato nel comportamento.
- [x] `prisma/schema.prisma`, `prisma/migrations/<ts>_add_instagram_scanning/migration.sql` -- `InstagramScanConnection` (userId unico, igUserId, username, token cifrato, scadenza, status, lastError, lastRunAt e conteggi), `InstagramScanSource` (username, attiva, consentedAt, lastError), `InstagramScanItem` (connectionId+mediaId unico, kind, status, conteggi), `InstagramPublication` (fingerprint PK, eventId SetNull). Migrazione solo preparata.
- [x] `lib/instagram-scan-connection.ts` -- client Graph con timeout e errori sanificati, cifratura del token, URL OAuth, scambio code → long-lived token, ricerca di Page/IG Business, lettura delle stories e di Business Discovery, download dei media limitato a 4MB su host CDN Meta.
- [x] `app/api/admin/instagram-scan/route.ts`, `.../oauth/start/route.ts`, `.../oauth/callback/route.ts` -- stato (GET), gestione fonti e disconnessione (POST con CSRF same-origin), avvio OAuth e callback con cookie di stato httpOnly.
- [x] `lib/instagram-event-scanning.ts`, `app/api/cron/scan-instagram/route.ts`, `app/api/cron/daily/route.ts`, `vercel.json` -- job con autenticazione cron, dry-run, budget di 260s, massimo 12 media per esecuzione; aggiunto a `DAILY_CRON_JOBS` con maxDuration 300.
- [x] `app/cron/InstagramScanAdmin.tsx`, `app/cron/page.tsx` (o `CronAdminClient.tsx`) -- pulsante di collegamento, account e scadenza, fonti con consenso, attivazione/rimozione, ultimi conteggi ed errori, disconnessione; stile coerente con `TelegramAdmin`.
- [x] `lib/instagram-event-scanning.test.mjs` -- matrice I/O con Graph, AI e prisma simulati; regressione Telegram verde.
- [x] `docs/API_REFERENCE.md`, `docs/DEPLOY_RUNBOOK.md`, `{output_folder}/implementation-artifacts/deferred-work.md` -- setup dell'app Meta (redirect URI, permessi `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management`, App Review), env `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` e `INSTAGRAM_SCAN_ENCRYPTION_KEY`, limiti; aggiornare la voce Instagram.

**Acceptance Criteria:**
- Given un non admin, when chiama le API instagram-scan, then riceve 401/403 senza dati sensibili.
- Given connessione attiva e fonti consentite, when gira il cron giornaliero, then gli eventi validi sono creati una sola volta con link alla fonte (permalink del post o profilo per le stories).
- Given una fonte disattivata o senza consenso, when gira il job, then non viene interrogata.
- Given che il job Instagram fallisce, when gira il cron giornaliero, then gli altri job proseguono e il risultato è `partial-error`.

## Design Notes

Business Discovery funziona solo con token di Facebook Login (graph.facebook.com), non con Instagram Login: per questo serve la Page collegata. Il token long-lived dura circa 60 giorni e non si rinnova senza interazione, quindi la UI mostra la scadenza. Le stories non hanno didascalia nell'API, quindi si estrae dall'immagine; per i VIDEO si usa `thumbnail_url` se presente.

## Verification

**Commands:**
- `node --experimental-strip-types --test lib/instagram-event-scanning.test.mjs lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs lib/daily-cron.test.mjs` -- tutti verdi.
- `npx prisma validate` e `npx tsc --noEmit --incremental false` -- nessun errore.
- `npx eslint <file modificati>` -- nessun nuovo errore.

**Manual checks (if no CLI):**
- `/cron` desktop e mobile: stati non collegato, collegato, scaduto; nessun token nel DOM o nelle risposte di rete.

## Suggested Review Order

**Job giornaliero e retry**

- Punto d'ingresso: stories proprie e post Business Discovery, al massimo 12 media per run.
  [`instagram-event-scanning.ts:64`](../../lib/instagram-event-scanning.ts#L64)
- Rivendicazione CAS dei media in retry o bloccati in `processing`; tetto di 3 tentativi.
  [`instagram-event-scanning.ts:88`](../../lib/instagram-event-scanning.ts#L88)
- Codici terminali distinti dagli errori transitori.
  [`instagram-event-scanning.ts:18`](../../lib/instagram-event-scanning.ts#L18)
- Pubblicazione transazionale con ricontrollo di connessione e consenso.
  [`instagram-event-scanning.ts:40`](../../lib/instagram-event-scanning.ts#L40)

**Pipeline condivisa con Telegram**

- Validazione delle evidenze ed estrazione AI spostate da Telegram senza cambiarne il comportamento.
  [`social-event-extraction.ts:27`](../../lib/social-event-extraction.ts#L27)
- Lock per data, deduplicazione, calendario e ricevuta nella stessa transazione.
  [`social-event-extraction.ts:122`](../../lib/social-event-extraction.ts#L122)

**Connessione Meta e sicurezza**

- OAuth via POST: secret e codici mai negli URL.
  [`instagram-scan-connection.ts:145`](../../lib/instagram-scan-connection.ts#L145)
- Scambio del token long-lived e scelta dell'account IG Business.
  [`instagram-scan-connection.ts:167`](../../lib/instagram-scan-connection.ts#L167)
- Immagine dei caroselli: mai l'mp4 di fallback dell'album.
  [`instagram-scan-connection.ts:203`](../../lib/instagram-scan-connection.ts#L203)
- Download dei media limitato agli host CDN Meta e a 4MB.
  [`instagram-scan-connection.ts:257`](../../lib/instagram-scan-connection.ts#L257)
- Redazione di token e parametri OAuth in ogni stringa inviata a Sentry.
  [`instagram-scan-connection.ts:275`](../../lib/instagram-scan-connection.ts#L275)
- Callback OAuth: verifica di state, cookie e sessione admin.
  [`callback/route.ts:22`](../../app/api/admin/instagram-scan/oauth/callback/route.ts#L22)
- Gestione fonti protetta da CSRF e limitata al proprietario.
  [`instagram-scan-store.ts:63`](../../lib/instagram-scan-store.ts#L63)

**Cron, UI e schema**

- Route cron con autenticazione bearer, dry-run e budget di 260s.
  [`scan-instagram/route.ts:20`](../../app/api/cron/scan-instagram/route.ts#L20)
- Job aggiunto al fan-out del cron giornaliero.
  [`daily/route.ts:13`](../../app/api/cron/daily/route.ts#L13)
- UI admin: collegamento, scadenza del token, fonti con consenso.
  [`InstagramScanAdmin.tsx:55`](../../app/cron/InstagramScanAdmin.tsx#L55)
- Nuovi modelli; migrazione preparata ma non applicata.
  [`schema.prisma:189`](../../prisma/schema.prisma#L189)

**Test**

- Matrice I/O con Graph, AI e prisma simulati, inclusi retry e caroselli.
  [`instagram-event-scanning.test.mjs:38`](../../lib/instagram-event-scanning.test.mjs#L38)
