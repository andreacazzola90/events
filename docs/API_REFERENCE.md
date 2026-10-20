# EventScanner - API Reference (Initial)

Last update: 2026-05-27

This document is generated from current route handlers under [app/api](../app/api).

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

### POST /api/process-image
- File: [app/api/process-image/route.ts](../app/api/process-image/route.ts)
- Purpose: OCR + AI extraction from flyer image
- Output: one or multiple normalized events
- Event-data vision analyzes the entire image, with OCR fallback. There are no automatic crop, bounds-detection or crop-privacy verification calls.
- Success output: `events` and `previewImageDataUrl`, a JPEG data URL containing the complete uploaded image, auto-oriented without cropping, padding or stretching. Crop-related `imageWarning` and `POSTER_PRIVACY_REVIEW_REQUIRED` responses are no longer produced.
- Data vision prefers Groq then NVIDIA unless overridden by `AI_VISION_PROVIDERS` or, with higher precedence, `AI_VISION_EXTRACTION_PROVIDERS`. `AI_VISION_CROP_PROVIDERS` is no longer used by this endpoint. The analyzer has a 180-second budget, at most 60 seconds per request and no automatic retries; truncated responses are discarded. Structured text extraction, PDFs and cron continue to use Groq. See [OPENAI_SETUP.md](../OPENAI_SETUP.md).
- Web verification is attempted whenever Tavily or Google credentials are configured. Search failures are nonblocking; warnings include provider, HTTP status and provider reason without credentials. Google HTTP 403 `API_KEY_SERVICE_BLOCKED` means the key is not authorized for Custom Search; check its API restrictions and API enablement in Google Cloud Console.
- Privacy limitation: the complete uploaded image is used as the cover. Social UI, user avatars and personal information are no longer removed or checked automatically. Prompts instruct data extraction to ignore unrelated personal details, but this does not anonymize the cover. Review images before publishing. The original is sent to cloud vision/OCR services.

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

### GET /api/cron/scrape-visitpedemontana
- File: [app/api/cron/scrape-visitpedemontana/route.ts](../app/api/cron/scrape-visitpedemontana/route.ts)
- Purpose: scrape and ingest events from visitpedemontana source
- Protected by CRON_SECRET_KEY bearer token when configured

Example request:

```bash
curl -X GET "http://localhost:3000/api/cron/scrape-visitpedemontana" \
  -H "Authorization: Bearer <CRON_SECRET_KEY>"
```

### GET /api/cron/generate-instagram-story
- File: [app/api/cron/generate-instagram-story/route.ts](../app/api/cron/generate-instagram-story/route.ts)
- Purpose: build weekly story image and publish to Instagram Graph API
- Protected by CRON_SECRET_KEY bearer token when configured

Example request:

```bash
curl -X GET "http://localhost:3000/api/cron/generate-instagram-story" \
  -H "Authorization: Bearer <CRON_SECRET_KEY>"
```

### POST /api/admin/run-cron/instagram-story
- File: [app/api/admin/run-cron/instagram-story/route.ts](../app/api/admin/run-cron/instagram-story/route.ts)
- Purpose: admin-triggered proxy endpoint to run cron targets
- target values:
  - instagram-story
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
- Cron routes rely on Authorization: Bearer <CRON_SECRET_KEY> when secret is configured.

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
- Requires `CRON_SECRET_KEY` bearer authorization; missing configuration returns 503, invalid authorization returns 401.
- Drains eligible delivery records with concurrency leases and a bounded execution budget.
- Returns `{ "delivered": 0, "skipped": 0, "retried": 0 }` counters.
- Same-origin POST is also available to authenticated admins.
