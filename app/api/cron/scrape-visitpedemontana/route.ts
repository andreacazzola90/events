import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processEventLink } from '../../../../lib/event-processor';
import { getBrowser, closeBrowser } from '../../../../lib/browser-vercel';
import { revalidatePath } from 'next/cache';
import { geocodeLocation } from '@/lib/geocoding';

export const maxDuration = 300; // 5 minuti per il cron job

function getExternalIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    // Supporta URL hash-style: #/eventi/TRN/<uuid>/<slug>
    if (u.hash && u.hash.includes('/eventi/')) {
      const hashParts = u.hash.split('/').filter(Boolean);
      const hashTail = hashParts[hashParts.length - 1];
      if (hashTail) {
        return hashTail;
      }
    }

    const segments = u.pathname.split('/').filter(Boolean);
    // Usa l'ultimo segmento del path come id esterno (slug dell'evento)
    return segments[segments.length - 1] || url;
  } catch {
    return url;
  }
}

function buildOptionalRegex(raw: string | null | undefined): RegExp | null {
  if (!raw) {
    return null;
  }
  try {
    return new RegExp(raw, 'i');
  } catch {
    console.warn('[VisitPedemontana] Invalid regex ignored:', raw);
    return null;
  }
}

/**
 * Tries to click a cookie-consent "accept" button if one is visible on the page.
 * Silently ignores errors (banner not present, already dismissed, etc.).
 */
async function dismissCookieBanner(page: any): Promise<void> {
  const ACCEPT_SELECTORS = [
    '#iubenda-cs-accept-btn',
    '.iubenda-cs-accept-btn',
    "button[id*='accept']",
    "button[class*='accept']",
    "a[id*='accept']",
    "a[class*='accept']",
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    "button[id*='cookie'][id*='accept']",
    '.cc-accept',
    '#accept-all',
  ];
  const ACCEPT_TEXT_RE = /^(accetta|accept all|accept|accetto|ok,?\s*accetto|ho capito|consenti tutto)$/i;
  try {
    for (const sel of ACCEPT_SELECTORS) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await new Promise((r) => setTimeout(r, 600));
        return;
      }
    }
    // Fallback: match by visible button/link text
    const btns = await page.$$("button, a[role='button']");
    for (const btn of btns) {
      try {
        const text: string = await btn.evaluate((el: Element) => (el.textContent || '').trim());
        if (ACCEPT_TEXT_RE.test(text)) {
          await btn.click();
          await new Promise((r) => setTimeout(r, 600));
          return;
        }
      } catch { /* ignore */ }
    }
  } catch { /* banner not present or already dismissed */ }
}

function slugifyUrlPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'evento';
}

function buildVisitSchioEventUrl(listUrl: string, eventPayload: any): string | null {
  const eventId = String(eventPayload?.id || '').trim();
  if (!eventId) {
    return null;
  }

  const dbCode = String(eventPayload?.dbCode || 'TRN').trim() || 'TRN';
  const friendlyName = slugifyUrlPart(
    String(eventPayload?.urlFriendlyName || eventPayload?.name || eventId),
  );
  const baseWithoutHash = listUrl.split('#')[0];
  return `${baseWithoutHash}#/eventi/${encodeURIComponent(dbCode)}/${encodeURIComponent(eventId)}/${friendlyName}`;
}

type CronSourceConfig = {
  listUrl: string;
  eventLinkSelector: string;
  nextPageSelector: string | null;
  includePattern: string | null;
  excludePattern: string | null;
  waitMs: number;
  requestTimeoutMs: number;
  maxPages: number;
  maxLinksPerRun: number;
};

async function getVisitPedemontanaConfig(): Promise<CronSourceConfig> {
  const defaults: CronSourceConfig = {
    listUrl:
      'https://www.visitschio.it/it/pages/eventi-del-territorio-della-pedemontana-veneta-e-colli#/eventi',
    eventLinkSelector: 'a[href*="#/eventi/"], a[href*="/eventi/"]',
    nextPageSelector: 'dw-gen-pagination',
    includePattern: '#/eventi/|/eventi/.+/.+',
    excludePattern: '#mm-|#menu|/it/eventi$|/it/eventi/[^/]+$|/users/|/maps|/search',
    // Angular + Deskline widget needs time to render and fire the API call
    waitMs: 8000,
    requestTimeoutMs: 90000,
    maxPages: 30,
    maxLinksPerRun: 600,
  };

  const cronSourceModel = (prisma as any).cronSource;
  if (!cronSourceModel) {
    return defaults;
  }

  try {
    const activeSources = await cronSourceModel.findMany({
      where: { isActive: true },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (!Array.isArray(activeSources) || activeSources.length === 0) {
      return defaults;
    }

    const preferred =
      activeSources.find((source: any) =>
        /visitschio|visitpedemontana/i.test(`${source?.name || ''} ${source?.listUrl || ''}`),
      ) || activeSources[0];

    return {
      listUrl: preferred?.listUrl || defaults.listUrl,
      eventLinkSelector: preferred?.eventLinkSelector || defaults.eventLinkSelector,
      nextPageSelector: preferred?.nextPageSelector || defaults.nextPageSelector,
      includePattern: preferred?.includePattern || defaults.includePattern,
      excludePattern: preferred?.excludePattern || defaults.excludePattern,
      waitMs: Number(preferred?.waitMs) > 0 ? Number(preferred.waitMs) : defaults.waitMs,
      requestTimeoutMs:
        Number(preferred?.requestTimeoutMs) > 0
          ? Number(preferred.requestTimeoutMs)
          : defaults.requestTimeoutMs,
      maxPages: Number(preferred?.maxPages) > 0 ? Number(preferred.maxPages) : defaults.maxPages,
      maxLinksPerRun:
        Number(preferred?.maxLinksPerRun) > 0
          ? Number(preferred.maxLinksPerRun)
          : defaults.maxLinksPerRun,
    };
  } catch (error) {
    console.warn('[VisitPedemontana] Failed loading CronSource config, using defaults:', error);
    return defaults;
  }
}

export async function GET(request: NextRequest) {
  // Controllo del secret per il cron (stessa logica di scrape-visitschio)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('--- STARTING VISITPEDEMONTANA SCRAPER CRON JOB ---');
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  let browser: any = null;
  let eventLinks: string[] = [];

  // Considera "oggi" senza orario per filtrare gli eventi passati
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const sourceConfig = await getVisitPedemontanaConfig();
    const listUrl = sourceConfig.listUrl;
    const includeRegex = buildOptionalRegex(sourceConfig.includePattern);
    const excludeRegex = buildOptionalRegex(sourceConfig.excludePattern);

    let listHost = 'www.visitschio.it';
    try {
      listHost = new URL(listUrl).host;
    } catch {
      // usa fallback
    }

    console.log('[VisitPedemontana] Using source config:', {
      listUrl,
      eventLinkSelector: sourceConfig.eventLinkSelector,
      nextPageSelector: sourceConfig.nextPageSelector,
      maxPages: sourceConfig.maxPages,
      waitMs: sourceConfig.waitMs,
      requestTimeoutMs: sourceConfig.requestTimeoutMs,
      maxLinksPerRun: sourceConfig.maxLinksPerRun,
    });

    // 1. Apri la pagina lista eventi (con supporto alla paginazione)
    browser = await getBrowser({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const baseListUrl = listUrl;
    const visitedPages = new Set<string>();
    const allEventLinks = new Set<string>();
    const desklineEventLinks = new Set<string>();
    let currentUrl = baseListUrl;
    const maxPages = sourceConfig.maxPages;
    let desklineEventsApiUrl: string | null = null;
    const desklineRequestHeaders: Record<string, string> = {};

    const collectDesklineEvents = (payload: any) => {
      // Deskline API can return events under different keys depending on the endpoint version
      const events = Array.isArray(payload?.events)
        ? payload.events
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.records)
            ? payload.records
            : Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload?.results)
                ? payload.results
                : Array.isArray(payload)
                  ? payload
                  : [];
      for (const eventPayload of events) {
        const detailUrl = buildVisitSchioEventUrl(listUrl, eventPayload);
        if (detailUrl) {
          desklineEventLinks.add(detailUrl);
        }
      }
      return events.length;
    };

    page.on('request', (req: any) => {
      try {
        const url = String(req.url?.() || '');
        // Capture any Deskline API request for events
        const isDeskline = url.includes('deskline.net') || url.includes('webapi.deskline');
        const isEventsEndpoint = url.includes('/events') || url.includes('/Events');
        if (!isDeskline || !isEventsEndpoint) return;

        // Prefer a URL with pagination params (pageNo / pageSize)
        if (!desklineEventsApiUrl || url.includes('pageNo') || url.includes('pageSize')) {
          desklineEventsApiUrl = url;
        }
        const headers = req.headers?.() || {};
        const sourceHeader = headers['dw-source'] || headers['DW-Source'];
        const sessionHeader = headers['dw-sessionid'] || headers['DW-SessionId'];
        if (sourceHeader) desklineRequestHeaders['DW-Source'] = sourceHeader;
        if (sessionHeader) desklineRequestHeaders['DW-SessionId'] = sessionHeader;
      } catch {
        // ignore request parse errors
      }
    });

    page.on('response', async (response: any) => {
      try {
        const url = String(response.url?.() || '');
        const isDeskline = url.includes('deskline.net') || url.includes('webapi.deskline');
        const isEventsEndpoint = url.includes('/events') || url.includes('/Events');
        if (!isDeskline || !isEventsEndpoint) return;
        const payload = await response.json();
        const count = collectDesklineEvents(payload);
        if (count > 0) {
          console.log(`[VisitPedemontana] Captured ${count} events from Deskline API response.`);
        }
      } catch {
        // Ignore non-json or blocked responses.
      }
    });

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      if (visitedPages.has(currentUrl)) {
        console.log(`[VisitPedemontana] Page already visited, stopping at ${currentUrl}`);
        break;
      }
      visitedPages.add(currentUrl);

      console.log(`[VisitPedemontana] Navigating to events list page ${pageIndex + 1}: ${currentUrl}`);
      // Use 'load' (DOMContentLoaded + resources) instead of networkidle2 to avoid premature
      // resolution before the Deskline widget fires its API call.
      await page.goto(currentUrl, {
        waitUntil: 'load',
        timeout: sourceConfig.requestTimeoutMs,
      });

      // iubenda and similar cookie banners load lazily — wait 2s before trying to dismiss
      await new Promise((r) => setTimeout(r, 2000));
      await dismissCookieBanner(page);

      // Wait for the Deskline event listing web-component to appear in the DOM.
      // This signals that Angular bootstrapped and the widget is at least mounting.
      const DW_READY_SELECTORS = [
        'dw-event-listing',
        'dw-event-card',
        'dw-events-list',
        'a[href*="#/eventi/"]',
        'a[href*="/eventi/"]',
      ];
      let dwFound = false;
      for (const sel of DW_READY_SELECTORS) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          console.log(`[VisitPedemontana] Deskline component ready ("${sel}").`);
          dwFound = true;
          break;
        } catch {
          // try next selector
        }
      }
      if (!dwFound) {
        console.warn(`[VisitPedemontana] No Deskline component found; waiting ${sourceConfig.waitMs}ms for JS rendering.`);
      }
      // Extra wait for Angular change detection and widget API calls to complete
      await new Promise((resolve) => setTimeout(resolve, dwFound ? sourceConfig.waitMs / 2 : sourceConfig.waitMs));

      const { pageEventLinks, nextPageUrl, debugAnchors } = await page.evaluate(
        ({ eventLinkSelector, nextPageSelector, listHost }: { eventLinkSelector: string; nextPageSelector: string | null; listHost: string }) => {
        const origin = window.location.origin;
        const currentPageUrl = window.location.href;
        const toAbsolute = (href: string) => {
          try {
            return new URL(href, origin).toString();
          } catch {
            return href;
          }
        };

          // ─── Shadow-DOM-aware querySelectorAll ─────────────────────────────────
          // Deskline web-components (dw-event-card, dw-gen-pagination, …) render
          // their inner DOM inside a shadow root, which is invisible to the standard
          // document.querySelectorAll.  We recursively pierce every shadow root so
          // we can find both event <a> tags and pagination links.
          function deepQueryAll(root: Document | ShadowRoot | Element, sel: string): Element[] {
            const results: Element[] = Array.from(root.querySelectorAll(sel));
            // Walk every element that might host a shadow root
            const all = Array.from(root.querySelectorAll('*'));
            for (const el of all) {
              const sr = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
              if (sr) {
                results.push(...deepQueryAll(sr, sel));
              }
            }
            return results;
          }

          // Collect event anchor candidates using both the custom selector and the
          // generic a[href], then pierce shadow roots.
          const selectorList: string[] = [];
          if (eventLinkSelector && eventLinkSelector !== 'a[href]') {
            // multi-selector string like 'a[href*="#/eventi/"], a[href*="/eventi/"]'
            for (const s of eventLinkSelector.split(',').map(s => s.trim())) {
              if (s) selectorList.push(s);
            }
          }
          selectorList.push('a[href]');

          const seenAnchors = new Set<HTMLAnchorElement>();
          for (const sel of selectorList) {
            for (const node of deepQueryAll(document, sel)) {
              const anchor = (node instanceof HTMLAnchorElement)
                ? node
                : node.closest?.('a[href]') as HTMLAnchorElement | null;
              if (anchor && !seenAnchors.has(anchor)) seenAnchors.add(anchor);
            }
          }
          const anchors = Array.from(seenAnchors);

          const urls = anchors
          .map(a => {
            try {
              return toAbsolute(a.href);
            } catch {
              return null;
            }
          })
          .filter((href): href is string => !!href)
          .filter(href => {
              if (href.startsWith('javascript:')) return false;
              if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
              if (href === '#' || href.endsWith('/#')) return false;
              if (href === currentPageUrl) return false;

              let parsed: URL;
              try {
                parsed = new URL(href);
              } catch {
                return false;
              }

              if (parsed.host !== listHost) return false;

              // Accept hash-style SPA routes AND classic path-based event URLs
              const isHashEventDetail = /#\/eventi\/[^/?#]+/i.test(parsed.hash);
              const isClassicEventDetail = /\/eventi\/[^/?#]+\/[^/?#]+/i.test(parsed.pathname);
              if (!isHashEventDetail && !isClassicEventDetail) return false;

              return true;
          });

          const FIRST_LAST_RE = /prima\s*pagina|ultima\s*pagina|first\s*page|last\s*page|go\s+to\s+first|go\s+to\s+last/i;

          let nextPageUrl: string | null = null;

          // Helper: resolve next page from a pagination container element
          const resolveNextFromContainer = (container: Element): string | null => {
            // 1. rel="next"
            const relN = container.querySelector<HTMLAnchorElement>('a[rel="next"]');
            if (relN?.href) return toAbsolute(relN.href);

            // 2. Numbered: find active page, then page+1
            const active = container.querySelector<HTMLElement>(
              '.active > a, a.active, [aria-current="page"]',
            );
            if (active) {
              const curNum = parseInt((active.textContent || '').trim(), 10);
              if (!isNaN(curNum)) {
                for (const a of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
                  if (parseInt((a.textContent || '').trim(), 10) === curNum + 1) {
                    return toAbsolute(a.href);
                  }
                }
              }
            }

            // 3. URL-based current page fallback
            const pageMatch = window.location.href.match(/[?&]page=(\d+)|\/page\/(\d+)/i);
            const curPage = pageMatch ? parseInt(pageMatch[1] || pageMatch[2], 10) : 1;
            for (const a of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
              if (parseInt((a.textContent || '').trim(), 10) === curPage + 1) {
                return toAbsolute(a.href);
              }
            }

            // 4. Arrow links — exclude first/last page double arrows
            for (const a of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
              const txt = (a.textContent || '').trim();
              const aria = (a.getAttribute('aria-label') || '').trim();
              if (FIRST_LAST_RE.test(aria) || FIRST_LAST_RE.test(txt)) continue;
              const svgType = a.querySelector('svg')?.getAttribute('type') || '';
              if (/double/i.test(svgType)) continue;
              if (/successiv|prossim|avanti|›|»/i.test(txt) || /successiv|prossim|next/i.test(aria)) {
                return toAbsolute(a.href);
              }
            }
            return null;
          };

          if (nextPageSelector) {
            // Try light DOM first, then pierce shadow roots (needed for <dw-gen-pagination>)
            let container: Element | null = document.querySelector(nextPageSelector);
            if (!container) {
              const found = deepQueryAll(document, nextPageSelector);
              container = found[0] ?? null;
            }
            if (container) {
              if (container instanceof HTMLAnchorElement && container.href && !container.href.endsWith('#')) {
                nextPageUrl = toAbsolute(container.href);
              } else {
                // Also search INSIDE the shadow root of the pagination component
                const paginationRoot = (container as Element & { shadowRoot: ShadowRoot | null }).shadowRoot ?? container;
                nextPageUrl = resolveNextFromContainer(paginationRoot as Element);
                if (!nextPageUrl) nextPageUrl = resolveNextFromContainer(container);
              }
            }
          }

          if (!nextPageUrl) {
            // Fallback: any a[rel="next"] in light or shadow DOM
            const relAnchors = deepQueryAll(document, 'a[rel="next"]') as HTMLAnchorElement[];
            const relNext = relAnchors.find(a => a.href && !a.href.endsWith('#'));
            if (relNext?.href) {
              nextPageUrl = toAbsolute(relNext.href);
            }
          }

          return {
            pageEventLinks: Array.from(new Set(urls)),
            nextPageUrl,
            debugAnchors: anchors.slice(0, 20).map(a => a.href),
          };
        },
        {
          eventLinkSelector: sourceConfig.eventLinkSelector,
          nextPageSelector: sourceConfig.nextPageSelector,
          listHost,
        },
      );

      const pageLinksSet = new Set<string>((pageEventLinks as string[]) || []);

      // Fallback: su alcune build/headless i link SPA possono non comparire come anchor standard.
      if (pageLinksSet.size < 5) {
        const html = await page.content();
        const baseWithoutHash = currentUrl.split('#')[0];

        const hashMatches =
          html.match(/#\/eventi\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+/g) || [];
        for (const hashPath of hashMatches) {
          pageLinksSet.add(`${baseWithoutHash}${hashPath}`);
        }

        const escapedHost = listHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const classicRegex = new RegExp(
          `https?:\\/\\/${escapedHost}\\/it\\/eventi\\/[^\\s\"'<>]+\\/[^\\s\"'<>]+`,
          'g',
        );
        const classicMatches = html.match(classicRegex) || [];
        for (const absoluteUrl of classicMatches) {
          pageLinksSet.add(absoluteUrl);
        }

        if (hashMatches.length > 0 || classicMatches.length > 0) {
          console.log(
            `[VisitPedemontana] Fallback extracted ${hashMatches.length + classicMatches.length} links from HTML source.`,
          );
        }
      }

      pageLinksSet.forEach((url: string) => allEventLinks.add(url));

      if (pageEventLinks.length === 0) {
        console.log('[VisitPedemontana] No event links extracted on this page. Sample anchors:', debugAnchors);
      } else {
        console.log(`[VisitPedemontana] Extracted ${pageEventLinks.length} event candidate links on this page.`);
      }

      if (!nextPageUrl) {
        console.log('[VisitPedemontana] No next page link found, stopping pagination.');
        break;
      }

      currentUrl = nextPageUrl;
    }

    // Fallback affidabile: usa direttamente l'API Deskline catturata dalla pagina per paginare tutti gli eventi.
    if (desklineEventsApiUrl && desklineRequestHeaders['DW-Source'] && desklineRequestHeaders['DW-SessionId']) {
      try {
        const templateUrl = new URL(desklineEventsApiUrl);
        const pageSize = Math.max(1, Number(templateUrl.searchParams.get('pageSize') || '24'));
        const sourceOrigin = new URL(listUrl).origin;

        for (let pageNo = 0; pageNo < 80; pageNo++) {
          const apiUrl = new URL(templateUrl.toString());
          apiUrl.searchParams.set('pageNo', String(pageNo));
          apiUrl.searchParams.set('pageSize', String(pageSize));

          const apiRes = await fetch(apiUrl.toString(), {
            headers: {
              'DW-Source': desklineRequestHeaders['DW-Source'],
              'DW-SessionId': desklineRequestHeaders['DW-SessionId'],
              Accept: 'application/json',
              Referer: listUrl,
              Origin: sourceOrigin,
            },
          });

          if (!apiRes.ok) {
            console.warn(`[VisitPedemontana] Deskline API pagination stopped at page ${pageNo}. Status: ${apiRes.status}`);
            break;
          }

          const payload = await apiRes.json();
          const eventsCount = collectDesklineEvents(payload);
          if (eventsCount === 0) {
            break;
          }

          if (eventsCount < pageSize) {
            break;
          }
        }
      } catch (error) {
        console.warn('[VisitPedemontana] Deskline API pagination fallback failed:', error);
      }
    }

    if (desklineEventLinks.size > 0) {
      desklineEventLinks.forEach((url) => allEventLinks.add(url));
      console.log(`[VisitPedemontana] Added ${desklineEventLinks.size} links from Deskline API.`);
    }

    eventLinks = Array.from(allEventLinks).filter((url) => {
      if (includeRegex && !includeRegex.test(url)) {
        return false;
      }
      if (excludeRegex && excludeRegex.test(url)) {
        return false;
      }
      return true;
    });

    if (eventLinks.length > sourceConfig.maxLinksPerRun) {
      eventLinks = eventLinks.slice(0, sourceConfig.maxLinksPerRun);
    }

    console.log(`VisitPedemontana: collected ${eventLinks.length} potential event links across ${visitedPages.size} page(s).`);

    await closeBrowser(browser);
    browser = null;

    // 3. Filtra gli eventi già presenti (usa sourceUrl come ID esterno)
    const existingEvents = await prisma.event.findMany({
      where: {
        sourceUrl: { in: eventLinks },
      },
      select: { sourceUrl: true },
    });

    const existingUrls = new Set(
      existingEvents
        .map((e: { sourceUrl: string | null }) => e.sourceUrl)
        .filter(Boolean) as string[],
    );
    const newEventLinks = eventLinks.filter(url => !existingUrls.has(url));

    console.log(`VisitPedemontana: ${newEventLinks.length} new events to process.`);

    // 4. Processa i nuovi eventi uno per volta
    const processedEvents: number[] = [];
    const processedEventDetails: {
      id: number;
      title: string;
      date: string;
      time: string;
      location: string;
      sourceUrl: string | null;
    }[] = [];
    const duplicateEvents: {
      title: string;
      date: string;
      existingId: number;
    }[] = [];
    const dryRunStats = {
      wouldSave: 0,
      skippedPast: 0,
      skippedDuplicateByFields: 0,
    };
    const errors: { url: string; error: string }[] = [];
    const linkSummary: { url: string; visited: boolean; status: 'pending' | 'saved' | 'no-new-events' | 'error' }[] =
      newEventLinks.map(url => ({ url, visited: false, status: 'pending' }));

    for (const url of newEventLinks) {
      const summaryEntry = linkSummary.find(entry => entry.url === url) ||
        (() => {
          const entry = { url, visited: false, status: 'pending' as const };
          linkSummary.push(entry);
          return entry;
        })();

      let savedForThisUrl = false;
      try {
        const result = await processEventLink(url, { verbose: false });

        if (result.events && result.events.length > 0) {
          for (const eventData of result.events) {
            // Filtra gli eventi già passati (in base alla data estratta)
            if (eventData.date) {
              const eventDate = new Date(eventData.date);
              if (!isNaN(eventDate.getTime())) {
                const eventDay = new Date(eventDate);
                eventDay.setHours(0, 0, 0, 0);
                if (eventDay < today) {
                  if (dryRun) {
                    dryRunStats.skippedPast += 1;
                  }
                  continue;
                }
              }
            }

            // Duplicate check by title + date + location
            const candidateTitle = eventData.title || 'Senza titolo';
            const candidateDate = eventData.date || '';
            const candidateLocation = eventData.location || '';
            if (candidateTitle && candidateDate && candidateLocation) {
              const existing = await prisma.event.findFirst({
                where: {
                  title: candidateTitle,
                  date: candidateDate,
                  location: candidateLocation,
                },
              });
              if (existing) {
                duplicateEvents.push({ title: candidateTitle, date: candidateDate, existingId: existing.id });
                if (dryRun) {
                  dryRunStats.skippedDuplicateByFields += 1;
                }
                continue;
              }
            }

            if (dryRun) {
              dryRunStats.wouldSave += 1;
              continue;
            }

            let latitude: number | null = null;
            let longitude: number | null = null;
            if (eventData.location) {
              const coords = await geocodeLocation(eventData.location);
              latitude = coords.latitude;
              longitude = coords.longitude;
            }

            const savedEvent = await prisma.event.create({
              data: {
                title: eventData.title || 'Senza titolo',
                description: eventData.description || '',
                date: eventData.date || '',
                time: eventData.time || '',
                location: eventData.location || '',
                latitude,
                longitude,
                organizer: eventData.organizer || '',
                category: (eventData.category || 'other').toLowerCase().trim(),
                price: eventData.price || '',
                rawText: '',
                imageUrl: eventData.imageUrl,
                // Usa SEMPRE l'URL sorgente come chiave per deduplicare run futuri
                sourceUrl: url,
                externalId: getExternalIdFromUrl(url),
                origin: 'visitpedemontana',
              } as any,
            });

            processedEvents.push(savedEvent.id);
            processedEventDetails.push({
              id: savedEvent.id,
              title: savedEvent.title,
              date: savedEvent.date,
              time: savedEvent.time,
              location: savedEvent.location,
              sourceUrl: savedEvent.sourceUrl,
            });
            savedForThisUrl = true;
          }
        }
        summaryEntry.visited = true;
        summaryEntry.status = savedForThisUrl ? 'saved' : 'no-new-events';
      } catch (error) {
        console.error(`[VisitPedemontana] Error processing ${url}:`, error);
        errors.push({ url, error: error instanceof Error ? error.message : 'Unknown error' });
        summaryEntry.visited = true;
        summaryEntry.status = 'error';
      }
    }

    // 5. Revalidate cache se abbiamo nuovi eventi
    if (!dryRun && processedEvents.length > 0) {
      revalidatePath('/', 'layout');
      revalidatePath('/api/events', 'page');
    }

    console.log('[VisitPedemontana] Scraping summary (per link):');
    try {
      console.table(linkSummary);
    } catch {
      console.log(JSON.stringify(linkSummary, null, 2));
    }

    return NextResponse.json({
      status: dryRun ? 'dry-run' : 'success',
      dryRun,
      found: eventLinks.length,
      new: newEventLinks.length,
      processed: dryRun ? dryRunStats.wouldSave : processedEvents.length,
      events: processedEventDetails,
      duplicates: duplicateEvents,
      dryRunStats: dryRun ? dryRunStats : undefined,
      errors: errors.length > 0 ? errors : undefined,
      links: linkSummary,
    });
  } catch (error) {
    console.error('[VisitPedemontana] Cron job failed:', error);
    if (browser) await closeBrowser(browser);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
