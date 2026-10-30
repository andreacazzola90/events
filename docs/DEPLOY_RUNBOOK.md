# EventScanner - Deploy and Ops Runbook

Last update: 2026-05-27

## 1) Scope

This runbook covers deployment and operations for the Next.js application on Vercel, including DB migrations, secrets, cron jobs, and incident handling basics.

### Telegram Setup And Safety (2026-10-29)

This integration is implemented and mock-tested, not activated or live-certified. No real bot registration, Telegram credential call, test-event publication, remote Git operation, deployment or database migration was performed for this change.

Manual prerequisites, in order:

1. Review [the prepared SQL](../prisma/migrations/20261029130000_add_telegram_scanning/migration.sql). It adds owner-bound connections, source revisions/`removedAt`, versioned message jobs and unique publication receipts. Receipt message/event foreign keys are nullable `ON DELETE SET NULL`, preserving opaque dedup tombstones when sensitive history or events are deleted. Applying this migration requires separate authorization through the deployment process. If an earlier draft was already applied elsewhere, inspect that database and prepare an authorized additive migration rather than rerunning CREATE TABLE statements. `prisma validate` and `prisma generate` do not apply SQL. Do not run `migrate dev` against a shared/production database. Until applied, Telegram APIs return a sanitized storage error and the existing web cron can still proceed with a partial-error Telegram result.
2. Configure server-only `TELEGRAM_ENCRYPTION_KEY`: exactly 64 hexadecimal characters (32 random bytes), stored in the platform secret manager. No default, derivation from public configuration or client exposure. Keep a secure backup. Replacing the key without re-encryption makes existing tokens unreadable; disconnect/reconnect affected bots through an authorized maintenance procedure. Never paste keys or tokens into chat, source code, task output or shell command arguments retained in history.
3. Configure `TELEGRAM_WEBHOOK_BASE_URL` as a stable public HTTPS origin, with no path/query/fragment/userinfo. The app builds `/api/telegram/webhook?connection=...` from this trusted environment value, never from request `Origin`/`Host`. Use a valid public certificate, no redirects and preferably port 443. Ensure the route is reachable through deployment protection/firewalls and that `X-Telegram-Bot-Api-Secret-Token` reaches the application unchanged. Never disable verification to work around a proxy.
4. Configure `TELEGRAM_ADMIN_ORIGIN` to the browser application's exact origin, or use the existing server `NEXTAUTH_URL` fallback. Configure server-only `CRON_SECRET` for Vercel scheduled scraping: Vercel sends `Authorization: Bearer <CRON_SECRET>`. The scraper also accepts configured legacy `CRON_SECRET_KEY`; both missing/empty denies all requests. The admin manual scraper proxy prefers `CRON_SECRET`, falls back to `CRON_SECRET_KEY`, and refuses to call the scraper without either. Other cron endpoints still require their existing legacy key. No new scheduler is introduced; the existing daily cron handles Telegram publication.
5. Ensure the designated owner's persisted `User.role` or `User.type` is `admin`. The Telegram API intentionally does not grant administrator access via legacy email-prefix matching. No user/role was seeded or changed by this implementation.
6. Confirm the existing centralized cloud AI provider configuration and quota (`AI_VISION_EXTRACTION_PROVIDERS`/`AI_VISION_PROVIDERS` and the selected server provider keys). Verified cover cropping uses `AI_VISION_CROP_PROVIDERS`, default `groq,nvidia`. Do not enable a paid provider, add secrets or change quotas without approval. Authorized source text and original photos may be sent to these cloud services; consent to public republication is not an anonymity guarantee.
7. Obtain a bot token through the organization's authorized Telegram administrator. Enter it only in the protected Cron Admin password field. The app verifies `getMe` before official `setWebhook` registration. An unconfirmed registration is not active and requires remote cleanup before reconnect; its encrypted token is retained solely for that cleanup. This flow connects a bot, not the operator's personal Telegram account. Use a dedicated bot not shared with another webhook consumer. `getUpdates` must not run while the webhook is active.
8. Add the bot to each channel/group with the necessary rights, obtain its exact negative numeric chat ID through an authorized Telegram admin, and confirm public-republication rights separately. In groups, the bot must be an administrator or officially report `can_read_all_group_messages=true`; limited privacy-mode membership is not supported. Protected-content chats, direct personal chats and forwarded messages are refused. Do not claim arbitrary public channels work without adding/verifying the bot. Source activation always invokes official `getMe`, `getChat` and `getChatMember`.

Operational limits and handling:

- At most 50 nonremoved sources per bot, including paused sources, and two messages per cron lot across active connections. Removal frees a slot without reconnect and has stable `removedAt` state independent of error text. Telegram receives an explicit parallel slot so slow web sources cannot consume its entire opportunity; web retains its oldest-first ordering, 120-second minimum and global 260-second cooperative budget. API/AI work reserves 17 seconds for transaction acquisition/commit and refuses publication without that reserve. This is intentionally bounded throughput, not a bulk-history importer. Busy sources may leave backlog; monitor `deferred` and retention rather than promising every post will be published.
- Lease: 60 seconds; maximum three attempts with exponential retry delay. Cursor is persisted per source. A crashed worker's job becomes retryable when its lease expires; edits invalidate the old version/lease, including newer video-without-caption, protected or forwarded content. Published events are never rewritten. Publication and destructive error handling compare source identity/revision, consent, connection generation and job version/lease. Remote bot membership/privacy is rechecked both before extraction and before publication. Already-running external requests cannot be recalled by disconnection, but their results cannot pass the final local publication guard.
- Text/caption limit: 8,192 characters; webhook maximum: 64 KiB; photos maximum: 4 MiB and bounded pixels. Raw text/file IDs stop being eligible after 72 hours; deletion occurs at the next successful non-dry cron cleanup (so cleanup is delayed if cron is down). Completion, terminal failure, pause/revocation and disconnection erase pending raw payloads immediately. Retain only internal identities, counters, timestamps and dedupe receipts afterward. Audit database backups/observability retention separately.
- Required event title/date/location must have coherent source evidence, with an explicit date year, including `DD-MM-YYYY`. Normalized title/location need at least two characters. Relative dates, omitted years, ambiguous mixed-event paragraphs, unsupported time/fields, expired dates and private invitations are discarded instead of guessed. Cancellation is scoped to its evidence paragraph unless an explicit all-events/whole-program notice applies. Web and Telegram recheck duplicate fields under the same ordered canonical-date advisory locks. Calendar deliveries, events and Telegram receipts commit atomically; web geocoding happens before the transaction, never while holding the lock.
- Original photos are never fallback covers. Safe crops may be saved as bounded JPEG data URLs (960x960, maximum 256 KiB before base64), increasing database size but requiring no extra storage writes. Large/unverified crops and all covers for multi-event extractions are omitted; review `imageOmitted`. A bad photo/getFile 400 can still use a valid caption without a photo; without text only that job fails. HTTP 5xx/network/rate limits retry rather than suspending sources or deleting unrelated messages. Only current auth401 or source access/membership/privacy revocations trigger the matching generation's stop/purge. Only verified public channels get public t.me provenance. Private chat IDs/raw messages/file URLs are not put into public event fields.
- GET management responses are owner-scoped and credential-free. The token field is never saved in localStorage. Server errors are stable sanitized codes. Sentry hooks redact token-bearing Telegram URL segments, webhook secret headers and Telegram request bodies. Keep proxy/APM/access log capture of Bot API URLs, webhook headers and management POST bodies disabled or equivalently redacted; never log raw provider exceptions or unredacted traces while diagnosing this feature.
- Pause/revoke immediately clears pending payloads, increments the source revision, and resuming requires renewed consent/verification. Old saves/errors cannot override a newer authorization. `remove-source` retains an internal identity for sequencing while hiding the source and freeing its slot. Opaque fingerprint receipts survive deletion of connection/source/message history and event deletion, including reconnect with a different bot.
- Disconnection persists `disconnecting` and clears webhook authentication/consent/pending payloads before remote `deleteWebhook`, without keeping a database transaction open over network. Connecting/overlapping disconnects are blocked while a remote operation is in flight. Confirmed deletion becomes `disconnected` and erases the encrypted token. Failure/timeout becomes `disconnect_unknown`, keeps the encrypted token solely for retry, and returns `remoteRemoved=false`; use **Disconnetti** again, not reconnect. The UI refreshes lifecycle after errors and disables reconnect until confirmed cleanup. A process interrupted before finalization can remain `connecting`/`disconnecting`: investigate the outstanding operation through an authorized maintenance workflow; do not force `active` or reconnect while an old remote request may still complete. Revoked tokens automatically disable the connection and clear credentials; disconnect before reconnecting.
- A dedicated live verification remains blocked until bot, authorized source, migration, server encryption key and reachable HTTPS are configured. Do not test by publishing sample events. An operator-approved dry-run may perform real provider calls, but does not publish or advance the Telegram queue. Inspect the dry-run summary; local mock tests do not establish live membership, quota, webhook reachability or database locking behavior on the deployed PostgreSQL instance.

Focused local checks (all providers simulated; no database mutations):

```bash
node --experimental-strip-types --test lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs lib/google-calendar.test.mjs lib/event-media.test.mjs lib/event-scan-agents.test.mjs
DOTENV_CONFIG_PATH=/dev/null DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture npx prisma validate
DOTENV_CONFIG_PATH=/dev/null DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:5432/fixture npx prisma generate
npx tsc --noEmit --incremental false
npx eslint lib/telegram-connection.ts lib/telegram-store.ts lib/telegram-event-scanning.ts lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs app/api/admin/telegram/route.ts app/api/telegram/webhook/route.ts app/api/cron/scrape-visitpedemontana/route.ts app/api/admin/run-cron/instagram-story/route.ts app/cron/TelegramAdmin.tsx app/cron/CronAdminClient.tsx app/lib/google-calendar.ts lib/event-duplicates.ts lib/vision-ai.ts sentry.server.config.ts cypress/e2e/telegram-connections.cy.ts
npx cypress run --spec cypress/e2e/telegram-connections.cy.ts --config trashAssetsBeforeRuns=false
```

Cypress mounts the real component in an isolated HTML document using the app stylesheet and simulated management responses; only anonymous rejection checks reach real routes. It creates no users, bots or events. Keep `trashAssetsBeforeRuns=false` so existing repository screenshots are not deleted. The existing local server at `http://localhost:3000` can be reused. The official Figma skill index was consulted during final review; no Figma file/project or other remote design resource was requested or created. Styling remains the existing Cron Admin styling.

Review patch verification: 216 Node tests passed across Telegram/cron, Google Calendar, ICS/view, media, cover/network/image and scan agents; Prisma validate/generate, scoped ESLint and TypeScript passed; Cypress 9/9 including lifecycle timeout/retry and desktop/mobile. The review run used `--config-file /tmp/events-telegram-review.cypress.config.cjs` with a minimal config that imports neither dotenv nor DB tasks, and `trashAssetsBeforeRuns=false`; the normal config above loads local environment configuration. Snapshot transaction mocks exercise injected failure before calendar/receipt creation and restore all rows, with serialized CAS sequencing and a unique fingerprint check. Prepared SQL and transaction-client use were inspected, but no real PostgreSQL locks, contention or rollback were exercised. Mock tests do not certify live Telegram/AI behavior. See the [review patch handoff](../{output_folder}/implementation-artifacts/spec-admin-social-event-scanning.md#review-patch-handoff-2026-10-29).

Official sources: [Bot API](https://core.telegram.org/bots/api), [setWebhook](https://core.telegram.org/bots/api/methods/setwebhook), [getMe](https://core.telegram.org/bots/api/methods/getme), [getChatMember](https://core.telegram.org/bots/api/methods/getchatmember), [getFile](https://core.telegram.org/bots/api/methods/getfile), [privacy and delivery FAQ](https://core.telegram.org/bots/faq), verified 2026-10-29. No promises of account-level access, past history, stories, Facebook, Instagram or WhatsApp are made.

### Scansione Instagram: configurazione e limiti (2026-10-30)

Integrazione implementata e testata con mock, non attivata ne certificata live. Le stories di account di terzi non sono disponibili tramite API ufficiali Meta: si scansionano solo le stories dell'account collegato e i post pubblici di account professionali tramite Business Discovery.

Prerequisiti manuali:

1. Rivedere e applicare [la migrazione preparata](../prisma/migrations/20261030170000_add_instagram_scanning/migration.sql) (`InstagramScanConnection`, `InstagramScanSource`, `InstagramScanItem`, `InstagramPublication`). Non e applicata a nessun database.
2. Creare un'app Meta (tipo Business) con prodotto Facebook Login for Business. Redirect URI OAuth valido: `<origine>/api/admin/instagram-scan/oauth/callback`, dove l'origine e `INSTAGRAM_SCAN_REDIRECT_ORIGIN` oppure `NEXTAUTH_URL` (HTTPS; HTTP solo per localhost). L'header Host non viene mai usato.
3. Permessi: `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management`. Per Business Discovery su account non gestiti servono App Review e accesso avanzato (Advanced Access) di `instagram_basic`/`pages_read_engagement`; fino ad allora funziona solo con utenti con ruolo nell'app.
4. L'account Instagram dell'admin deve essere professionale (Business/Creator) e collegato a una Pagina Facebook gestita.
5. Variabili d'ambiente server-only: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_SCAN_ENCRYPTION_KEY` (esattamente 64 caratteri esadecimali, es. `openssl rand -hex 32`; nessun default, fail closed). Opzionali: `INSTAGRAM_SCAN_REDIRECT_ORIGIN`, `INSTAGRAM_GRAPH_API_VERSION` (default `v22.0`). Servono anche `CRON_SECRET` (o `CRON_SECRET_KEY`) e la configurazione AI esistente.
6. Da `/cron` (sessione admin) premere "Collega Instagram", poi aggiungere le fonti indicando username e consenso esplicito.

Limiti e comportamento:

- Token long-lived ~60 giorni, senza refresh automatico: alla scadenza (o errore Graph 190) la connessione passa a `expired` e serve ricollegarla. La UI segnala la scadenza imminente.
- Max 12 media per esecuzione, max 20 fonti, post degli ultimi 7 giorni (10 piu recenti per fonte), stories delle ultime 24 h, media max 4 MiB solo da host `*.cdninstagram.com`/`*.fbcdn.net`, budget 260 s.
- Ogni media e registrato una sola volta (`connectionId + mediaId`); i fallimenti transitori sono ritentati nei run successivi fino a 3 tentativi, poi chiusi come `failed`. Caroselli di soli video senza thumbnail sono scartati. Stories oltre il limite possono scadere prima dell'esecuzione successiva.
- Pubblicazione solo di eventi con evidenza coerente (stessa validazione di Telegram), deduplica con ricevute e `findDuplicateEvent`; copertina solo da crop verificato e solo per post con un singolo evento.
- Lo scambio OAuth invia `client_secret` in query verso Graph (come documentato da Meta); Sentry redige token e segreti. `lastError` contiene solo codici stabili.
- Gli errori di una fonte rendono `partial-error` il risultato del cron giornaliero.

Verifica locale (provider simulati):

```bash
node --experimental-strip-types --test lib/instagram-event-scanning.test.mjs lib/telegram-event-scanning.test.mjs lib/cron-execution.test.mjs lib/daily-cron.test.mjs
curl "https://<dominio>/api/cron/scan-instagram?dryRun=1" -H "Authorization: Bearer <CRON_SECRET>"
```

## 2) Environments

Define at least:
- local
- preview (Vercel preview)
- production

Keep environment-specific values in platform secrets, never in repository files.

## 3) Required secrets

From [.env.example](../.env.example) and runtime code:
- DATABASE_URL
- NEXTAUTH_SECRET_KEY
- NEXTAUTH_URL
- GROQ_API_SECRET_KEY
- NVIDIA_API_SECRET_KEY (recommended; first vision provider in the default order)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_SECRET_KEY
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- CRON_SECRET (Vercel scheduled scraper; manual proxy prefers it)
- CRON_SECRET_KEY (legacy scraper fallback and existing other cron targets)

Web search (event verification and cover images), first configured provider wins:
- BRAVE_SEARCH_API_KEY (recommended; free plan at https://brave.com/search/api/)
- TAVILY_API_KEY (optional)
- GOOGLE_API_SECRET_KEY + GOOGLE_CX (optional; the key must allow the Custom Search API, which is closed to new customers)

Scan learning (corrections and manual crops) needs the migration [20261030160000_add_scan_learning](../prisma/migrations/20261030160000_add_scan_learning/migration.sql). SCAN_LEARNING_SECRET_KEY is optional and falls back to NEXTAUTH_SECRET_KEY.

Instagram story publishing is configured from the admin "Story Instagram" tab (account ID, access token, days and hour). It needs:
- INSTAGRAM_TOKEN_SECRET_KEY (optional; falls back to NEXTAUTH_SECRET_KEY) to encrypt the stored token
- the migration [20261030140000_add_instagram_story_settings](../prisma/migrations/20261030140000_add_instagram_story_settings/migration.sql) applied
- STORY_BUCKET (optional)

Legacy env fallback, used only when the tab has no value:
- INSTAGRAM_IG_USER_ID
- INSTAGRAM_ACCESS_TOKEN_SECRET_KEY
- INSTAGRAM_GRAPH_API_VERSION (optional, default in code)
- INSTAGRAM_AUTO_PUBLISH_STORY (used only before the settings are saved)

## 4) Pre-deploy checklist

1. Verify Prisma schema changes and migration status.
2. Run lint and tests where applicable.
3. Validate API changes against [API_REFERENCE.md](./API_REFERENCE.md).
4. Confirm all required environment variables exist in target environment.
5. If cron/auth changes were made, validate scheduled scraping with CRON_SECRET and legacy fallback with CRON_SECRET_KEY using mocks; authorize any live calls separately.

## 5) Build and deploy

## 5.1 Local sanity

```bash
npm run lint
npm run build
```

## 5.2 Prisma migration flow

For production-safe changes, create and apply migrations via standard Prisma workflow before/with deployment.

Typical commands:

```bash
npx prisma migrate dev
npx prisma generate
```

For CI/production migration execution, use your established deployment pipeline policy.

The event media feature adds `20261012160000_add_event_media`; apply it before deploying the editor/API changes. Event files use the existing public Supabase `events` bucket. Cover and each attachment are uploaded separately to stay within serverless request limits.

## 5.3 Vercel deploy

- Push to main for production deployment.
- Use preview deployments for validation before merge.
- Confirm final deployment health by hitting core pages and APIs.

## 5.4 Build identity and timestamp

- The footer and `/versioni` share the current build identity: the unchanged package version plus the first seven commit characters, for example `0.3.4+abcdef1`. Release-history version numbers remain unchanged.
- During `phase-production-build`, the config injects `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_APP_COMMIT_SHA` and `NEXT_PUBLIC_APP_BUILT_AT` as compile-time literals. Do not configure these generated values manually in platform environment settings.
- A valid `VERCEL_GIT_COMMIT_SHA` takes precedence. Otherwise, a local `git rev-parse HEAD` runs with a one-second timeout and no shell. Missing Git or invalid output leaves the base version without a commit suffix; it does not fail the build.
- `NEXT_PUBLIC_APP_BUILT_AT` is generated once as an ISO UTC timestamp during the production build. The server formats its label in `Europe/Rome`, including daylight-saving changes and a timezone indicator, and passes that stable label to the footer. The client does not reformat the timestamp.
- The label **Build del deploy** identifies build time, not the exact Vercel READY/deployment-completion time. Reopening a page or restarting the same compiled artifact does not update it. Rebuilding the same commit creates a new build timestamp, while its version identity stays the same.
- Development shows the package version plus the available commit suffix and **Sviluppo locale**, with no deploy date. Production artifacts without a valid build timestamp show **Data build non disponibile**. Production startup neither generates a date nor reinjects metadata over the compiled literals.
- After deployment, compare footer and `/versioni`: version, timestamp and timezone must match. The semantic `<time datetime>` value is UTC; the visible label is Italian local time.

Focused checks, without a full Next build:

```bash
node --experimental-strip-types --test lib/build-info.test.mjs
npx tsc --noEmit --incremental false
npx eslint next.config.ts app/layout.tsx app/components/Footer.tsx app/versioni/page.tsx lib/build-info.test.mjs
```

## 6) Post-deploy validation

### Public Search, Social Sharing And AI Discovery

1. Set `NEXT_PUBLIC_SITE_URL` to the definitive public HTTPS origin in Vercel Production, for example `https://your-public-domain.example`, then rebuild. Without this setting, the existing `https://events-scanner.vercel.app` origin is preserved. Do not select a different deployment hostname for every build. Confirm the real domain before changing it; configure redirects from aliases in Vercel separately.
2. Verify `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/opengraph-image` on that public domain. The fallback social image is PNG, 1200x630. Sitemap contains canonical public pages, events and published series only; private account/admin/auth/edit/creation routes and operational APIs are not search content. HTML pages with `noindex` remain crawlable so already-discovered URLs can receive that directive; operational APIs are disallowed. Robots rules do not replace authentication. Missing URLs return HTTP 404 and explicit Google `noindex`.
3. Check one existing event and an old title/slug pointing to its ID. The canonical should match the sitemap; stale slugs redirect permanently. The event page must return its text, canonical, Open Graph/Twitter tags, `Event` and breadcrumbs in initial HTML without JavaScript. Home, list, calendar and map also provide initial public event links; interactive controls still require JavaScript.
4. Verify the canonical property in Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`, and inspect representative event URLs. Existing Google verification can use `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`; do not share credentials in chat. No account connection or sitemap submission is performed by this code change.
5. Test published event URLs with [Google Rich Results Test](https://search.google.com/test/rich-results), [Schema Markup Validator](https://validator.schema.org/), [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/). Check both events with their own image and those using the fallback. Platform caches may require a new scrape.
6. Dates use actual event data and `Europe/Rome` offsets; missing or ambiguous times stay date-only. `location.address` reuses the stored location text and `eventStatus` is always `EventScheduled` (Google's default). Unknown prices, ticket URLs, organizer URLs, performers, end dates and availability are not invented, so Search Console may still show them as optional "improve appearance" warnings. Events lacking precise physical addresses or other Google requirements may not qualify for event rich results even when the Schema.org markup is syntactically valid. Complete and maintain the source records rather than manufacturing markup values.
7. Vercel Preview/development deployments emit `noindex` and disallow crawling; they must not replace the canonical production origin. Check Vercel deployment protection, firewall/CDN and bot rules on Production: allow Googlebot/Bingbot and search crawlers such as OAI-SearchBot and PerplexityBot without bypassing private authentication. Verify published IP ranges when making firewall changes; user-agent text alone is not proof of identity.
8. `llms.txt` is a supplementary public index, not an accepted ranking requirement or an indexing guarantee. Search crawling and AI-model training are separate policies; explicit search-agent rules retain the site's existing wildcard crawling policy. Neither rich results, SERP positions nor chatbot citations can be guaranteed. Monitor crawl errors, duplicates, indexed URLs and real traffic after deployment.

The current single sitemap is capped at 50,000 URLs and logs a sanitized warning when older records exceed that limit. Split it into sitemap shards before approaching that size. Static URLs do not advertise a new modification timestamp on every request; records use their actual `updatedAt`.

Server-rendered list previews normalize supported stored date formats in memory and display at most 200 events from a bounded read of 2,000 candidate records. The sitemap, rather than one calendar view, is the complete discovery mechanism up to its stated limit. A failed server read is distinct from a genuinely empty result; client refreshes retain previously loaded data on failure. Initial day values are passed from server to browser to avoid hydration changes across Rome midnight.

References: [Google event structured data](https://developers.google.com/search/docs/appearance/structured-data/event), [Google AI search guidance](https://developers.google.com/search/docs/appearance/ai-features), [OpenAI crawler controls](https://developers.openai.com/api/docs/bots).

Run smoke checks:

1. Web pages:
- /
- /eventi
- /tutti-gli-eventi
- /crea

2. APIs:
- GET /api/events
- POST /api/process-link (with a known URL)
- POST /api/process-image (with a sample flyer)

3. Auth:
- register/signin flow
- favorites add/remove for authenticated user

4. Caching:
- create event via /api/events
- verify list/detail updates after revalidation

## 7) Cron operations

Daily scraping requires `Authorization: Bearer <CRON_SECRET>` for Vercel scheduling, or configured legacy `CRON_SECRET_KEY`. Both absent/empty fails closed. The admin scraper proxy prefers CRON_SECRET then KEY. Other cron endpoints retain `Authorization: Bearer <CRON_SECRET_KEY>`.

Vercel Hobby only allows daily cron jobs, so [vercel.json](../vercel.json) defines a single cron, `GET /api/cron/daily` at 18:00 UTC (Vercel may start it any time within that hour). It calls all jobs below in parallel with the same bearer token. The Instagram story cron, the Google Calendar sync and the dispatcher accept `CRON_SECRET` (sent by Vercel) or legacy `CRON_SECRET_KEY`. The story only generates/publishes on the weekdays set in the admin tab (Europe/Rome, default Wednesday), once per day. Configure at least one of these server-side secrets.

Endpoints:
- GET /api/cron/daily (Vercel scheduled entry point)
- GET /api/cron/sync-google-calendar
- GET /api/cron/scrape-visitpedemontana
- GET /api/cron/generate-instagram-story
- GET /api/cron/scan-instagram (`?dryRun=1` per simulazione)
- POST /api/admin/run-cron/instagram-story (admin session required)

Manual trigger example:

```bash
curl -X GET "https://<your-domain>/api/cron/scrape-visitpedemontana" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Admin trigger example (target override):

```bash
curl -X POST "https://<your-domain>/api/admin/run-cron/instagram-story" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  -d '{"target":"visitpedemontana"}'
```

## 8) Observability and logging

Primary sources:
- Vercel runtime logs
- API route console logs
- Sentry (if configured via sentry.* config files)

Focus logs for:
- OCR extraction failures
- scraping navigation timeouts
- image upload failures
- Prisma write errors

## 9) Incident playbook (short)

## 9.1 OCR failures spike

1. Validate GROQ_API_SECRET_KEY and OCR provider availability.
2. Test POST /api/process-image with a known good image.
3. Inspect logs for extraction branch used and fallback path.
4. Flyer cropping defaults to NVIDIA Vision followed by Groq. Gemini and OpenRouter are excluded from the default order after returning HTTP 429 in the latest live check; they can be explicitly re-enabled with `AI_VISION_PROVIDERS` after verifying their quota. Service failures and truncated output can fall through, but completed privacy rejections cannot. Partial output is never accepted. If no provider completes or bounds are uncertain, the API does not approve an unverified screenshot. Verify with a synthetic screenshot containing social UI and confirm that the crop excludes it while preserving the full flyer.

## 9.2 Scraper failures

1. Trigger scrape endpoint manually with CRON auth.
2. Review navigation timeout and parsing logs.
3. Verify target site structure changes.

## 9.3 DB/API errors

1. Check Prisma connectivity and DATABASE_URL.
2. Confirm migration compatibility with deployed code.
3. Roll forward with fix if schema/code mismatch found.

## 9.4 Rollback strategy

- Prefer fast roll-forward when possible.
- If severe regression, redeploy previous stable commit and re-run smoke tests.

## 10) Ownership and change control

When introducing new endpoints/jobs:
1. update [API_REFERENCE.md](./API_REFERENCE.md)
2. update [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
3. add or revise runbook steps in this file

## 11) Google Calendar synchronization

Calendar preferences require an authenticated EventScanner account. Users connect a Google account from `/account`; the verified Google email becomes the calendar identity. The field “Tipo di evento Google Calendar” lists owned Google calendars by name and color. Selecting one sets the destination calendar for future event sync. The former manual ICS email button is no longer available.

### Configuration

1. Enable the Google Calendar API in Google Cloud.
2. Create a Web application OAuth client and configure the consent screen. Add test users while the app is in testing; Google may require verification before public use of calendar scopes. Testing-mode refresh tokens can expire after seven days.
3. Register the exact authorized redirect URI: `http://localhost:3000/api/account/google-calendar/callback` locally, and `https://schiodejaneiro.vercel.app/api/account/google-calendar/callback` in production. Register any additional custom or preview domain separately. The OAuth callback and final account redirect use the request origin, not `NEXTAUTH_URL`; Google requires an exact match for each authorized redirect URI (no wildcards).
4. Configure server-only secrets: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET_KEY`, `NEXTAUTH_SECRET_KEY`, `NEXTAUTH_URL`, and `CRON_SECRET_KEY`. `NEXTAUTH_URL` must be the stable canonical application origin.
5. Optionally set `GOOGLE_CALENDAR_TOKEN_SECRET_KEY` to a dedicated high-entropy encryption secret. Otherwise refresh-token encryption uses `NEXTAUTH_SECRET_KEY`. Rotating the encryption secret requires users to reconnect Google.
6. Apply `20261012120000_add_google_calendar_sync`, `20261012130000_add_google_calendar_event_type`, and `20261012140000_add_google_calendar_target` before deploying the code, regenerate Prisma, and restart local development after generation. The earlier `calendarCategories` column remains ignored for migration-history compatibility; it is not used by the application. Migration commands must use a non-pooled connection, such as `POSTGRES_URL_NON_POOLING`; runtime Prisma prefers `POSTGRES_PRISMA_URL`. Do not use `db push` as a substitute for these additive migrations. Repair incomplete older migration directories separately before using the full migration-deploy workflow.

The Google grant requests `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned`, and `https://www.googleapis.com/auth/calendar.calendarlist.readonly`. Reconnect an existing Google account once to grant calendar-list access. OAuth uses state, PKCE, a short-lived HttpOnly cookie, and verified email. Only an encrypted refresh token is persisted; tokens never appear in account API responses or application error logs.

### Delivery behavior

- New future events saved through the event API or either scraper are transactionally queued for connected users, independently of EventScanner categories. Each save/import schedules queue processing; the worker drains fresh batches within its time budget.
- The worker inserts events into the selected owned calendar using its Google calendar ID; existing connections default to `primary` until a calendar is selected. Past or invalid events are skipped; already published events are not backfilled on connection.
- Calendars are loaded from the Google Calendar API with pagination and restricted to calendars owned by the connected account, matching the existing `calendar.events.owned` scope. A deleted calendar fails visibly rather than silently falling back to `primary`.
- Supported native types are `default`, `birthday`, `focusTime`, `outOfOffice`, and `workingLocation`. Google does not allow API creation of `fromGmail`. Availability of status types depends on the user's Google account; unsupported types remain failed with an account-visible error, never silently converted to `default`.
- Timed events use `Europe/Rome` and a two-hour duration. Default and working-location events can be all-day. Focus-time and out-of-office events require a known time, mark the period busy, and do not auto-decline invitations. Working locations are public as required by Google. Birthdays are private, all-day, annually recurring, and exclude unsupported additional event properties.
- Database uniqueness and stable Google event IDs prevent duplicates during retries. Temporary errors use backoff and persistent pending records. Expired or revoked grants preserve pending deliveries until reconnection; explicit disconnection cancels them.
- The Profile selector displays each owned Google calendar's actual name and color. Selecting a different calendar affects future or undelivered events; already created events are not moved.
- Disconnecting Google cancels pending deliveries and removes stored credentials; already inserted Google events remain in the user's calendar. Remote revocation is attempted after disconnect.
- `GET /api/cron/sync-google-calendar` requires `Authorization: Bearer <CRON_SECRET or CRON_SECRET_KEY>` and refuses to run if the secret is missing. Admins can also use same-origin `POST /api/cron/sync-google-calendar` with their session.
- The retry job runs once a day at 18:00 UTC through `GET /api/cron/daily`, preserving daily cron compatibility. For timely recovery and higher volume, schedule the protected endpoint every five minutes using a supported Vercel plan or an external scheduler. Each run is time-bounded; remaining deliveries stay queued.

### Verification

```bash
node --experimental-strip-types --test lib/calendar-ics.test.mjs lib/google-calendar.test.mjs lib/cron-execution.test.mjs
npx tsc --noEmit --incremental false
```

After credentials are configured, authorize a test Google account, publish a future event with a known time, and confirm it appears exactly once in that account's primary calendar with the selected native event type. Verify that EventScanner categories do not filter delivery, and check retry/disconnect behavior. Use an eligible Google account to verify special status types. Unit tests use mocked Google responses; a real consent/API test requires valid OAuth credentials.
