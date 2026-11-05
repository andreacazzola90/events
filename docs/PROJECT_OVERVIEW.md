# EventScanner - Project Overview

Last update: 2026-05-27

## 1) Project goal

EventScanner is a Next.js application to collect, create, search and publish local events.
The core value is event extraction from:
- flyer images (OCR + AI extraction)
- event links (web scraping + AI extraction)

The platform includes:
- web UI for users/admins
- API routes for CRUD and processing
- auth system with NextAuth + credentials
- Chrome extension integration
- scheduled jobs (cron) for scraping and Instagram Story generation

## 2) Tech stack

- Framework: Next.js 16 (App Router)
- Language: TypeScript
- UI: React 19 + Tailwind CSS 4 + daisyUI
- DB/ORM: PostgreSQL + Prisma
- Auth: NextAuth (Credentials provider)
- AI extraction: Groq SDK
- OCR: local OCR helpers + OCR.space route fallback
- Image processing: sharp
- Scraping: puppeteer / puppeteer-core + chromium helpers
- Storage: Supabase (images and generated story assets)
- E2E tests: Cypress

## 3) Main runtime flows

### 3.1 Create event from image

1. User uploads an image from [app/crea/page.tsx](../app/crea/page.tsx).
2. Frontend calls POST /api/process-image.
3. OCR extracts text. In parallel, visual analysis identifies the full flyer inside the uploaded image; confident bounds produce an automatically cropped cover. The original remains available for free manual cropping during draft review, including after AI text reprocessing.
4. Groq parses text into one or multiple events; relevant corrections from past scans are added to the prompt.
5. Frontend confirms/edits data. A manual crop is retained as a private original/corrected pair only for signed-in users who explicitly consent. Samples are isolated to the account, matched by source dimensions, limited to three recent pairs in the existing vision analysis request, and deleted after 180 days. Guests and users who opt out keep the existing crop flow without sample storage.
6. Frontend saves via POST /api/events (JSON or multipart). Differences between the signed AI output and the published event are learned as corrections.
7. API stores event in DB, uploads image if needed, geocodes location, revalidates caches.

### 3.2 Create event from link

1. User enters URL in create page.
2. Frontend calls POST /api/process-link.
3. Backend uses scraper + AI pipeline in [lib/event-processor.ts](../lib/event-processor.ts).
4. One or more candidate events are returned.
5. User confirms and saves via POST /api/events.

### 3.3 Create event from PDF and rescan a draft

- [app/api/process-pdf/route.ts](../app/api/process-pdf/route.ts) extracts up to 50 PDF pages and inventories event candidates with page references. Detail extraction runs in bounded batches/concurrency and returns completion, failure, pending and unscanned-page counts; capped documents are explicitly marked partial. Candidate evidence remains attached to each draft so events on the same day stay distinct.
- [app/api/ai/rescan-event/route.ts](../app/api/ai/rescan-event/route.ts) rereads only a validated public source URL attached to the selected draft. It returns an editable proposal only for a safe, unambiguous match; uploaded PDFs without a persistent source URL must be provided again. Applying a proposal never publishes automatically, and stale responses are discarded.
- Public PDF/link fetching validates addresses and redirects and applies size/time limits. The PDF itself is not persisted.

### 3.4 Browse and favorites

- Event list UI uses [app/components/EventList.tsx](../app/components/EventList.tsx).
- Data source: GET /api/events.
- Authenticated users can add/remove favorites via /api/favorites.

### 3.4 Scheduled automation

- GET /api/cron/scrape-visitpedemontana: scrape events from visitpedemontana.com.
- GET /api/cron/generate-instagram-story: generate/publish the weekly story image with event thumbnails, on the weekdays configured in the admin "Story Instagram" tab.
- GET /api/cron/daily: single daily Vercel cron (18:00 UTC, Hobby-compatible) that runs scraping, Google Calendar sync and the story job in parallel.
- GET/PUT/POST /api/admin/instagram-story: Instagram credentials and schedule settings.
- POST /api/admin/run-cron/instagram-story: admin trigger endpoint.

## 4) Data model (Prisma)

Defined in [prisma/schema.prisma](../prisma/schema.prisma).

### Event
- id (PK)
- title, description, date, time, location
- latitude, longitude (nullable)
- organizer, category, price
- rawText
- imageUrl, sourceUrl, externalId
- origin
- createdById (nullable FK -> User)
- createdAt, updatedAt

### PosterCropLearningPair
- Account-owned crop metadata and paths to the private original/corrected JPEG pair
- Explicit consent timestamp, source width/height and normalized crop box
- Samples are matched only within the owning account and same source dimensions; the vision call uses at most three recent pairs, and the cleanup cron removes pairs older than 180 days

### EventMedia
- id (PK), eventId (FK -> Event, cascade delete)
- kind (`image` or `pdf`), fileName, MIME type, sizeBytes
- storagePath and public URL in Supabase Storage
- position, createdAt

### User
- id (PK)
- email (unique)
- password (hashed)
- name, role
- createdAt, updatedAt

### Favorite
- id (PK)
- userId (FK)
- eventId (FK)
- createdAt
- unique constraint on (userId, eventId)

## 5) Frontend route map

Main pages (App Router):
- / -> [app/page.tsx](../app/page.tsx)
- /eventi -> [app/eventi/page.tsx](../app/eventi/page.tsx)
- /tutti-gli-eventi -> [app/tutti-gli-eventi/page.tsx](../app/tutti-gli-eventi/page.tsx)
- /mappa -> [app/mappa/page.tsx](../app/mappa/page.tsx)
- /crea -> [app/crea/page.tsx](../app/crea/page.tsx)
- /events/[slug] -> [app/events/[slug]/page.tsx](../app/events/[slug]/page.tsx)
- /events/[slug]/edit -> [app/events/[slug]/edit/page.tsx](../app/events/[slug]/edit/page.tsx)
- /auth, /auth/register, /auth/signin, /auth/signout, /auth/error
- /account, /me, /estensione

## 6) Configuration and env variables

Base env reference: [.env.example](../.env.example).

Core variables:
- POSTGRES_URL (preferred Prisma runtime and CLI connection URL; falls back to POSTGRES_PRISMA_URL, then DATABASE_URL)
- DATABASE_URL
- NEXTAUTH_SECRET_KEY
- NEXTAUTH_URL
- GROQ_API_SECRET_KEY
- GROQ_VISION_MODEL (optional; defaults to `qwen/qwen3.8-27b` for the vision checks)
- NVIDIA_API_SECRET_KEY and NVIDIA_VISION_MODEL (optional; NVIDIA is first in the default vision order)
- SUPABASE_URL
- SUPABASE_SECRET_KEY (server-only Supabase Storage key; falls back to SUPABASE_SERVICE_ROLE_SECRET_KEY)
- SUPABASE_PUBLISHABLE_KEY (public API key for Supabase server auth handlers)
- SUPABASE_JWKS_URL (user JWT verification; derived from SUPABASE_URL by @supabase/server when omitted)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- Server-side Storage also accepts NEXT_PUBLIC_SUPABASE_URL as a legacy URL fallback; keep secret keys server-only.
- `@supabase/server` requires Node.js 22 or newer.
- Private `crop-learning` Supabase Storage bucket (created/kept private by the server on first opted-in sample write)
- CRON_SECRET_KEY (for protected cron routes)
- Instagram Graph vars (for story publishing)
- BRAVE_SEARCH_API_KEY (web search for verification and cover images; Tavily and Google are fallbacks)

## 7) BMAD installation in this repository

Installed on 2026-05-27.

Artifacts generated:
- local dependency: bmad-method in devDependencies
- BMAD workspace: [_bmad/](../_bmad)
- Claude skills scaffold: [.claude/skills](../.claude/skills)

## 8) Operational notes

- Events API applies deduplication (title + date + location) on create.
- Event list API can dedupe global listing in response and backfill missing coordinates.
- Geocoding uses OpenStreetMap Nominatim via [lib/geocoding.ts](../lib/geocoding.ts).
- Extension auth flow uses dedicated endpoint /api/auth/extension-login and CORS helpers.
- Some project docs already exist at repository root (PWA, analytics, Cypress, Vercel).

## 9) Suggested next documentation steps

Completed in this iteration:
1. Added endpoint request/response examples to [API_REFERENCE.md](./API_REFERENCE.md).
2. Added deployment and operations runbook in [DEPLOY_RUNBOOK.md](./DEPLOY_RUNBOOK.md).
3. Organized BMAD documentation structure in [bmad/README.md](./bmad/README.md).

Recommended next increments:
1. Add a dedicated troubleshooting matrix (symptom -> cause -> fix).
2. Add release checklist templates per environment.
3. Expand sequence diagrams in [SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md) with failure and retry paths.
