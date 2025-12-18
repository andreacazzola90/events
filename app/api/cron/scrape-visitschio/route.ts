import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processEventLink } from '../../../../lib/event-processor';
import { getBrowser, closeBrowser } from '../../../../lib/browser-vercel';
import { revalidatePath } from 'next/cache';

export const maxDuration = 300; // 5 minutes for the cron job

export async function GET(request: NextRequest) {
    // Check for Vercel Cron Secret or a custom secret
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('--- STARTING VISITSCHIO SCRAPER CRON JOB ---');
    let browser = null;
    let eventLinks: string[] = [];

    try {
        // 1. Scrape the events list page
        browser = await getBrowser({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        
        console.log('Navigating to VisitSchio events list...');
        await page.goto('https://www.visitschio.it/it/eventi', { waitUntil: 'networkidle2', timeout: 60000 });

        // Extract all event links
        eventLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/it/eventi/"]'));
            return links
                .map(a => (a as HTMLAnchorElement).href)
                .filter(href => {
                    // Filter out category links and keep only event detail links
                    // Event links usually have a slug or ID at the end
                    const parts = href.split('/');
                    return parts.length > 5 && !href.endsWith('/eventi') && !href.endsWith('/eventi/');
                });
        });

        // Remove duplicates
        eventLinks = [...new Set(eventLinks)];
        console.log(`Found ${eventLinks.length} potential event links.`);

        await closeBrowser(browser);
        browser = null;

        // 2. Filter out already existing events
        const existingEvents = await prisma.event.findMany({
            where: {
                sourceUrl: { in: eventLinks }
            },
            select: { sourceUrl: true }
        });
        const existingUrls = new Set(existingEvents.map(e => e.sourceUrl));
        const newEventLinks = eventLinks.filter(url => !existingUrls.has(url));

        console.log(`${newEventLinks.length} new events to process.`);

        // 3. Process new events (one by one to avoid overloading or timeouts)
        const processedEvents = [];
        const errors = [];

        for (const url of newEventLinks) {
            try {
                console.log(`Processing: ${url}`);
                const result = await processEventLink(url);
                
                if (result.events && result.events.length > 0) {
                    for (const eventData of result.events) {
                        // Save to database
                        const savedEvent = await prisma.event.create({
                            data: {
                                title: eventData.title || 'Senza titolo',
                                description: eventData.description || '',
                                date: eventData.date || '',
                                time: eventData.time || '',
                                location: eventData.location || '',
                                organizer: eventData.organizer || '',
                                category: (eventData.category || 'other').toLowerCase().trim(),
                                price: eventData.price || '',
                                rawText: '', // We don't have the full raw text here easily
                                imageUrl: eventData.imageUrl,
                                sourceUrl: url,
                            }
                        });
                        processedEvents.push(savedEvent.id);
                        console.log(`Saved event: ${savedEvent.title} (ID: ${savedEvent.id})`);
                    }
                }
            } catch (error) {
                console.error(`Error processing ${url}:`, error);
                errors.push({ url, error: error instanceof Error ? error.message : 'Unknown error' });
            }
        }

        // 4. Revalidate cache
        if (processedEvents.length > 0) {
            revalidatePath('/', 'layout');
            revalidatePath('/api/events', 'page');
        }

        return NextResponse.json({
            status: 'success',
            found: eventLinks.length,
            new: newEventLinks.length,
            processed: processedEvents.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Cron job failed:', error);
        if (browser) await closeBrowser(browser);
        return NextResponse.json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
