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

  try {
    // 1. Apri la pagina lista eventi
    browser = await getBrowser({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const listUrl = 'https://visitpedemontana.com/news-ed-eventi/#/eventi';
    console.log('Navigating to VisitPedemontana events list...', listUrl);
    await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Dai un attimo di tempo all'app per caricare gli eventi (SPA con #/eventi)
    await page.waitForTimeout(3000);

    // 2. Estrai tutti i link agli eventi
    eventLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const origin = window.location.origin;

      const urls = anchors
        .map(a => {
          try {
            return new URL(a.href, origin).toString();
          } catch {
            return null;
          }
        })
        .filter((href): href is string => !!href)
        .filter(href => {
          // Considera solo link sul dominio visitpedemontana
          if (!href.includes('visitpedemontana.com')) return false;

          // Ignora la pagina di lista stessa e ancore hash pure
          if (href.endsWith('/news-ed-eventi/#/eventi') || href.endsWith('/news-ed-eventi/')) return false;

          const url = new URL(href);
          const path = url.pathname;

          // Mantieni solo URL che sembrano pagine dettaglio eventi
          // Es: /eventi/<slug> oppure /news-ed-eventi/<categoria>/<slug>
          const parts = path.split('/').filter(Boolean);
          if (parts.length < 2) return false;

          // se contiene "eventi" e ha qualcosa dopo, consideriamolo dettaglio
          const eventiIndex = parts.indexOf('eventi');
          return eventiIndex !== -1 && eventiIndex < parts.length - 1;
        });

      return Array.from(new Set(urls));
    });

    console.log(`VisitPedemontana: found ${eventLinks.length} potential event links.`);

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
    const errors: { url: string; error: string }[] = [];

    for (const url of newEventLinks) {
      try {
        console.log(`[VisitPedemontana] Processing: ${url}`);
        const result = await processEventLink(url);

        if (result.events && result.events.length > 0) {
          for (const eventData of result.events) {
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
              },
            });

            processedEvents.push(savedEvent.id);
            console.log(`[VisitPedemontana] Saved event: ${savedEvent.title} (ID: ${savedEvent.id})`);
          }
        } else {
          console.log(`[VisitPedemontana] No events extracted for URL: ${url}`);
        }
      } catch (error) {
        console.error(`[VisitPedemontana] Error processing ${url}:`, error);
        errors.push({ url, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // 5. Revalidate cache se abbiamo nuovi eventi
    if (processedEvents.length > 0) {
      revalidatePath('/', 'layout');
      revalidatePath('/api/events', 'page');
    }

    return NextResponse.json({
      status: 'success',
      found: eventLinks.length,
      new: newEventLinks.length,
      processed: processedEvents.length,
      errors: errors.length > 0 ? errors : undefined,
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
