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
