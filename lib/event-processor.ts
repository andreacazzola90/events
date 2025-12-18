import Groq from 'groq-sdk';
import { getBrowser, closeBrowser } from './browser-vercel';
import { EventData } from '../app/types/event';
import { extractTextFromImageSimple } from '../app/lib/ocr-simple';
import { extractTextFromImage } from '../app/lib/ocr';
import { compressImage } from '../app/lib/image-utils';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function processEventLink(url: string) {
    console.log('Processing URL:', url);

    // Check if it's a Facebook URL and reject it
    const isFacebookUrl = url.includes('facebook.com') || 
                         url.includes('fb.me') || 
                         url.includes('fb.com') ||
                         url.includes('m.facebook.com');

    if (isFacebookUrl) {
        throw new Error('Gli eventi di Facebook non possono essere scansionati, prova a fare uno screenshot');
    }

    // Verifica che GROQ_API_KEY sia configurata
    if (!process.env.GROQ_API_KEY) {
        throw new Error('API non configurata correttamente. Aggiungi GROQ_API_KEY alle variabili d\'ambiente.');
    }

    // 1. Scrape della pagina con Puppeteer
    console.log('Launching browser...');
    let browser = null;
    let finalImageUrl: string | null = null;
    let pageText = '';

    // Create a timeout promise for the entire scraping operation
    const scrapingTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Scraping operation timed out after 50 seconds')), 50000);
    });

    try {
        // Wrap the entire scraping process in a race with timeout
        const scrapingResult = await Promise.race([
            (async () => {
                browser = await getBrowser({
                    headless: true,
                    timeout: 25000, // 25 second timeout for browser launch
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                });

                const page = await browser.newPage();
                
                try {
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
                    await page.setExtraHTTPHeaders({
                        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1'
                    });
                } catch (headerError) {
                    console.warn('Could not set headers (may already be set by browser):', headerError);
                }
                
                console.log('Navigating to URL...');
                
                let navigationSuccess = false;
                let lastError = null;
                const maxRetries = 3;
                
                for (let retry = 0; retry < maxRetries; retry++) {
                    try {
                        console.log(`Navigation attempt ${retry + 1}/${maxRetries}`);
                        
                        const waitOptions = retry === 0 
                            ? { waitUntil: 'domcontentloaded' as const, timeout: 15000 }
                            : retry === 1 
                            ? { waitUntil: 'load' as const, timeout: 20000 }
                            : { waitUntil: 'networkidle2' as const, timeout: 30000 };
                        
                        console.log('🔄 Navigating with human-like behavior...');
                        const preNavDelay = Math.floor(Math.random() * 1500) + 500;
                        await new Promise(resolve => setTimeout(resolve, preNavDelay));
                        
                        await page.goto(url, waitOptions);
                        
                        console.log('📖 Simulating human reading behavior...');
                        const postNavDelay = Math.floor(Math.random() * 2000) + 2000;
                        await new Promise(resolve => setTimeout(resolve, postNavDelay));
                    
                        try {
                            await page.evaluate(() => {
                                const scrollAmount = Math.floor(Math.random() * 500) + 200;
                                window.scrollTo(0, scrollAmount);
                            });
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (scrollError) {
                            console.warn('⚠️ Could not simulate scrolling:', scrollError);
                        }
                        navigationSuccess = true;
                        break;
                    } catch (navError) {
                        console.warn(`Navigation attempt ${retry + 1} failed:`, navError);
                        lastError = navError;
                        if (retry < maxRetries - 1) {
                            console.log('Retrying navigation in 1 second...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                if (!navigationSuccess) {
                    throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts. Last error: ${lastError}`);
                }

                console.log('Extracting page text...');
                try {
                    pageText = await page.evaluate(() => {
                        const removeUnwantedElements = () => {
                            const unwantedSelectors = [
                                'header', 'nav', 'footer', '.sidebar', '.related-events', '.similar-events', 
                                '.recommended-events', '.upcoming-events', '.other-events', '.more-events', 
                                '.event-list', '.events-list', '[class*="sidebar"]', '[class*="related"]', 
                                '[class*="similar"]', '[class*="recommended"]', '[class*="upcoming"]', 
                                '[id*="sidebar"]', '[id*="related"]', '[id*="similar"]', '[id*="recommended"]', 
                                'aside', '.advertisement', '.ad', '[class*="ad-"]', '[class*="banner"]', 
                                '.cookie-notice', '.cookie-banner', '[role="complementary"]'
                            ];
                            
                            const isVisitSchio = window.location.hostname.includes('visitschio.it');
                            if (isVisitSchio) {
                                unwantedSelectors.push(
                                    '#navbar-event-show', '.related_events', '.altri-eventi', '.eventi-correlati', 
                                    '[class*="eventi-correlati"]', '[class*="related_events"]', 
                                    '[id*="eventi-correlati"]', '[id*="related_events"]', '.event-sidebar', 
                                    '.eventi-simili', '.prossimi-eventi'
                                );
                            }
                            
                            const bodyClone = document.body.cloneNode(true) as HTMLElement;
                            unwantedSelectors.forEach(selector => {
                                const elements = bodyClone.querySelectorAll(selector);
                                elements.forEach(el => el.remove());
                            });
                            return bodyClone;
                        };
                        
                        const getMainContent = () => {
                            const isVisitSchio = window.location.hostname.includes('visitschio.it');
                            if (isVisitSchio) {
                                const eventDescription = document.querySelector('#event_description');
                                if (eventDescription) {
                                    const descClone = eventDescription.cloneNode(true) as HTMLElement;
                                    const eventInterest = descClone.querySelector('#event_interest');
                                    if (eventInterest) eventInterest.remove();
                                    const navbar = descClone.querySelector('#navbar-event-show');
                                    if (navbar) navbar.remove();
                                    const navbarGrid = descClone.querySelector('#navbar-collapse-grid');
                                    if (navbarGrid) navbarGrid.remove();
                                    return descClone;
                                }
                                
                                const mainContainer = document.querySelector('#main.container-fluid');
                                if (mainContainer) {
                                    const mainClone = mainContainer.cloneNode(true) as HTMLElement;
                                    const navbar = mainClone.querySelector('#navbar-event-show');
                                    if (navbar) navbar.remove();
                                    const navbarGrid = mainClone.querySelector('#navbar-collapse-grid');
                                    if (navbarGrid) navbarGrid.remove();
                                    const eventInterest = mainClone.querySelector('#event_interest');
                                    if (eventInterest) eventInterest.remove();
                                    return mainClone;
                                }
                            }
                            
                            const mainSelectors = [
                                'main', '[role="main"]', '.main-content', '.event-details', '.event-info', 
                                '.event-content', '[class*="event-detail"]', '[class*="event-info"]', 
                                '[id*="event-detail"]', '[id*="event-info"]', 'article', '[itemtype*="Event"]'
                            ];
                            
                            for (const selector of mainSelectors) {
                                const element = document.querySelector(selector);
                                if (element && element.textContent && element.textContent.trim().length > 100) {
                                    return element;
                                }
                            }
                            return removeUnwantedElements();
                        };
                        
                        const mainContent = getMainContent();
                        
                        let visitSchioInfo = '';
                        const isVisitSchio = window.location.hostname.includes('visitschio.it');
                        if (isVisitSchio) {
                            const bodyText = document.body.innerText || document.body.textContent || '';
                            const dataInizioMatch = bodyText.match(/Data Inizio:\s*(\d{1,2}\s+\w+\s+\d{2}:\d{2})/i);
                            const dataFineMatch = bodyText.match(/Fine:\s*(\d{1,2}\s+\w+\s+\d{2}:\d{2})/i);
                            
                            const iconsIndirizzo = document.querySelectorAll('i.icon-indirizzo');
                            let luogoText = '';
                            
                            if (iconsIndirizzo.length > 0) {
                                let bestLuogo = '';
                                iconsIndirizzo.forEach(icon => {
                                    const parent = icon.parentElement;
                                    if (parent) {
                                        const clone = parent.cloneNode(true) as HTMLElement;
                                        const iconInClone = clone.querySelector('i.icon-indirizzo');
                                        if (iconInClone) iconInClone.remove();
                                        let text = clone.innerText || clone.textContent || '';
                                        text = text.replace(/\s+/g, ' ').replace(/INDICAZIONI STRADALI/i, '').trim();
                                        if (text.toLowerCase().includes('schio') && (text.toLowerCase().includes('via') || text.toLowerCase().includes('piazza') || text.toLowerCase().includes('viale'))) {
                                            if (text.length > bestLuogo.length) {
                                                bestLuogo = text;
                                            }
                                        }
                                    }
                                });
                                luogoText = bestLuogo;
                            }

                            if (!luogoText) {
                                const bodyText = document.body.innerText || '';
                                const fullLocationMatch = bodyText.match(/([^\n\-]+)\s*-\s*(Via\s+[^\n,]+,\s*Schio)/i);
                                if (fullLocationMatch) {
                                    luogoText = `${fullLocationMatch[1].trim()} - ${fullLocationMatch[2].trim()}`;
                                }
                            }

                            if (!luogoText) {
                                const bodyText = document.body.innerText || '';
                                const luogoMatch = bodyText.match(/((?:Teatro|Cineforum|Palazzo|Auditorium)\s+[^\n,]+)\s+via\s+([^,\n]+),\s*Schio/i);
                                if (luogoMatch) {
                                    const nomeLocale = luogoMatch[1].trim();
                                    const via = luogoMatch[2].trim();
                                    luogoText = `${nomeLocale}, via ${via}, Schio`;
                                }
                            }

                            let prezzoText = '';
                            const infoBox = document.querySelector('.info_box-container');
                            if (infoBox) {
                                prezzoText = (infoBox as HTMLElement).innerText || infoBox.textContent || '';
                                prezzoText = prezzoText.replace(/\s+/g, ' ').trim();
                            }
                            
                            if (!prezzoText || (prezzoText.toLowerCase().includes('biglietti') && prezzoText.length < 20)) {
                                const bodyText = document.body.innerText || '';
                                const bigliettiMatch = bodyText.match(/Biglietti\s*[\n:]*\s*([^\n]+(?:\n[^\n]+)?)/i);
                                if (bigliettiMatch) {
                                    prezzoText = bigliettiMatch[0].trim();
                                }
                            }
                            
                            if (dataInizioMatch || luogoText || prezzoText) {
                                visitSchioInfo = `\n\n[VISITCHIO EVENT INFO]\n`;
                                if (dataInizioMatch) {
                                    visitSchioInfo += `Data Inizio: ${dataInizioMatch[1]}`;
                                    if (dataFineMatch) {
                                        visitSchioInfo += `\nFine: ${dataFineMatch[1]}`;
                                    }
                                    visitSchioInfo += '\n';
                                }
                                if (luogoText) {
                                    visitSchioInfo += `Luogo: ${luogoText}\n`;
                                }
                                if (prezzoText) {
                                    visitSchioInfo += `Prezzo Info: ${prezzoText}\n`;
                                }
                                visitSchioInfo += `[END VISITCHIO INFO]\n\n`;
                            }
                        }
                        
                        const mainText = (mainContent as HTMLElement)?.innerText || mainContent?.textContent || (document.body as HTMLElement)?.innerText || document.body?.textContent || '';
                        return visitSchioInfo + mainText;
                    });
                    console.log(`📄 Extracted ${pageText.length} characters from main content`);
                } catch (textError) {
                    console.warn('Could not extract page text:', textError);
                    try {
                        pageText = await page.evaluate(() => document.title || '');
                    } catch (titleError) {
                        console.error('Could not extract even title:', titleError);
                        pageText = 'Unable to extract page content';
                    }
                }
            
                console.log('Looking for images...');
                const imageUrl = await page.evaluate(() => {
                    const fbImg = document.querySelector('img[data-imgperflogname]');
                    if (fbImg && (fbImg as HTMLImageElement).src) return (fbImg as HTMLImageElement).src;

                    if (window.location.hostname.includes('dice.fm')) {
                        const container = document.querySelector('.EventDetailsLayout__Container-sc-e27c8822-0.jbWxWb.hide-in-purchase-flow');
                        if (container) {
                            const img = container.querySelector('img');
                            if (img && (img as HTMLImageElement).src && !(img as HTMLImageElement).src.includes('dice-fan-social.png') && !(img as HTMLImageElement).src.includes('favicon') && !(img as HTMLImageElement).src.includes('logo') && !(img as HTMLImageElement).src.includes('icon')) {
                                return (img as HTMLImageElement).src;
                            }
                        }
                        const imgStrict = document.querySelector('img.EventDetailsImage__Image');
                        if (imgStrict && (imgStrict as HTMLImageElement).src && !(imgStrict as HTMLImageElement).src.includes('dice-fan-social.png') && !(imgStrict as HTMLImageElement).src.includes('favicon') && !(imgStrict as HTMLImageElement).src.includes('logo') && !(imgStrict as HTMLImageElement).src.includes('icon')) {
                            return (imgStrict as HTMLImageElement).src;
                        }
                        const diceImgs = Array.from(document.querySelectorAll('img')).filter(img => {
                            return Array.from(img.classList).some(cls => cls.startsWith('EventDetailsImage__Image-sc'));
                        });
                        const diceMainImg = diceImgs.find(img => (img as HTMLImageElement).src && !(img as HTMLImageElement).src.includes('dice-fan-social.png') && !(img as HTMLImageElement).src.includes('favicon') && !(img as HTMLImageElement).src.includes('logo') && !(img as HTMLImageElement).src.includes('icon'));
                        if (diceMainImg) return (diceMainImg as HTMLImageElement).src;
                        return null;
                    }

                    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
                    if (ogImage) return ogImage;

                    const ogImageSecure = document.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content');
                    if (ogImageSecure) return ogImageSecure;

                    const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
                    if (twitterImage) return twitterImage;

                    const itempropImage = document.querySelector('[itemprop="image"]')?.getAttribute('content') || document.querySelector('[itemprop="image"]')?.getAttribute('src');
                    if (itempropImage) return itempropImage;

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

                    const firstVisible = images.find(img => {
                        const rect = img.getBoundingClientRect();
                        return img.src && rect.width > 0 && rect.height > 0 && window.getComputedStyle(img).display !== 'none' && window.getComputedStyle(img).visibility !== 'hidden';
                    });
                    if (firstVisible) return firstVisible.src;

                    const firstImg = images.find(img => img.src);
                    if (firstImg) return firstImg.src;

                    return null;
                });

                finalImageUrl = imageUrl;
                if (!finalImageUrl) {
                    console.log('No image found, taking screenshot...');
                    const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
                    const screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');
                    finalImageUrl = `data:image/jpeg;base64,${screenshotBase64}`;
                }

                await closeBrowser(browser);
                return { pageText, finalImageUrl };
            })(),
            scrapingTimeout
        ]);

        pageText = (scrapingResult as any).pageText;
        finalImageUrl = (scrapingResult as any).finalImageUrl;

    } catch (browserError) {
        console.error('Errore durante lo scraping con browser:', browserError);
        await closeBrowser(browser);
        
        if (browserError instanceof Error && browserError.message.includes('timed out')) {
            throw new Error('La richiesta ha impiegato troppo tempo. Riprova più tardi.');
        }
        
        if (browserError instanceof Error && (
            browserError.message.includes('libnss3.so') || 
            browserError.message.includes('Code: 127') ||
            browserError.message.includes('shared libraries')
        )) {
            console.log('🔄 Browser failed due to missing libraries, trying HTTP fallback...');
            try {
                const { httpScraper } = await import('./http-scraper');
                const fallbackResult = await httpScraper(url);
                pageText = fallbackResult.pageText;
                finalImageUrl = fallbackResult.finalImageUrl;
                console.log('✅ HTTP fallback scraping successful');
            } catch (fallbackError) {
                console.error('❌ HTTP fallback also failed:', fallbackError);
                throw new Error('Impossibile accedere alla pagina web. Il sito potrebbe non essere accessibile o avere restrizioni.');
            }
        } else {
            throw new Error('Errore durante l\'accesso alla pagina web: ' + (browserError instanceof Error ? browserError.message : 'Errore sconosciuto'));
        }
    }

    // 1b. Estrai testo dall'immagine con OCR se disponibile
    let imageText = '';
    if (finalImageUrl) {
        try {
            console.log('🔍 Analizzando l\'immagine con OCR...');
            let imageBlob: Blob;
            if (finalImageUrl.startsWith('data:')) {
                const base64Data = finalImageUrl.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                imageBlob = new Blob([buffer], { type: 'image/jpeg' });
            } else {
                const imageResponse = await fetch(finalImageUrl);
                imageBlob = await imageResponse.blob();
            }

            const rawImageFile = new File([imageBlob], 'event-image.jpg', { type: imageBlob.type });
            const imageFile = await compressImage(rawImageFile, 1024 * 1024);

            try {
                console.log('🔄 Trying simplified OCR on webpage image...');
                imageText = await extractTextFromImageSimple(imageFile);
            } catch (simpleOcrError) {
                console.log('⚠️ OCR semplificato fallito, provo Tesseract...');
                try {
                    imageText = await extractTextFromImage(imageFile);
                } catch (tesseractError) {
                    console.warn('⚠️ OCR fallito su entrambi i metodi');
                }
            }
        } catch (ocrError) {
            console.warn('⚠️ Impossibile processare l\'immagine con OCR:', ocrError);
        }
    }

    let combinedText = pageText;
    if (imageText && imageText.trim().length > 10) {
        combinedText = `TESTO DALLA PAGINA WEB:\n${pageText}\n\nTESTO DALL'IMMAGINE (OCR):\n${imageText}`;
    }

    // 2. Usa Groq per estrarre le informazioni dell'evento
    console.log('=== GROQ API CALL ===');
    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `Estrai le informazioni dell'evento dal seguente testo di una pagina web.
Rispondi SOLO con un oggetto JSON valido nel seguente formato:
{
  "title": "Titolo evento",
  "description": "Descrizione dettagliata (MINIMO 100 CARATTERI - se breve, elabora il contesto)",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "Luogo completo (Includi SEMPRE nome locale + indirizzo, es: 'Cineforum Altovicentino - Via Pietro Maraschin 81, Schio')",
  "organizer": "Organizzatore",
  "category": "Categoria",
  "price": "Prezzo (es: Gratuito, 10€, Offerta Libera, etc.)"
}

GESTIONE PREZZO:
- Estrai il prezzo esatto dal testo.
- Se vedi prezzi numerici (es: "€5", "10€", "Ridotto 5€"), usa QUELLI.
- Se l'evento è gratuito (es. "gratis", "ingresso libero"), usa "Gratuito".
- Se è esplicitamente indicato come offerta, usa "Offerta Libera".
- IMPORTANTE: NON usare "Offerta Libera" se trovi dei prezzi numerici o se non sei sicuro.
- Se non trovi NESSUNA informazione sul prezzo, lascia il campo VUOTO ("").
- PRIORITÀ: Se vedi [VISITCHIO EVENT INFO] con "Prezzo Info:", usa QUELLA informazione come priorità assoluta.

GESTIONE CATEGORIA:
- Suggerisci una di queste se appropriata: musica, nightlife, cultura, cibo, sport, famiglia, teatro, festa, passeggiata, altro.
- Altrimenti usa una categoria specifica (es. "conferenza", "workshop").

GESTIONE DATE:
- Data corrente di riferimento: ${currentDate}
- ATTENZIONE: Se vedi [VISITCHIO DATE TIME INFO] con "Data Inizio:" usa QUELLA data e orario
- Formato date visitSchio: "23 gen 21:00" → converti in formato YYYY-MM-DD e HH:MM
- Mesi: gen=01, feb=02, mar=03, apr=04, mag=05, giu=06, lug=07, ago=08, set=09, ott=10, nov=11, dic=12
- REGOLA ANNO:
  * Se l'anno È GIÀ SPECIFICATO nella data (es: "23 gen 2026", "2025-02-15"): MANTIENI L'ANNO ESISTENTE
  * Se l'anno NON è specificato (es: "23 gen", "15/02"): calcola in base alla data corrente
    - Se il mese/giorno è già passato quest'anno, usa l'anno PROSSIMO (${new Date().getFullYear() + 1})
    - Se il mese/giorno è futuro quest'anno, usa l'anno CORRENTE (${new Date().getFullYear()})
- PRIORITÀ: Usa sempre i dati da [VISITCHIO DATE TIME INFO] se presenti
- Se vedi "domani", "questo sabato", "prossimo weekend", calcolale rispetto a questa data
- Converti SEMPRE in formato YYYY-MM-DD

CONTENUTO DA ANALIZZARE:
${combinedText.slice(0, 12000)}

Rispondi SOLO con il JSON, senza altri testi o spiegazioni.`;

    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: `Sei un assistente AI esperto in analisi ed estrazione di informazioni da eventi. Restituisci SOLO JSON valido.`
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
        model: 'llama-3.1-8b-instant',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 5000,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    let first = responseText.indexOf('{');
    let last = responseText.lastIndexOf('}');
    
    if (first === -1 || last === -1 || last <= first) {
        throw new Error('Groq AI non ha restituito un JSON valido.');
    }
    
    const jsonStr = responseText.slice(first, last + 1);
    const parsedData = JSON.parse(jsonStr);
    
    // Normalize to array of events
    let events: EventData[] = [];
    if (parsedData.events && Array.isArray(parsedData.events)) {
        events = parsedData.events;
    } else {
        events = [parsedData];
    }

    // Add metadata
    events = events.map(event => ({
        ...event,
        imageUrl: finalImageUrl || undefined,
        sourceUrl: url
    }));

    // Enrichment logic
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const missing = [];
        if (!event.date) missing.push('data');
        if (!event.time) missing.push('orario');
        if (!event.location) missing.push('luogo');
        
        if (missing.length > 0) {
            const enrichmentPrompt = `Analizza nuovamente il testo e cerca SOLO le info mancanti (${missing.join(', ')}) per l'evento: ${event.title}. 
            Testo: ${combinedText.slice(0, 5000)}. 
            Data rif: ${currentDate}. 
            Rispondi SOLO JSON.`;
            
            try {
                const enrichComp = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: enrichmentPrompt }],
                    model: 'llama-3.1-8b-instant',
                    response_format: { type: 'json_object' },
                    temperature: 0.1,
                });
                const enrichData = JSON.parse(enrichComp.choices[0]?.message?.content || '{}');
                if (enrichData.date) event.date = enrichData.date;
                if (enrichData.time) event.time = enrichData.time;
                if (enrichData.location) event.location = enrichData.location;
                if (enrichData.price) event.price = enrichData.price;
                if (enrichData.organizer) event.organizer = enrichData.organizer;
            } catch (e) {}
        }
    }

    return {
        events,
        imageUrl: finalImageUrl,
    };
}
