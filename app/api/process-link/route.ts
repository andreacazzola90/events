import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import puppeteer from 'puppeteer';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL richiesto' }, { status: 400 });
        }

        console.log('Processing URL:', url);

        // Verifica che GROQ_API_KEY sia configurata
        if (!process.env.GROQ_API_KEY) {
            console.error('GROQ_API_KEY non configurata');
            return NextResponse.json(
                { error: 'API non configurata correttamente. Aggiungi GROQ_API_KEY alle variabili d\'ambiente.' },
                { status: 500 }
            );
        }

        // 1. Scrape della pagina con Puppeteer
        console.log('Launching browser...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        

        const page = await browser.newPage();
        // Imposta user-agent e header realistici
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
        });
        console.log('Navigating to URL...');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Estrai il testo della pagina
        console.log('Extracting page text...');
        const pageText = await page.evaluate(() => document.body.innerText);
        

        // Cerca immagini principali nella pagina (Facebook, og:image, twitter:image, itemprop, fallback)
        console.log('Looking for images...');
        const imageUrl = await page.evaluate(() => {

            // 1. Facebook: img[data-imgperflogname]
            const fbImg = document.querySelector('img[data-imgperflogname]');
            if (fbImg && (fbImg as HTMLImageElement).src) return (fbImg as HTMLImageElement).src;


            // 2. dice.fm: SOLO immagine evento reale (no icone)
            if (window.location.hostname.includes('dice.fm')) {
                // a. Immagine dentro il container layout evento
                const container = document.querySelector('.EventDetailsLayout__Container-sc-e27c8822-0.jbWxWb.hide-in-purchase-flow');
                if (container) {
                    const img = container.querySelector('img');
                    if (img && (img as HTMLImageElement).src && !(img as HTMLImageElement).src.includes('dice-fan-social.png') && !(img as HTMLImageElement).src.includes('favicon') && !(img as HTMLImageElement).src.includes('logo') && !(img as HTMLImageElement).src.includes('icon')) {
                        return (img as HTMLImageElement).src;
                    }
                }
                // b. Immagine con classe .EventDetailsImage__Image
                const imgStrict = document.querySelector('img.EventDetailsImage__Image');
                if (imgStrict && (imgStrict as HTMLImageElement).src && !(imgStrict as HTMLImageElement).src.includes('dice-fan-social.png') && !(imgStrict as HTMLImageElement).src.includes('favicon') && !(imgStrict as HTMLImageElement).src.includes('logo') && !(imgStrict as HTMLImageElement).src.includes('icon')) {
                    return (imgStrict as HTMLImageElement).src;
                }
                // c. Immagine con classe che inizia per EventDetailsImage__Image-sc
                const diceImgs = Array.from(document.querySelectorAll('img')).filter(img => {
                    return Array.from(img.classList).some(cls => cls.startsWith('EventDetailsImage__Image-sc'));
                });
                const diceMainImg = diceImgs.find(img => (img as HTMLImageElement).src && !(img as HTMLImageElement).src.includes('dice-fan-social.png') && !(img as HTMLImageElement).src.includes('favicon') && !(img as HTMLImageElement).src.includes('logo') && !(img as HTMLImageElement).src.includes('icon'));
                if (diceMainImg) return (diceMainImg as HTMLImageElement).src;
                // d. Fallback: nessuna immagine evento trovata
                return null;
            }


            // 3. og:image
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (ogImage) return ogImage;

            // 3b. og:image:secure_url
            const ogImageSecure = document.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content');
            if (ogImageSecure) return ogImageSecure;

            // 4. twitter:image
            const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
            if (twitterImage) return twitterImage;

            // 5. itemprop="image"
            const itempropImage = document.querySelector('[itemprop="image"]')?.getAttribute('content') || document.querySelector('[itemprop="image"]')?.getAttribute('src');
            if (itempropImage) return itempropImage;

            // 6. Immagine più grande della pagina (escludi icone)
            const images = Array.from(document.querySelectorAll('img'));
            let biggestImg = null;
            let maxArea = 0;
            for (const img of images) {
                const src = img.src || '';
                if (!src || src.includes('dice-fan-social.png') || src.includes('favicon') || src.includes('logo') || src.includes('icon')) continue;
                const area = img.naturalWidth * img.naturalHeight;
                if (area > maxArea) {
                    maxArea = area;
                    biggestImg = img;
                }
            }
            if (biggestImg) return biggestImg.src;

            // 7. Immagine più vicina al titolo dell'evento (se presente)
            const titleEl = document.querySelector('h1, .event-title, [data-testid="event-title"]');
            if (titleEl) {
                let closestImg = null;
                let minDist = Infinity;
                for (const img of images) {
                    if (!img.src) continue;
                    const dist = Math.abs(img.getBoundingClientRect().top - titleEl.getBoundingClientRect().top);
                    if (dist < minDist) {
                        minDist = dist;
                        closestImg = img;
                    }
                }
                if (closestImg) return closestImg.src;
            }

            // 8. Prima immagine <img> visibile con src valido
            const firstVisible = images.find(img => {
                const rect = img.getBoundingClientRect();
                return img.src && rect.width > 0 && rect.height > 0 && window.getComputedStyle(img).display !== 'none' && window.getComputedStyle(img).visibility !== 'hidden';
            });
            if (firstVisible) return firstVisible.src;

            // 9. Prima immagine <img> con src valido
            const firstImg = images.find(img => img.src);
            if (firstImg) return firstImg.src;

            return null;
        });

        let finalImageUrl = imageUrl;
        if (!finalImageUrl) {
            console.log('No image found, taking screenshot...');
            const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
            const screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');
            finalImageUrl = `data:image/jpeg;base64,${screenshotBase64}`;
        }

        await browser.close();
        console.log('Final image URL:', finalImageUrl ? 'Found' : 'Using screenshot');

        // 2. Usa Groq per estrarre le informazioni dell'evento
        console.log('Calling Groq API...');
        const prompt = `Estrai le informazioni dell'evento dal seguente testo di una pagina web.
Rispondi SOLO con un oggetto JSON valido nel seguente formato:
{
  "title": "Titolo evento",
  "description": "Descrizione dettagliata",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "Luogo completo",
  "organizer": "Organizzatore",
  "category": "Categoria",
  "price": "Prezzo (es: Gratis, 10€, etc.)"
}

Testo della pagina:
${pageText.slice(0, 8000)}

Rispondi SOLO con il JSON, senza altri testi o spiegazioni.`;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 1000,
        });


        const responseText = completion.choices[0]?.message?.content || '';
        console.log('Groq response:', responseText);

        // Migliora parsing: estrai la prima e l'ultima parentesi graffa
        let jsonStr = '';
        const first = responseText.indexOf('{');
        const last = responseText.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
            jsonStr = responseText.slice(first, last + 1);
        }
        let eventData = null;
        try {
            eventData = JSON.parse(jsonStr);
        } catch (err) {
            console.error('Errore parsing JSON Groq:', err, 'Testo:', responseText);
            throw new Error('Nessun JSON valido nella risposta di Groq. Risposta completa: ' + responseText);
        }

        // 3. Restituisci i dati dell'evento, assicurando che imageUrl sia associato
        const eventWithImage = { ...eventData, imageUrl: finalImageUrl };
        return NextResponse.json({
            events: [eventWithImage],
            imageUrl: finalImageUrl,
        });

    } catch (error) {
        console.error('Error processing link:', error);
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        return NextResponse.json(
            { error: `Errore durante l'elaborazione del link: ${errorMessage}` },
            { status: 500 }
        );
    }
}
