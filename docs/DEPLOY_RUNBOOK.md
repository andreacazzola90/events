# EventScanner - Deploy and Ops Runbook

Last update: 2026-05-27

## 1) Scope

This runbook covers deployment and operations for the Next.js application on Vercel, including DB migrations, secrets, cron jobs, and incident handling basics.

## 2) Environments

Define at least:
- local
- preview (Vercel preview)
- production

Keep environment-specific values in platform secrets, never in repository files.

## 3) Required secrets

From [.env.example](../.env.example) and runtime code:
- DATABASE_URL
- NEXTAUTH_SECRET
- NEXTAUTH_URL
- GROQ_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- CRON_SECRET

If Instagram publishing is enabled:
- INSTAGRAM_IG_USER_ID
- INSTAGRAM_ACCESS_TOKEN
- INSTAGRAM_GRAPH_API_VERSION (optional, default in code)
- STORY_BUCKET (optional)

## 4) Pre-deploy checklist

1. Verify Prisma schema changes and migration status.
2. Run lint and tests where applicable.
3. Validate API changes against [API_REFERENCE.md](./API_REFERENCE.md).
4. Confirm all required environment variables exist in target environment.
5. If cron/auth changes were made, test protected endpoints with CRON_SECRET.

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

## 5.3 Vercel deploy

- Push to main for production deployment.
- Use preview deployments for validation before merge.
- Confirm final deployment health by hitting core pages and APIs.

## 6) Post-deploy validation

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

Protected cron endpoints require:
- Authorization: Bearer <CRON_SECRET>

Endpoints:
- GET /api/cron/scrape-visitpedemontana
- GET /api/cron/generate-instagram-story
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

1. Validate GROQ_API_KEY and OCR provider availability.
2. Test POST /api/process-image with a known good image.
3. Inspect logs for extraction branch used and fallback path.

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
3. Register the exact authorized redirect URI: `http://localhost:3000/api/account/google-calendar/callback` locally, and `https://<your-domain>/api/account/google-calendar/callback` in production.
4. Configure server-only secrets: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `CRON_SECRET`. `NEXTAUTH_URL` must be the stable canonical application origin.
5. Optionally set `GOOGLE_CALENDAR_TOKEN_SECRET` to a dedicated high-entropy encryption secret. Otherwise refresh-token encryption uses `NEXTAUTH_SECRET`. Rotating the encryption secret requires users to reconnect Google.
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
- `GET /api/cron/sync-google-calendar` requires `Authorization: Bearer <CRON_SECRET>` and refuses to run if the secret is missing. Admins can also use same-origin `POST /api/cron/sync-google-calendar` with their session.
- The Vercel retry job runs daily at 04:30 UTC, preserving daily cron compatibility. For timely recovery and higher volume, schedule the protected endpoint every five minutes using a supported Vercel plan or an external scheduler. Each run is time-bounded; remaining deliveries stay queued.

### Verification

```bash
node --experimental-strip-types --test lib/calendar-ics.test.mjs lib/google-calendar.test.mjs lib/cron-execution.test.mjs
npx tsc --noEmit --incremental false
```

After credentials are configured, authorize a test Google account, publish a future event with a known time, and confirm it appears exactly once in that account's primary calendar with the selected native event type. Verify that EventScanner categories do not filter delivery, and check retry/disconnect behavior. Use an eligible Google account to verify special status types. Unit tests use mocked Google responses; a real consent/API test requires valid OAuth credentials.
