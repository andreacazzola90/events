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
    const segments = u.pathname.split('/').filter(Boolean);
    // Usa l'ultimo segmento del path come id esterno (slug dell'evento)
    return segments[segments.length - 1] || url;
  } catch {
    return url;
  }
}

export async function GET(request: NextRequest) {
  // Controllo del secret per il cron (stessa logica di scrape-visitschio)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('--- STARTING VISITPEDEMONTANA SCRAPER CRON JOB ---');
  let browser: any = null;
  let eventLinks: string[] = [];

  // Considera "oggi" senza orario per filtrare gli eventi passati
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // 1. Apri la pagina lista eventi (con supporto alla paginazione)
    browser = await getBrowser({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const baseListUrl = 'https://visitpedemontana.com/news-ed-eventi/#/eventi';
    const visitedPages = new Set<string>();
    const allEventLinks = new Set<string>();
    let currentUrl = baseListUrl;
    const maxPages = 20;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      if (visitedPages.has(currentUrl)) {
        console.log(`[VisitPedemontana] Page already visited, stopping at ${currentUrl}`);
        break;
      }
      visitedPages.add(currentUrl);

      console.log(`[VisitPedemontana] Navigating to events list page ${pageIndex + 1}: ${currentUrl}`);
      await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Dai un attimo di tempo all'app per caricare gli eventi (SPA con #/eventi)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const { pageEventLinks, nextPageUrl, debugAnchors } = await page.evaluate(() => {
        const origin = window.location.origin;
        const toAbsolute = (href: string) => {
          try {
            return new URL(href, origin).toString();
          } catch {
            return href;
          }
        };

        const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];

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
            // Tieni solo link del dominio visitpedemontana, escludendo ovvi non-link
            if (!href.includes('visitpedemontana.com')) return false;
            if (href.endsWith('/news-ed-eventi/#/eventi') || href.endsWith('/news-ed-eventi/')) return false;
            if (href === '#' || href.endsWith('/#')) return false;
            if (href.startsWith('javascript:')) return false;

            // Per ora consideriamo tutti gli altri link del dominio come candidati
            return true;
          });

        let nextPageUrl: string | null = null;
        const relNext = document.querySelector('a[rel="next"]') as HTMLAnchorElement | null;
        if (relNext) {
          nextPageUrl = toAbsolute(relNext.href);
        } else {
          const candidates = anchors.filter(a => {
            const text = (a.textContent || '').trim();
            return /successiv|prossim|avanti|›|»/i.test(text);
          });
          if (candidates.length > 0) {
            nextPageUrl = toAbsolute(candidates[0].href);
          }
        }

        return {
          pageEventLinks: Array.from(new Set(urls)),
          nextPageUrl,
          debugAnchors: anchors.slice(0, 20).map(a => a.href),
        };
      });

      (pageEventLinks as string[]).forEach((url: string) => allEventLinks.add(url));

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

    eventLinks = Array.from(allEventLinks);
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
                continue;
              }
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
    if (processedEvents.length > 0) {
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
      status: 'success',
      found: eventLinks.length,
      new: newEventLinks.length,
      processed: processedEvents.length,
      events: processedEventDetails,
      duplicates: duplicateEvents,
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
