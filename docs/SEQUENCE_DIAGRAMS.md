# EventScanner - Sequence Diagrams

Last update: 2026-05-27

## 1) Image OCR -> Parse -> Save

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend (/crea)
    participant API_IMG as API /api/process-image
    participant OCR as OCR Engine
    participant AI as Groq
    participant API_EVT as API /api/events
    participant SB as Supabase
    participant GEO as Geocoding
    participant DB as PostgreSQL (Prisma)

    U->>FE: Upload flyer image
    FE->>API_IMG: POST form-data(image)
    API_IMG->>OCR: Extract text (original, fallback compressed)
    OCR-->>API_IMG: Raw text
    API_IMG->>AI: Parse text into event JSON
    AI-->>API_IMG: Event candidates (1..n)
    API_IMG-->>FE: Parsed events

    U->>FE: Confirm/edit parsed data
    FE->>API_EVT: POST event data (JSON or multipart)

    alt multipart with image
        API_EVT->>SB: Upload image asset
        SB-->>API_EVT: imageUrl
    end

    API_EVT->>GEO: Geocode location (best effort)
    GEO-->>API_EVT: latitude/longitude or null
    API_EVT->>DB: Create Event row
    DB-->>API_EVT: Event created
    API_EVT-->>FE: 201 created + slug
    FE-->>U: Redirect to event detail or home
```

## 2) Link Scraping -> Parse -> Save

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend (/crea)
    participant API_LINK as API /api/process-link
    participant EP as lib/event-processor
    participant B as Puppeteer Browser
    participant SITE as Target Website
    participant AI as Groq
    participant API_EVT as API /api/events
    participant DB as PostgreSQL (Prisma)

    U->>FE: Paste event URL
    FE->>API_LINK: POST { url }
    API_LINK->>EP: processEventLink(url)
    EP->>B: Launch headless browser
    B->>SITE: Navigate and extract page content
    SITE-->>B: HTML/text/images
    B-->>EP: Scraped content
    EP->>AI: Extract structured event(s)
    AI-->>EP: Parsed event JSON
    EP-->>API_LINK: Result events
    API_LINK-->>FE: Parsed events

    U->>FE: Confirm/edit parsed data
    FE->>API_EVT: POST event data
    API_EVT->>DB: Create event (duplicate check)
    DB-->>API_EVT: Created or duplicate
    API_EVT-->>FE: 201 created or 409 duplicate
```

## 3) Cron Scrape + Instagram Story Publish

```mermaid
sequenceDiagram
    participant Scheduler as Cron Scheduler
    participant API_S as API /api/cron/scrape-visitpedemontana
    participant VP as visitpedemontana.com
    participant EP as lib/event-processor
    participant AI as Groq
    participant DB as PostgreSQL (Prisma)
    participant API_I as API /api/cron/generate-instagram-story
    participant IMG as sharp/svg renderer
    participant SB as Supabase
    participant IG as Instagram Graph API

    Scheduler->>API_S: GET with Bearer CRON_SECRET
    API_S->>VP: Crawl event listing/pages
    VP-->>API_S: Candidate links

    loop for each new link
        API_S->>EP: processEventLink(link)
        EP->>AI: Parse event details
        AI-->>EP: Structured event
        EP-->>API_S: Parsed result
        API_S->>DB: Insert non-duplicate events
    end

    Scheduler->>API_I: GET with Bearer CRON_SECRET
    API_I->>DB: Query events in weekly window
    DB-->>API_I: Event set
    API_I->>IMG: Build story image (SVG -> JPG)
    IMG-->>API_I: Story JPG buffer
    API_I->>SB: Upload story asset
    SB-->>API_I: Public/accessible image URL
    API_I->>IG: Create media container
    IG-->>API_I: containerId
    API_I->>IG: Publish story
    IG-->>API_I: mediaId
    API_I-->>Scheduler: Success status + ids
```

## Notes

- Diagrams model current behavior observed in route handlers and libs, not an aspirational architecture.
- Exact retries/timeouts and fallback branches are simplified for readability.
