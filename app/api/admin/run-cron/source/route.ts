import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processEventLink } from "../../../../../lib/event-processor";
import { getBrowser, closeBrowser } from "../../../../../lib/browser-vercel";
import { geocodeLocation } from "@/lib/geocoding";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../pages/api/auth/[...nextauth]";

export const maxDuration = 300;

function buildOptionalRegex(raw: string | null | undefined): RegExp | null {
  if (!raw) return null;
  try {
    return new RegExp(raw, "i");
  } catch {
    return null;
  }
}

/** Returns how many non-empty segments are in the URL pathname. */
function getPathDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Event detail pages are always deeper in the path hierarchy than the
 * listing page.  e.g. listUrl=/eventi  → candidate must be /eventi/slug
 * Catches category pages like /pedemontana-veneta or /eventi-a-thiene.
 * Also rejects URLs with hash fragments that look like SPA listing routes (#/eventi, #/list).
 */
function looksLikeDetailUrl(candidateUrl: string, listUrl: string): boolean {
  try {
    const u = new URL(candidateUrl);
    // Reject SPA hash-based listing routes (e.g. #/eventi, #/events)
    if (u.hash && /^#\/(eventi|events|list|calendario|agenda)/i.test(u.hash)) return false;
  } catch { /* ignore */ }

  const listDepth = getPathDepth(listUrl);
  if (listDepth < 1) return true; // listing is at root – can't infer depth
  return getPathDepth(candidateUrl) > listDepth;
}

/** Post-Groq sanity check: reject pages that didn't yield a real event.
 * Pass todayStr (YYYY-MM-DD) to also reject past-dated events. */
function isValidEventResult(
  eventData: { title?: string; date?: string; location?: string; description?: string },
  todayStr: string,
): boolean {
  const PLACEHOLDERS = ["non trovato", "not found", "non definito", "", undefined];
  const title = (eventData.title || "").trim();
  const date = (eventData.date || "").trim();
  const location = (eventData.location || "").trim().toLowerCase();
  const description = (eventData.description || "").toLowerCase();

  // Must have a non-placeholder title
  if (!title || PLACEHOLDERS.includes(title.toLowerCase())) return false;

  // Must have a plausible date (YYYY-MM-DD format) and must not be in the past
  if (!date || PLACEHOLDERS.includes(date.toLowerCase()) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date < todayStr) return false; // past event

  // Location must be meaningful (not just a placeholder)
  if (PLACEHOLDERS.includes(location) || location.startsWith("non definito")) return false;

  // Title patterns that indicate non-event pages
  const TITLE_BLACKLIST = [
    /^eventi\s+a\s+/i,                           // "EVENTI A SCHIO", "eventi a thiene"
    /^(tutti\s+gli\s+)?eventi$/i,                // "eventi", "tutti gli eventi"
    /^eventi\s+del\s+territorio/i,               // "eventi del territorio..."
    /^privacy\s*policy/i,                        // "Privacy Policy di..."
    /^cookie\s*policy/i,                         // "Cookie Policy"
    /^(termini|terms)\s*(di|of|e|&)/i,           // "Termini di servizio"
    /^il\s+tuo\s+carrello/i,                     // "Il tuo carrello è vuoto"
    /^(pagina|page)\s+(non\s+trovata|404)/i,     // "Pagina non trovata"
    /^(errore|error)\s*\d*/i,                    // "Errore 404"
    /^home(\s*page)?$/i,                         // "Home", "Homepage"
    /^(iscriviti|registrati|login|accedi)$/i,    // Auth pages
    /^contatt/i,                                 // "Contatti", "Contattaci"
    /^chi\s+siamo/i,                             // "Chi siamo"
    /^(newsletter|subscribe)/i,                  // "Newsletter"
  ];
  if (TITLE_BLACKLIST.some((re) => re.test(title))) return false;

  // Description must not contain leaked AI prompt text
  const PROMPT_LEAKS = [
    "rispondi solo con il json",
    "restituisci solo json",
    "sei un esperto analista",
    "non usare null o undefined",
    "formato output:",
  ];
  if (PROMPT_LEAKS.some((leak) => description.includes(leak))) return false;

  return true;
}

function getExternalIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || url;
  } catch {
    return url;
  }
}

/**
 * Tries to click a cookie-consent "accept" button if one is visible on the page.
 * Silently ignores errors (banner not present, already dismissed, etc.).
 */
async function dismissCookieBanner(page: any): Promise<void> {
  const ACCEPT_SELECTORS = [
    "#iubenda-cs-accept-btn",
    ".iubenda-cs-accept-btn",
    "button[id*='accept']",
    "button[class*='accept']",
    "a[id*='accept']",
    "a[class*='accept']",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button[id*='cookie'][id*='accept']",
    ".cc-accept",
    "#accept-all",
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
        const text: string = await btn.evaluate((el: Element) => (el.textContent || "").trim());
        if (ACCEPT_TEXT_RE.test(text)) {
          await btn.click();
          await new Promise((r) => setTimeout(r, 600));
          return;
        }
      } catch { /* ignore */ }
    }
  } catch { /* banner not present or already dismissed */ }
}

/** Encode a single SSE frame: `data: <json>\n\n` */
function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: NextRequest) {
  // We need to read body and validate auth *before* opening the stream
  let sourceId: number | null = null;
  let dryRun = false;

  try {
    const body = await request.json();
    sourceId = Number(body?.sourceId) || null;
    dryRun = body?.dryRun === true;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  }

  const cronSourceModel = (prisma as any).cronSource;
  if (!cronSourceModel) {
    return NextResponse.json({ error: "CronSource model not available" }, { status: 500 });
  }

  const source = await cronSourceModel.findUnique({ where: { id: sourceId } });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // Auth check
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const user = session.user as any;
  const email = (user.email || "").toLowerCase();
  const isAdmin =
    user.role === "admin" ||
    user.type === "admin" ||
    email === "andreacazzola90@gmail.com" ||
    email.startsWith("andreacazzola90@");
  if (!isAdmin) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // ─── Open SSE stream ────────────────────────────────────────────────────────
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  const send = (payload: Record<string, unknown>) => writer.write(sseEvent(payload));

  // Run the actual work asynchronously so we can return the Response immediately
  (async () => {
    let browser: any = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

    const includeRegex = buildOptionalRegex(source.includePattern);
    const excludeRegex = buildOptionalRegex(source.excludePattern);

    let listHost = "unknown";
    try {
      listHost = new URL(source.listUrl).host;
    } catch {
      // use fallback
    }

    const allEventLinks = new Set<string>();
    const linkSummary: {
      url: string;
      status: "pending" | "saved" | "no-new-events" | "error" | "duplicate" | "past";
      error?: string;
    }[] = [];

    try {
      // ─── 1. Navigate + collect links ────────────────────────────────────────
      browser = await getBrowser({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      );

      const visitedPages = new Set<string>();
      let currentUrl: string = source.listUrl;
      const maxPages: number = source.maxPages || 10;

      for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
        if (visitedPages.has(currentUrl)) break;
        visitedPages.add(currentUrl);

        console.log(`[run-cron/source:${source.id}] Page ${pageIndex + 1}: ${currentUrl}`);

        await page.goto(currentUrl, {
          waitUntil: "networkidle2",
          timeout: source.requestTimeoutMs || 60000,
        });

        // iubenda and similar cookie banners load lazily — wait 2s before trying to dismiss
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await dismissCookieBanner(page);

        if (source.waitMs > 2000) {
          await new Promise((resolve) => setTimeout(resolve, source.waitMs - 2000));
        }

        const { pageEventLinks, nextPageUrl } = await page.evaluate(
          ({
            eventLinkSelector,
            nextPageSelector,
            hostFilter,
          }: {
            eventLinkSelector: string;
            nextPageSelector: string | null;
            hostFilter: string;
          }) => {
            const toAbsolute = (href: string) => {
              try {
                return new URL(href, window.location.origin).toString();
              } catch {
                return href;
              }
            };

            const selectors = ["a[href]"];
            if (eventLinkSelector && eventLinkSelector !== "a[href]") {
              selectors.unshift(eventLinkSelector);
            }

            const anchors: HTMLAnchorElement[] = [];
            for (const sel of selectors) {
              document.querySelectorAll(sel).forEach((el) => {
                let anchor: HTMLAnchorElement | null = null;
                if (el instanceof HTMLAnchorElement) {
                  anchor = el;
                } else {
                  // Card/container selector: pick the primary link inside the card.
                  // Prefer the first anchor that wraps an img or has a meaningful href,
                  // otherwise fall back to the first anchor found.
                  const candidates = Array.from(
                    (el as Element).querySelectorAll<HTMLAnchorElement>("a[href]"),
                  ).filter((a) => {
                    const h = a.getAttribute("href") || "";
                    return h && !h.startsWith("#") && !h.startsWith("javascript:") && !h.startsWith("mailto:");
                  });
                  anchor =
                    candidates.find((a) => !!a.querySelector("img")) ||
                    candidates.find((a) => (a.textContent || "").trim().length > 2) ||
                    candidates[0] ||
                    null;
                }
                if (anchor && !anchors.includes(anchor)) anchors.push(anchor);
              });
            }

            const urls = anchors
              .map((a) => {
                try {
                  return toAbsolute(a.href);
                } catch {
                  return null;
                }
              })
              .filter((href): href is string => {
                if (!href) return false;
                if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
                if (href === "#") return false;
                try {
                  const parsed = new URL(href);
                  return parsed.host === hostFilter;
                } catch {
                  return false;
                }
              });

            let nextPageUrl: string | null = null;
            if (nextPageSelector) {
              const el = document.querySelector(nextPageSelector);
              if (el) {
                if (el instanceof HTMLAnchorElement && el.href && !el.href.endsWith("#")) {
                  // Direct anchor selector (backward compat)
                  nextPageUrl = toAbsolute(el.href);
                } else {
                  // Block/container selector — auto-detect next page link inside it
                  // Labels/aria patterns that indicate first/last page arrows (to be excluded)
                  const FIRST_LAST_RE = /prima\s*pagina|ultima\s*pagina|first\s*page|last\s*page|double.*arrow|go\s+to\s+first|go\s+to\s+last/i;
                  const ARROW_RE = /[›»→▶>]|\bnext\b|\bsuccessiv|\bavanti\b|\bdopo\b/i;
                  const relN = el.querySelector<HTMLAnchorElement>('a[rel="next"]');
                  if (relN?.href) {
                    nextPageUrl = toAbsolute(relN.href);
                  } else {
                    const ariaN = el.querySelector<HTMLAnchorElement>(
                      'a[aria-label*="next" i], a[aria-label*="successiv" i], a[aria-label*="prossim" i]',
                    );
                    if (ariaN?.href && !FIRST_LAST_RE.test(ariaN.getAttribute("aria-label") || "")) {
                      nextPageUrl = toAbsolute(ariaN.href);
                    } else {
                      // 1. Numbered: find active/current page then next number (preferred over arrows)
                      const active = el.querySelector<HTMLElement>(
                        ".active > a, a.active, [aria-current='page']",
                      );
                      if (active) {
                        const curNum = parseInt((active.textContent || "").trim(), 10);
                        if (!isNaN(curNum)) {
                          for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
                            if (parseInt((a.textContent || "").trim(), 10) === curNum + 1) {
                              nextPageUrl = toAbsolute(a.href);
                              break;
                            }
                          }
                        }
                      }
                      // 2. URL-based current page number fallback
                      if (!nextPageUrl) {
                        const pageMatch = window.location.href.match(/[?&]page=(\d+)|\/page\/(\d+)/i);
                        const curPage = pageMatch ? parseInt(pageMatch[1] || pageMatch[2], 10) : 1;
                        for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
                          if (parseInt((a.textContent || "").trim(), 10) === curPage + 1) {
                            nextPageUrl = toAbsolute(a.href);
                            break;
                          }
                        }
                      }
                      // 3. Arrow / text pattern — only if no numbered page found,
                      //    and only single arrows (exclude double arrows = first/last page)
                      if (!nextPageUrl) {
                        for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
                          const txt = (a.textContent || "").trim();
                          const aria = (a.getAttribute("aria-label") || "").trim();
                          if (FIRST_LAST_RE.test(aria) || FIRST_LAST_RE.test(txt)) continue;
                          // Skip SVG-only links that are likely first/last page double arrows
                          const svgType = a.querySelector("svg")?.getAttribute("type") || "";
                          if (/double/i.test(svgType)) continue;
                          const isImgOnly = txt === "" && !!a.querySelector("img, svg");
                          if (ARROW_RE.test(txt) || ARROW_RE.test(aria) || isImgOnly) {
                            nextPageUrl = toAbsolute(a.href);
                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            if (!nextPageUrl) {
              const relNext = document.querySelector<HTMLAnchorElement>('a[rel="next"]');
              if (relNext?.href) nextPageUrl = toAbsolute(relNext.href);
            }

            return { pageEventLinks: Array.from(new Set(urls)), nextPageUrl };
          },
          {
            eventLinkSelector: source.eventLinkSelector || "a[href]",
            nextPageSelector: source.nextPageSelector || null,
            hostFilter: listHost,
          },
        );

        for (const link of pageEventLinks) allEventLinks.add(link);
        await send({ type: "page", page: pageIndex + 1, found: pageEventLinks.length });

        if (!nextPageUrl) break;
        currentUrl = nextPageUrl;
      }

      await closeBrowser(browser);
      browser = null;

      // ─── 2. Filter by include/exclude regex ─────────────────────────────────
      let eventLinks = Array.from(allEventLinks).filter((url) => {
        if (includeRegex && !includeRegex.test(url)) return false;
        if (excludeRegex && excludeRegex.test(url)) return false;
        return true;
      });

      // ─── depth heuristic: drop links that look like listing/category pages ──
      const beforeDepthFilter = eventLinks.length;
      eventLinks = eventLinks.filter((url) => looksLikeDetailUrl(url, source.listUrl));
      const depthFiltered = beforeDepthFilter - eventLinks.length;

      if (eventLinks.length > (source.maxLinksPerRun || 200)) {
        eventLinks = eventLinks.slice(0, source.maxLinksPerRun || 200);
      }

      await send({ type: "links", total: allEventLinks.size, filtered: eventLinks.length, depthFiltered });

      // ─── 3. Skip already-known URLs ─────────────────────────────────────────
      const existingByUrl = await prisma.event.findMany({
        where: { sourceUrl: { in: eventLinks } },
        select: { sourceUrl: true },
      });
      const existingUrls = new Set(
        existingByUrl.map((e: { sourceUrl: string | null }) => e.sourceUrl).filter(Boolean) as string[],
      );
      const newEventLinks = eventLinks.filter((url) => !existingUrls.has(url));
      const skippedKnownCount = eventLinks.length - newEventLinks.length;

      await send({ type: "queue", newLinks: newEventLinks.length, alreadyKnown: skippedKnownCount });

      // ─── 4. Process each new link ────────────────────────────────────────────
      const savedEvents: {
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
        sourceUrl: string;
      }[] = [];

      const errors: { url: string; error: string }[] = [];

      const dryRunStats = { wouldSave: 0, skippedPast: 0, skippedDuplicate: 0 };

      let processedCount = 0;
      for (const url of newEventLinks) {
        processedCount++;
        const entry: (typeof linkSummary)[0] = { url, status: "pending" };
        linkSummary.push(entry);

        await send({ type: "processing", url, index: processedCount, total: newEventLinks.length });

        try {
          const result = await processEventLink(url, { verbose: false });

          let savedAny = false;

          for (const eventData of result.events || []) {
            // Skip results that don't look like real events (includes past-date check)
            if (!isValidEventResult(eventData, todayStr)) {
              const isPast = eventData.date && /^\d{4}-\d{2}-\d{2}$/.test(eventData.date) && eventData.date < todayStr;
              entry.status = isPast ? "past" : "no-new-events";
              if (isPast) {
                dryRunStats.skippedPast++;
                await send({ type: "skipped-past", title: eventData.title, date: eventData.date, url });
              }
              continue;
            }

            // Duplicate check by title+date+location
            const title = eventData.title || "Senza titolo";
            const date = eventData.date || "";
            const location = eventData.location || "";

            if (title && date && location) {
              const existing = await prisma.event.findFirst({
                where: { title, date, location },
              });
              if (existing) {
                duplicateEvents.push({ title, date, existingId: existing.id, sourceUrl: url });
                entry.status = "duplicate";
                if (dryRun) dryRunStats.skippedDuplicate++;
                await send({ type: "duplicate", title, date, existingId: existing.id });
                continue;
              }
            }

            if (dryRun) {
              dryRunStats.wouldSave++;
              entry.status = "saved";
              await send({ type: "dry-event", title, date, location, url });
              continue;
            }

            let latitude: number | null = null;
            let longitude: number | null = null;
            if (eventData.location) {
              const coords = await geocodeLocation(eventData.location);
              latitude = coords.latitude;
              longitude = coords.longitude;
            }

            const saved = await prisma.event.create({
              data: {
                title,
                description: eventData.description || "",
                date,
                time: eventData.time || "",
                location,
                latitude,
                longitude,
                organizer: eventData.organizer || "",
                category: (eventData.category || "other").toLowerCase().trim(),
                price: eventData.price || "",
                rawText: "",
                imageUrl: eventData.imageUrl,
                sourceUrl: url,
                externalId: getExternalIdFromUrl(url),
                origin: source.name.toLowerCase().replace(/\s+/g, "-"),
              } as any,
            });

            savedEvents.push({
              id: saved.id,
              title: saved.title,
              date: saved.date,
              time: saved.time,
              location: saved.location,
              sourceUrl: saved.sourceUrl,
            });
            savedAny = true;

            // Stream the new event card immediately
            await send({
              type: "event",
              event: {
                id: saved.id,
                title: saved.title,
                date: saved.date,
                time: saved.time,
                location: saved.location,
                sourceUrl: saved.sourceUrl,
                imageUrl: saved.imageUrl,
              },
            });
          }

          if (entry.status === "pending") {
            entry.status = savedAny ? "saved" : "no-new-events";
          }
        } catch (err) {
          console.error(`[run-cron/source:${source.id}] Error processing ${url}:`, err);
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push({ url, error: msg });
          entry.status = "error";
          entry.error = msg;
          await send({ type: "error", url, error: msg });
        }
      }

      // ─── 5. Revalidate cache ─────────────────────────────────────────────────
      if (!dryRun && savedEvents.length > 0) {
        revalidatePath("/", "layout");
        revalidatePath("/api/events", "page");
      }

      // Final summary event
      await send({
        type: "done",
        status: dryRun ? "dry-run" : "success",
        sourceId: source.id,
        sourceName: source.name,
        dryRun,
        found: eventLinks.length,
        alreadyKnown: skippedKnownCount,
        new: newEventLinks.length,
        saved: dryRun ? dryRunStats.wouldSave : savedEvents.length,
        duplicatesFound: duplicateEvents.length,
        errorsCount: errors.length,
        savedEvents,
        duplicates: duplicateEvents,
        errors: errors.length > 0 ? errors : undefined,
        links: linkSummary,
        dryRunStats: dryRun ? dryRunStats : undefined,
      });
    } catch (error) {
      console.error(`[run-cron/source:${sourceId}] Fatal error:`, error);
      if (browser) await closeBrowser(browser).catch(() => {});
      await send({
        type: "done",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(stream.readable as unknown as BodyInit, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
