# EventScanner - API Reference (Initial)

Last update: 2026-05-27

This document is generated from current route handlers under [app/api](../app/api).

## Telegram Admin And Collection (2026-10-29)

Implementation: [admin API](../app/api/admin/telegram/route.ts), [webhook](../app/api/telegram/webhook/route.ts), [connection security](../lib/telegram-connection.ts), [store](../lib/telegram-store.ts), [queue consumer](../lib/telegram-event-scanning.ts).

### GET /api/admin/telegram

Requires a NextAuth session and a database user with `role=admin` or `type=admin`. Email-prefix exceptions do not authorize this API. Every query is scoped to the authenticated owner. Returns `connected`, `status`, `botUsername`, sanitized `lastError`, the owner's sources and message/event counts. Never returns the connection ID, token, ciphertext, webhook secret/hash, raw messages or file IDs. Responses use `Cache-Control: no-store`; anonymous/nonadmin requests receive 401/403 before accessing Telegram data.

### POST /api/admin/telegram

Same authorization as GET. Requires `Origin` to match server-configured `TELEGRAM_ADMIN_ORIGIN` (or `NEXTAUTH_URL`), not a client-provided host or forwarded origin. JSON body maximum: 4 KiB.

| action | Required fields | Behavior |
| --- | --- | --- |
| `connect` | `token` | AES-256-GCM encryption with required server key; official `getMe`, then `setWebhook` to the trusted HTTPS origin. Only confirmed registration becomes active. One bot per owner and one owner per bot. Reconnect is blocked during remote operations and unconfirmed cleanup. |
| `save-source` | negative numeric `chatId` string, `consent: true` | Separate public-republication consent. Official `getMe`, `getChat`, `getChatMember` verify access. Activation compares the connection generation and source identity/revision captured before remote verification. At most 50 nonremoved sources, including paused sources. Transient errors preserve source/queue; current access revocation suspends the matching generation and clears pending payloads. |
| `pause-source` | owner's `sourceId` | Stops collection/publication, revokes consent and destroys pending raw text/file references. Resume requires explicit consent and verification again. |
| `remove-source` | owner's `sourceId` | Same stop/purge, removes display title/public username and sets stable `removedAt`. Hidden from the source list and excluded from the limit. A new source can be added without reconnect; reauthorizing a removed source still checks the limit. |
| `disconnect` | none | Stops local access, clears webhook authentication/consent/pending payloads and persists `disconnecting`, then calls `deleteWebhook` outside the transaction. Confirmed cleanup becomes `disconnected` and erases the encrypted token. Failure/timeout becomes `disconnect_unknown`, returns `remoteRemoved: false` and retains only the encrypted token needed to retry cleanup. Reconnect remains blocked. |

Lifecycle mutations are serialized locally before network work. `connecting`/`disconnecting` reject overlapping mutations with 409; `disconnect_unknown` permits retrying `disconnect`, not `connect`. An ambiguous `setWebhook` failure also requires confirmed cleanup before reconnect. Finalization uses connection identity/status CAS. Pause/removal/access revocation increment the source revision, so old saves and worker errors cannot reactivate or disable a reauthorized source or destroy its new queue. Publication and destructive worker handling also require the current job version, lease and connection generation.

Known errors are stable codes such as `telegram_key_not_configured`, `telegram_https_not_configured`, `telegram_webhook_failed`, `privacy_mode_limited`, `protected_content`, `bot_not_member`, `same_origin_required`. Provider response descriptions, fetch errors/causes and token-bearing URLs are not returned or logged by this feature. Management/API storage failures return a generic 503. The server Sentry hooks redact Bot API token URL segments, secret headers and Telegram request bodies; external infrastructure must also avoid recording these sensitive values.

### POST /api/telegram/webhook?connection=opaque-id

The opaque routing ID is not a credential. Authentication is the exact `X-Telegram-Bot-Api-Secret-Token` value configured through Telegram's `setWebhook.secret_token`; only its SHA-256 hash is stored. This is Telegram's official secret header, not an invented request-body HMAC signature.

Only `message`, `channel_post`, `edited_message`, `edited_channel_post` are requested. JSON payloads are streamed with a 64 KiB bound. Text plus caption is limited to 8,192 characters; at most ten photo sizes are inspected and only a file within 4 MiB is selected. Private user chats, forwarded/protected content, unsupported updates and nonallowed/inactive/unconsented sources do not enter the queue. A newer unsupported/protected/forwarded edit with valid message/chat identity invalidates any older unpublished version: payload cleared, version incremented and lease revoked, including while AI is in flight. No AI or file downloads run in the webhook. Success for an accepted message follows durable transaction completion; storage failures return 503 for Telegram retry. Duplicate/out-of-order updates and edits of published messages are acknowledged without rewriting published events.

Queue identity is `(sourceId, messageId)` plus the most recent `updateId` and a version counter. A source/connection transaction lock serializes ingestion, revocation and publication. Credentials are never placed in webhook URLs.

### Daily Cron Telegram Result

`GET /api/cron/scrape-visitpedemontana` accepts exact Bearer authorization against either configured `CRON_SECRET` or legacy `CRON_SECRET_KEY`. Both absent/empty always returns 401, including requests with a Vercel user-agent. Vercel scheduling uses `CRON_SECRET`; the protected manual proxy prefers it, falls back to `CRON_SECRET_KEY`, and returns 503 without calling the scraper if neither exists. Other cron targets retain their existing auth contracts. The scraper returns a separate `telegram` summary with `visited`, `published`, `duplicates`, `discarded`, `retried`, `failed`, `wouldPublish`, `deferred`, `imageOmitted`, `status`, `dryRun`. Telegram failures do not prevent web sources from running and do affect the aggregate partial/error status.

One bounded Telegram lot starts alongside web scraping, with a 90-second deadline and at most two messages, one per visited source, oldest-scan-first. Each message's API/AI phase is capped at 40 seconds and by remaining time minus a 17-second commit reserve (2-second transaction maxWait plus 15-second timeout). Transport calls are capped at 8 seconds. Publication is refused if the full commit reserve no longer fits after verification/AI. The overall 260-second cron budget reserves 15 seconds after web work; web sources retain their 120-second minimum and oldest-first rotation. A crashed lease expires after 60 seconds; three attempts maximum, exponential retry delay. Expired raw payloads become ineligible after 72 hours and are destroyed at the next non-dry cron cleanup. Completed/terminal messages are cleared immediately. Non-sensitive IDs, counts, timestamps and dedupe tombstones remain.

The consumer uses the existing centralized vision client for text/captions and poster transcription. It requires a literal coherent evidence paragraph for title, complete date (including explicit year), and location; title/location must retain at least two normalized characters. Date evidence includes `DD-MM-YYYY`; mixed dates remain conservatively rejected. Cancellation is checked in the candidate's paragraph, while explicit whole-program/all-events cancellation still rejects all candidates. Incomplete, unsupported, past or private-invitation results are discarded. Uncertain OCR/AI is not a guarantee of extraction accuracy. No public page scraping is used to retrieve bot-private content. Membership/privacy/protected-content are rechecked after AI, and current consent, source revision, connection, lease, version and expiry are checked again in the publication transaction.

Existing field deduplication and calendar creation accept the same transaction client. Events, dedupe receipts and calendar deliveries commit together. Both web and Telegram publication acquire the same sorted, canonical-date advisory locks and recheck duplicates inside the transaction immediately before creation. Web geocoding remains outside the lock. Unique fingerprints provide an additional receipt constraint. Deleting an event nulls its receipt's event ID; deleting connection/message history nulls its message ID, never the fingerprint. Tombstones therefore survive reconnect, bot changes and event deletion. Published messages are never auto-edited. Local tests exercise CAS sequencing, unique-insert checks and snapshot rollback; they do not prove PostgreSQL lock behavior.

Photos use official `getFile` and a bounded server-only download. No Telegram file URL is returned or stored. Only the existing verified poster crop may become a cover; rejection/failure yields no cover, never the full original photo. Approved covers are metadata-free JPEG data URLs, at most 960x960 and 256 KiB before base64, stored directly in `Event.imageUrl` without new storage infrastructure. Original private data may be transmitted to the configured cloud AI for extraction, not automatically anonymized. `Event.rawText` stays empty. Public `https://t.me/username/messageId` provenance is emitted only for currently verified public channels; private sources use `origin=telegram`, an opaque internal external ID and `sourceUrl=null`.

HTTP 5xx, network failures and rate limits are retryable, not source revocations. Auth 401 revokes only the still-current connection generation; source-verification 403/membership/privacy failures affect the still-current source. `getFile` 400/invalid photos do not suspend sources or clear other jobs: a caption can still be extracted without the photo; photo-only failure is scoped to that job. Covers are omitted for all events when an extraction yields multiple events, rather than reusing a crop verified only for its first candidate.

`dryRun=1` performs bounded provider verification/extraction and duplicate reads, but never leases/updates/cleans Telegram rows, advances its cursor, publishes events or creates calendar deliveries. Existing cron observability records may still change. No `getUpdates` runs alongside the webhook. Personal Telegram accounts, history, stories, Facebook, Instagram and WhatsApp are outside this integration.

Official references verified on 2026-10-29: [Bot API](https://core.telegram.org/bots/api), [getMe](https://core.telegram.org/bots/api/methods/getme), [getChatMember](https://core.telegram.org/bots/api/methods/getchatmember), [setWebhook](https://core.telegram.org/bots/api/methods/setwebhook), [getFile](https://core.telegram.org/bots/api/methods/getfile), [privacy FAQ](https://core.telegram.org/bots/faq). Telegram documents a 20 MB cloud download limit; this application deliberately uses the stricter 4 MiB limit.

## Scansione Instagram (2026-10-30)

Implementazione: [connessione Graph/OAuth](../lib/instagram-scan-connection.ts), [store admin](../lib/instagram-scan-store.ts), [job](../lib/instagram-event-scanning.ts), [estrazione condivisa](../lib/social-event-extraction.ts). Tutte le risposte sono prive di token; gli errori sono codici stabili sanificati.

### GET /api/admin/instagram-scan
- Sessione admin (ruolo/tipo `admin` persistito). Restituisce `{ configured, connected, status, username, tokenExpiresAt, tokenExpiresSoon, lastError, lastRunAt, lastRun: { visited, published, duplicates, discarded, failed }, sources: [...] }`. Mai il token.

### POST /api/admin/instagram-scan
- Sessione admin + controllo same-origin (`Origin` deve corrispondere all'origine configurata). Body JSON `{ action, ... }`:
  - `save-source` `{ username, consent: true }`: username `^[A-Za-z0-9._]{1,30}$` (la `@` iniziale viene rimossa); verifica via Business Discovery prima del salvataggio; consenso obbligatorio. Max 20 fonti.
  - `pause-source` / `remove-source` `{ id }`: limitati alle fonti della connessione dell'admin. La pausa azzera il consenso.
  - `disconnect`: elimina token e fonti; elementi elaborati e ricevute restano per la deduplica.

### GET /api/admin/instagram-scan/oauth/start
- Sessione admin. 503 se `META_APP_ID`/`META_APP_SECRET_KEY`/`INSTAGRAM_SCAN_ENCRYPTION_KEY` o l'origine non sono configurati. Imposta un cookie `state` httpOnly, SameSite=Lax (10 minuti) e reindirizza al dialog OAuth di Facebook Login con scope `instagram_basic,pages_show_list,pages_read_engagement,business_management`.

### GET /api/admin/instagram-scan/oauth/callback
- Sessione admin e `state` coincidente con il cookie (stesso utente). Scambia il codice in token long-lived (~60 giorni), individua il primo account Instagram professionale collegato a una Pagina, cifra il token (AES-256-GCM) e salva la connessione.
- Reindirizza sempre a `/cron?instagram=connected|state_invalid|denied|oauth_failed|no_business_account|not_configured`, senza segreti nell'URL.

### GET /api/cron/scan-instagram
- Auth: `Authorization: Bearer <CRON_SECRET|CRON_SECRET_KEY>`; 503 se nessun segreto configurato, 401 se errato. `maxDuration` 300 s, budget interno 260 s.
- `?dryRun=1`: nessuna scrittura (elementi, eventi, ricevute, calendario, stato connessione); restituisce `wouldPublish`.
- Risultato: `{ status: "success"|"partial"|"partial-error"|"dry-run"|"skipped", dryRun, reason?, connections, visited, published, duplicates, discarded, failed, wouldPublish, skipped, deferred, sourceErrors, expired, imageOmitted }`.
- Legge le stories proprie (ultime 24 h) e i post delle fonti attive con consenso via Business Discovery (ultimi 7 giorni), max 12 media per esecuzione; ogni media e registrato in `InstagramScanItem`: gli errori transitori (AI, download, budget esaurito, run interrotto da oltre 10 minuti) vengono ritentati fino a 3 tentativi totali, gli esiti deterministici (estrazione non valida, media rifiutato) sono definitivi. Un media viene avviato solo se restano almeno 77 s di budget. Lo scambio OAuth usa POST con body form, mai segreti nella query. Errore Graph 190 => connessione `expired`, job interrotto; errore su una fonte => solo quella fonte in errore.
- Eventi creati con `origin: "instagram"`, `sourceUrl` = permalink del post oppure `https://www.instagram.com/<username>/` per le stories.

## 1) Auth

### POST /api/auth/register
- File: [app/api/auth/register/route.ts](../app/api/auth/register/route.ts)
- Purpose: create a user account with email/password
- Input JSON:
  - email
  - password
- Responses:
  - 201: user id + email
  - 400: missing fields
  - 409: user already exists

Example request:

```bash
curl -X POST "http://localhost:3000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Secret123!"}'
```

Example 201 response:

```json
{
  "id": 42,
  "email": "user@example.com"
}
```

### POST /api/auth/extension-login
- File: [app/api/auth/extension-login/route.ts](../app/api/auth/extension-login/route.ts)
- Purpose: validate credentials for Chrome extension usage
- Input JSON:
  - email
  - password
- Responses:
  - 200: user id + email
  - 401: invalid credentials
  - 500: server error

Example request:

```bash
curl -X POST "http://localhost:3000/api/auth/extension-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Secret123!"}'
```

Example 200 response:

```json
{
  "user": {
    "id": 42,
    "email": "user@example.com"
  }
}
```

## 2) Events

### POST /api/events
- File: [app/api/events/route.ts](../app/api/events/route.ts)
- Purpose: create an event
- Supported content types:
  - application/json
  - multipart/form-data (eventData + image)
- Behavior:
  - optional external image ingestion to Supabase
  - duplicate check on (title, date, location)
  - geocode location (best effort)
  - cache/path revalidation
  - persists the cover selected in the draft, with no vision or automatic crop calls and no deferred cover replacement
  - upload/share clients run `POST /api/crop-image` alongside extraction; publishing waits for the crop result. A failed crop removes the automatic cover and opens a web-image selection, with manual cropping or publication without a cover as alternatives
  - JSON image URLs, PDF, link and manual-crop flows are unchanged. Page pre-warming runs after the response with bounded requests
  - draft clients omit temporary `originalImageUrl` from publication payloads. The events route persists an explicit allowlist and never uploads that field. Originals are still sent to cloud vision for analysis; AI checks and user-confirmed images do not guarantee anonymity
- Responses:
  - 201: created event (+ slug)
  - 409: EVENT_DUPLICATE
  - 400: unsupported content type

Example request (JSON):

```bash
curl -X POST "http://localhost:3000/api/events" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Concerto Jazz in Piazza",
    "description":"Serata jazz live con quartetto locale",
    "date":"2026-06-04",
    "time":"21:00",
    "location":"Piazza Rossi, Schio",
    "organizer":"Comune di Schio",
    "category":"musica",
    "price":"Gratuito",
    "rawText":"Locandina acquisita da flyer"
  }'
```

Example 201 response (shape):

```json
{
  "id": 120,
  "title": "Concerto Jazz in Piazza",
  "date": "2026-06-04",
  "location": "Piazza Rossi, Schio",
  "slug": "concerto-jazz-in-piazza-120"
}
```

Example 409 response:

```json
{
  "error": "EVENT_DUPLICATE",
  "message": "Questo evento è già stato creato (stesso titolo, data e luogo).",
  "existingEventId": 120
}
```

### GET /api/events
- File: [app/api/events/route.ts](../app/api/events/route.ts)
- Purpose: list events with filters
- Query params:
  - search
  - category
  - dateFrom
  - dateTo
  - limit
  - userId
- Behavior:
  - query cached with Next unstable_cache + tag events-list
  - public listings use short shared CDN caching; user-scoped listings are private and never shared-cacheable
  - coordinates are resolved when an event is created, not during list reads
  - global response dedupe if userId is not set

Example request:

```bash
curl "http://localhost:3000/api/events?search=jazz&category=musica&limit=20"
```

Example 200 response (shape):

```json
[
  {
    "id": 120,
    "title": "Concerto Jazz in Piazza",
    "description": "Serata jazz live con quartetto locale",
    "date": "2026-06-04",
    "time": "21:00",
    "location": "Piazza Rossi, Schio",
    "latitude": 45.7,
    "longitude": 11.3,
    "category": "musica"
  }
]
```

### PUT /api/events/[id]
- File: [app/api/events/[id]/route.ts](../app/api/events/[id]/route.ts)
- Purpose: update event by numeric id
- Requires an authenticated event owner or admin.
- Supports JSON updates or multipart updates with a cropped `coverImage` (JPEG/PNG/WebP, maximum 4 MiB). The previous `imageUrl` remains unchanged if no new cover is uploaded.

### POST /api/events/[id]/media
- Requires an authenticated event owner or admin.
- Multipart fields: `file` and `kind` (`image` or `pdf`). Accepts JPEG/PNG/WebP/PDF, maximum 4 MiB per file and 10 attachments per event.
- Validates extension, MIME type, file signature, and event attachment count on the server; stores the original file in the Supabase `events` bucket and metadata in `EventMedia`.
- `kind=cover` is reserved for cover replacement through the event update workflow.

### DELETE /api/events/[id]/media?mediaId=<id>
- Requires an authenticated event owner or admin.
- Removes the matching attachment metadata and best-effort deletes its Supabase Storage object.

Example request:

```bash
curl -X PUT "http://localhost:3000/api/events/120" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Concerto Jazz in Piazza - Updated",
    "description":"Programma aggiornato",
    "date":"2026-06-04",
    "time":"21:30",
    "location":"Piazza Rossi, Schio",
    "organizer":"Comune di Schio",
    "category":"musica",
    "price":"Gratuito",
    "rawText":"Aggiornamento manuale"
  }'
```

### GET /api/events/[id]
- File: [app/api/events/[id]/route.ts](../app/api/events/[id]/route.ts)
- Purpose: fetch event detail by numeric id, including ordered media attachments.

Example request:

```bash
curl "http://localhost:3000/api/events/120"
```

## 3) Favorites

### GET /api/favorites
- File: [app/api/favorites/route.ts](../app/api/favorites/route.ts)
- Purpose: list authenticated user favorites

Example request:

```bash
curl "http://localhost:3000/api/favorites" \
  -H "Cookie: <next-auth-session-cookie>"
```

### POST /api/favorites
- File: [app/api/favorites/route.ts](../app/api/favorites/route.ts)
- Purpose: add event to favorites (upsert)

Example request:

```bash
curl -X POST "http://localhost:3000/api/favorites" \
  -H "Content-Type: application/json" \
  -H "Cookie: <next-auth-session-cookie>" \
  -d '{"eventId":120}'
```

### DELETE /api/favorites
- File: [app/api/favorites/route.ts](../app/api/favorites/route.ts)
- Purpose: remove event from favorites

Example request:

```bash
curl -X DELETE "http://localhost:3000/api/favorites" \
  -H "Content-Type: application/json" \
  -H "Cookie: <next-auth-session-cookie>" \
  -d '{"eventId":120}'
```

## 4) Processing pipelines

### Evidence-based scan agents
- Link and image scans share [lib/event-scan-agents.ts](../lib/event-scan-agents.ts). Extraction stays in the existing pipeline; link completion fills missing core fields, while optional web verification proposes individual corrections instead of replacing whole events.
- Corrections are limited to date, time, location, organizer and price. Valid existing dates, titles, descriptions, categories, original text, images and source metadata are protected. A correction requires a literal quote from a supplied source and a supported value. Dates must be real calendar dates and times must be valid `HH:MM` values. Web evidence must match the extracted title and explicit date including year, or title and location when no valid date exists. This conservative heuristic can skip legitimate sources with abbreviated titles or dates; it does not prove factual accuracy.
- The optional web step uses at most two concurrent event reviews, a 25-second shared deadline and a 12-second per-event deadline. Groq calls have a 10-second timeout and no SDK retries; abort signals reach both Groq and the existing search providers. Missing configuration, no matching evidence, malformed model responses and service failures retain the extracted event. Unstarted reviews are marked skipped, not successful. All link completions share a separate 12-second deadline rather than accumulating a full timeout per event; these limits do not cover the earlier scraping, OCR or extraction stages.
- Evidence must associate the proposed value with the event within one sentence or consecutive lines of that sentence. Sources mixing editions without an extracted date, multiple candidate times, negated/unconfirmed times and conditional free-entry prices are rejected conservatively. Price evidence preserves decimal separators and must not borrow a bare number from a date. Accepted local dates are normalized to ISO. These heuristics deliberately trade some enrichment coverage for fewer unsupported overwrites; they do not guarantee semantic interpretation of every source.
- Responses preserve `events`, `debug.ocrRaw`, `debug.groqRaw` and `debug.googleRaw`. New `debug.scanAgents` reports contain role, `version: "evidence-v1"`, status (`reviewed`, `skipped`, `failed`), accepted corrections with citations and rejected proposals with reasons. `reviewed` means the agent returned a usable proposal list, not that all event details were independently verified. With no search configuration, `verification` is `{ "status": "skipped", "reason": "not-configured" }` instead of an array. Link scans also include per-event `completion` reports.
- On images, a URL printed on the flyer remains authoritative. When no source URL exists, search can supply only a matching HTTP(S) result after review; unrelated first results and secondary unverified URL searches are not used. Image cropping is no longer part of this endpoint.
- Reports are returned for inspection, not stored as training data. This release does not implement persistent learning, automatic prompt updates or model fine-tuning. Such changes require a separately reviewed correction store and evaluation set. No additional provider, paid service or database migration is required; cron consumers of the link scanner inherit the same conservative checks.

### POST /api/crop-image
- File: [app/api/crop-image/route.ts](../app/api/crop-image/route.ts)
- Purpose: best-effort verified poster crop for a draft, before publishing.
- Input: multipart `image`, supported JPEG/PNG/WebP with matching MIME/signature, at most 4 MiB.
- Responses: `200 image/jpeg` for an accepted crop, with `X-Image-Crop-Box` (`x,y,width,height` normalized 0..1 to the EXIF-rotated original) and `X-Image-Crop-Method` (`ai`, `learned` or `heuristic`); `204` for unavailable, uncertain or failed analysis; `400` invalid image; `413` oversized image. All responses are `no-store`.
- Crop order: (1) a consistent learned crop for screenshots with the same pixel size, if the verifier approves it; (2) vision bounds, snapped to the plain screen bars detected locally in the pixels and verified; (3) local bar detection alone when the poster sits between unambiguous uniform bars. Without a verifier answer, a crop is accepted only when the local pixel analysis independently agrees.
- Uses `AI_VISION_CROP_PROVIDERS` (default `groq,nvidia`), a shared 30-second AI budget and 35-second server cancellation. Client cancellation is 55 seconds and also occurs when a draft is replaced or closed. Rate-limited providers are not retried: the next provider or the local detection is used instead.
- A fallback response includes `X-Image-Crop-Reason`: `rate-limited`, `timeout`, `not-configured`, `bounds-rejected`, `verification-rejected`, `image-invalid` or `service-unavailable`. Provider HTTP failures may include a sanitized `X-Image-Crop-Service-Status`. These contain no credentials or image content; the browser shows the reason and offers manual cropping or web-image search.
- Does not create events, write to the database, upload to storage or schedule a background job. The browser applies the returned blob to the current draft only, preserves manual cover edits, and keeps the original available only as a temporary crop source. Manual cropping is available after both successful and failed automatic crops.
- The original image is sent to the configured vision provider. This endpoint does not guarantee anonymity or bypass provider quotas.

### POST /api/scan-learning/crop-sample
- File: [app/api/scan-learning/crop-sample/route.ts](../app/api/scan-learning/crop-sample/route.ts)
- Purpose: records a manual crop made on an original draft image, so screenshots of the same size are cropped alike in the future.
- Input: JSON `{ width, height, x, y, w, h }` (natural pixel size and box normalized 0..1). Same-origin only, 20 requests/hour per IP, `204` on success, `400` for invalid boxes.
- Needs the `PosterCropSample` table from migration `20261030160000_add_scan_learning`; without it the call is a no-op.

### Scan learning
- `POST /api/process-image` adds `scanFeedbackToken` (HMAC-signed AI output, 7-day TTL, key `SCAN_LEARNING_SECRET_KEY` or `NEXTAUTH_SECRET_KEY`) to each draft and includes up to 8 relevant past corrections in the extraction prompt.
- `POST /api/events` compares the token with the published fields after the response; title, location and organizer corrections are stored only when grounded in the scanned text, and date/time only when well-formed (`ScanCorrection` table).

### POST /api/event-cover-search
- File: [app/api/event-cover-search/route.ts](../app/api/event-cover-search/route.ts)
- Input JSON: only `title`, `date`, `location` strings, limited to 160/40/160 characters; maximum request body 2 KiB. OCR, screenshots and additional fields are rejected. Email addresses, phone numbers, handles and URLs are removed from the query fields.
- Uses Google Custom Search image mode (`searchType=image`, Italian locale, large images and SafeSearch) when Google is configured. If Tavily is the configured provider, it keeps the page-search path and extracts image metadata. Direct image URLs are validated and downloaded through the same bounded network pipeline; results are alternatives for explicit user selection, not reverse-image matches or certified originals.
- Same-event filter: the query is the quoted title plus location and `locandina`. A result is kept only when its title/snippet/URL, or the source page headline (`<title>`, og/twitter title, description, `<h1>`), contains the event title (≥75% of significant title words), and the result or page text names the event location (or, without a location, its date). Results naming only other years (past/future editions), stock/marketplace sites (Freepik, Shutterstock, Pinterest, Etsy…) and searches with neither location nor date are discarded/skipped. The editor hides the "Locandina trovata online" section entirely while searching and whenever no matching image is found.
- The upload editor starts cover search after extraction and automatic cropping finish, including when the crop succeeds; manual cropping remains available for a cleaner composition. Google must allow `customsearch.googleapis.com` for the configured key and image search for the engine. A 403 `API_KEY_SERVICE_BLOCKED` requires changing that Google Cloud configuration; code cannot override it.
- Response: `{ "status": "completed" | "not-configured" | "failed", "candidates": [{ "id", "title", "sourceUrl", "previewUrl" }] }`. Empty and failed searches permit manual cropping or publication without a cover. This caller opts into explicit provider errors; existing callers retain their empty-result fallback.
- Validates public DNS addresses, pins connections, checks every redirect, limits response sizes and validates actual bitmap bytes. Filters generic images and duplicate URLs/pixels. Total search budget 20 seconds; no DB/storage writes. Cross-origin browser requests are rejected.

### GET /api/event-cover-image?token=...
- File: [app/api/event-cover-image/route.ts](../app/api/event-cover-image/route.ts)
- Requires a signed five-minute token returned by the search API, not an arbitrary URL. Uses the existing auth secret; without it tokens are process-local and may not survive cross-instance routing or restarts.
- Downloads only validated public HTTP(S) resources with checked redirects, a 10-second budget, 4 MiB download/output limits and a 16-million-pixel decode limit. Returns metadata-stripped JPEG, maximum 2048 pixels per side, or 404 when unavailable/expired; instance-local rate/concurrency limits can return 429.
- The browser queues searches and preview downloads across drafts, with at most two active requests. Dismissal, new scans and manual selection cancel pending work. Broken previews remain unavailable rather than becoming selectable.
- Confirmation reuses the exact downloaded preview blob without another upstream request, avoiding image changes and publication/download races. Publication uploads that selected JPEG through the existing multipart flow. Nothing is selected automatically, and the screenshot is not included. Cropping the selected cover is separate from explicitly reopening the original.

### POST /api/process-image
- File: [app/api/process-image/route.ts](../app/api/process-image/route.ts)
- Purpose: OCR + AI extraction from flyer image
- Output: one or multiple normalized events
- Event-data vision analyzes the entire image, with OCR fallback. There are no automatic crop, bounds-detection or crop-privacy verification calls.
- Success output: `events` and `previewImageDataUrl`, a JPEG data URL containing the complete uploaded image, auto-oriented without cropping, padding or stretching. Crop-related `imageWarning` and `POSTER_PRIVACY_REVIEW_REQUIRED` responses are no longer produced.
- Data vision prefers Groq then NVIDIA unless overridden by `AI_VISION_PROVIDERS` or, with higher precedence, `AI_VISION_EXTRACTION_PROVIDERS`. `AI_VISION_CROP_PROVIDERS` is no longer used by this endpoint. The analyzer has a 180-second budget, at most 60 seconds per request and no automatic retries; truncated responses are discarded. Structured text extraction, PDFs and cron continue to use Groq. See [OPENAI_SETUP.md](../OPENAI_SETUP.md).
- Web verification is attempted whenever Tavily or Google credentials are configured. Search failures are nonblocking; warnings include provider, HTTP status and provider reason without credentials. Google HTTP 403 `API_KEY_SERVICE_BLOCKED` means the key is not authorized for Custom Search; check its API restrictions and API enablement in Google Cloud Console.
- The upload flow requests a separate visual crop through `POST /api/crop-image`, then offers direct web-image results and manual crop controls for each ready draft. Search/crop failures never block event details from being completed or published without a cover. Review the selected cover before publishing. The original is sent to configured cloud vision/OCR services.

Example request:

```bash
curl -X POST "http://localhost:3000/api/process-image" \
  -F "image=@/absolute/path/flyer.jpg"
```

Example 200 response (shape):

```json
{
  "eventCount": 1,
  "events": [
    {
      "title": "Nome Evento",
      "description": "Descrizione evento",
      "date": "2026-06-04",
      "time": "21:00",
      "location": "Schio",
      "organizer": "Organizzatore",
      "category": "musica",
      "price": "Gratuito",
      "rawText": "..."
    }
  ]
}
```

### POST /api/process-link
- File: [app/api/process-link/route.ts](../app/api/process-link/route.ts)
- Purpose: scrape URL and extract event data
- Delegates to [lib/event-processor.ts](../lib/event-processor.ts)

Example request:

```bash
curl -X POST "http://localhost:3000/api/process-link" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/event-page"}'
```

### POST /api/ocr
- File: [app/api/ocr/route.ts](../app/api/ocr/route.ts)
- Purpose: OCR.space based extraction helper

## 5) Cron and admin

### GET /api/cron/daily
- File: [app/api/cron/daily/route.ts](../app/api/cron/daily/route.ts)
- The only Vercel cron (`0 18 * * *` in [vercel.json](../vercel.json)), compatible with the Hobby plan's one-run-per-day limit.
- Calls in parallel, forwarding the same bearer token: `scrape-visitpedemontana`, `sync-google-calendar`, `generate-instagram-story`, `scan-instagram` (each runs in its own function with its own `maxDuration`).
- Accepts `CRON_SECRET` or `CRON_SECRET_KEY`; 503 when neither is configured, 401 for an invalid token.
- Returns `{ status: "success" | "partial-error", failed: [...], jobs: [{ key, ok, httpStatus, data }] }`; a failing job does not stop the others.

### GET /api/cron/scrape-visitpedemontana
- File: [app/api/cron/scrape-visitpedemontana/route.ts](../app/api/cron/scrape-visitpedemontana/route.ts)
- Purpose: scrape and ingest events from visitpedemontana source
- Requires Bearer `CRON_SECRET` or legacy `CRON_SECRET_KEY`; no configured secret means 401.

Example request:

```bash
curl -X GET "http://localhost:3000/api/cron/scrape-visitpedemontana" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### GET /api/cron/generate-instagram-story
- File: [app/api/cron/generate-instagram-story/route.ts](../app/api/cron/generate-instagram-story/route.ts)
- Purpose: build the weekly story image (events Thursday → Wednesday, with poster thumbnails; events that do not fit are summarized as "+ altri N eventi") and optionally publish it to the Instagram Graph API
- Called once a day by [GET /api/cron/daily](#get-apicrondaily); it only runs on the weekdays (Europe/Rome) configured in the admin "Story Instagram" tab, once per day. Other calls return `{ "status": "skipped", "reason": "not_scheduled" }`.
- Accepts `CRON_SECRET` or legacy `CRON_SECRET_KEY`.
- Query params: `force=1` bypasses the schedule (manual runs); `publish=1` / `publish=0` overrides the saved auto-publish setting.
- Credentials come from the admin tab (token stored AES-256-GCM encrypted) and fall back to the `INSTAGRAM_*` env vars.
- Requires a bearer token matching `CRON_SECRET` or legacy `CRON_SECRET_KEY`; returns 503 when neither is configured and 401 for an invalid token.

Example request:

```bash
curl -X GET "http://localhost:3000/api/cron/generate-instagram-story" \
  -H "Authorization: Bearer <CRON_SECRET_KEY>"
```

### GET | PUT | POST /api/admin/instagram-story
- File: [app/api/admin/instagram-story/route.ts](../app/api/admin/instagram-story/route.ts)
- Admin session required.
- GET: current story settings (`igUserId`, `hasAccessToken`, `graphApiVersion`, `autoPublish`, `publishDays` 0=Sunday…6=Saturday, last run/media/error). The token is never returned.
- PUT: saves settings. `accessToken` omitted keeps the stored token, `null` removes it, a string replaces it (encrypted with `INSTAGRAM_TOKEN_SECRET_KEY` or `NEXTAUTH_SECRET_KEY`).
- POST: checks the saved credentials against the Graph API and returns `{ ok, username }`.
- Returns 503 until the `InstagramStorySettings` migration is applied.

### POST /api/admin/run-cron/instagram-story
- File: [app/api/admin/run-cron/instagram-story/route.ts](../app/api/admin/run-cron/instagram-story/route.ts)
- Purpose: admin-triggered proxy endpoint to run cron targets
- Uses `CRON_SECRET` first, then legacy `CRON_SECRET_KEY`; without either, returns 503.
- target values:
  - instagram-story (always forced; optional body `publish: true|false`)
  - visitpedemontana

Example request:

```bash
curl -X POST "http://localhost:3000/api/admin/run-cron/instagram-story" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  -d '{"target":"visitpedemontana"}'
```

## 6) Security notes

- Extension-specific CORS is applied in extension login and events/image flows.
- User/admin protection is handled by auth helpers in protected routes.
- Daily scraping requires Bearer `CRON_SECRET` or `CRON_SECRET_KEY` and fails closed without either. Other cron routes retain their documented legacy authorization.

## 7) Calendar preferences and Google connection

### GET /api/account/calendar-email
- Requires an authenticated session.
- Returns `calendarEventType`, `googleCalendar` (null or `{ email }`), `googleCalendarConfigured`, and the latest delivery error in `calendarDeliveries`.
- Returns 503 if the calendar database schema has not been deployed.

### PUT /api/account/calendar-email
- Requires an authenticated session.
- Retained for compatibility with clients that save the internal native Google event type.
- New future events published after connection are queued automatically, including scraper imports, without category filtering. Existing events are not backfilled. Google account/type restrictions can prevent special types; those errors are reported rather than silently changing type.

### POST /api/account/google-calendar
- Requires an authenticated session and a matching Origin header.
- Requires server OAuth configuration; the user chooses the Google account in Google's consent flow.
- Requests `calendar.events.owned` and read-only `calendar.calendarlist.readonly` access so the Profile can discover owned calendars.
- Returns `{ "url": "https://accounts.google.com/..." }` and sets a short-lived encrypted HttpOnly OAuth cookie. Navigate to the URL to grant access.
- Returns 403 for an invalid Origin and 503 for missing server OAuth configuration.

### GET /api/account/google-calendar/calendars
- Requires an authenticated Google Calendar connection with the calendar-list scope.
- Returns owned calendars with `id`, `summary`, `backgroundColor`, and `primary`, plus `selectedCalendarId`.
- Existing grants without the new scope must reconnect from Profile.

### PUT /api/account/google-calendar/calendars
- Requires an authenticated session and matching Origin header.
- Body: `{ "calendarId": "..." }`. The ID is validated against the user's writable Google calendar list before being saved.
- Returns `{ "selectedCalendarId": "..." }`; unknown IDs are rejected.

### GET /api/account/google-calendar/callback
- OAuth redirect endpoint; requires the originating user's authenticated session.
- Validates state, cookie expiry, PKCE, both Calendar scopes, and verified Google identity. The verified Google email becomes the connected calendar identity.
- Stores only an encrypted refresh token and redirects to `/account?googleCalendar=connected` or a bounded error status.

### DELETE /api/account/google-calendar
- Requires an authenticated session and a matching Origin header.
- Cancels pending deliveries, removes the Google connection, and attempts remote token revocation.
- Existing Google events are not deleted.

### GET /api/cron/sync-google-calendar
- Requires `CRON_SECRET` or `CRON_SECRET_KEY` bearer authorization; missing configuration returns 503, invalid authorization returns 401.
- Drains eligible delivery records with concurrency leases and a bounded execution budget.
- Returns `{ "delivered": 0, "skipped": 0, "retried": 0 }` counters.
- Same-origin POST is also available to authenticated admins.
