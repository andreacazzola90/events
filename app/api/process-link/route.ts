import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getBrowser, closeBrowser } from '../../../lib/browser-vercel';
import { EventData } from '../../types/event';
import { extractTextFromImageSimple } from '../../lib/ocr-simple';
import { extractTextFromImage } from '../../lib/ocr';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();
        
        if (!url) {
            return NextResponse.json(
                { error: 'URL mancante' },
                { status: 400 }
            );
        }

        console.log('Processing URL:', url);

        // Check if it's a Facebook URL and reject it
        const isFacebookUrl = url.includes('facebook.com') || 
                             url.includes('fb.me') || 
                             url.includes('fb.com') ||
                             url.includes('m.facebook.com');

        if (isFacebookUrl) {
            console.log('🚫 Facebook URL detected, rejecting request');
            return NextResponse.json(
                { error: 'Gli eventi di Facebook non possono essere scansionati, prova a fare uno screenshot' },
                { status: 400 }
            );
        }

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
            
            // Imposta user-agent e header realistici - questi verranno sovrascritti se il browser ha già impostazioni di default
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
            
            // Standard navigation
            let navigationSuccess = false;
            let lastError = null;
            const maxRetries = 3;
            
            {
                // Navigate to the URL
                for (let retry = 0; retry < maxRetries; retry++) {
                    try {
                        console.log(`Navigation attempt ${retry + 1}/${maxRetries}`);
                        
                        // Progressive timeouts for better reliability
                        const waitOptions = retry === 0 
                            ? { waitUntil: 'domcontentloaded' as const, timeout: 15000 }
                            : retry === 1 
                            ? { waitUntil: 'load' as const, timeout: 20000 }
                            : { waitUntil: 'networkidle2' as const, timeout: 30000 };
                        
                        // Simulate human-like behavior before navigation
                        console.log('🔄 Navigating with human-like behavior...');
                        
                        // Add random delay before navigation (500ms - 2s)
                        const preNavDelay = Math.floor(Math.random() * 1500) + 500;
                        await new Promise(resolve => setTimeout(resolve, preNavDelay));
                        
                        await page.goto(url, waitOptions);
                    
                        // Simulate human reading time and random mouse movements
                        console.log('📖 Simulating human reading behavior...');
                        
                        // Random delay after page load (2-4 seconds)
                        const postNavDelay = Math.floor(Math.random() * 2000) + 2000;
                        await new Promise(resolve => setTimeout(resolve, postNavDelay));
                    
                    // Simulate mouse movements and scrolling
                    try {
                        await page.evaluate(() => {
                            // Simulate random scrolling
                            const scrollAmount = Math.floor(Math.random() * 500) + 200;
                            window.scrollTo(0, scrollAmount);
                        });
                        
                        // Small delay after scrolling
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
            }
            
            if (!navigationSuccess) {
                throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts. Last error: ${lastError}`);
            }

            // Estrai il testo della pagina
            console.log('Extracting page text...');
            try {
                pageText = await page.evaluate(() => {
                    // Funzione per rimuovere elementi non correlati all'evento principale
                    const removeUnwantedElements = () => {
                        // Selettori di elementi da rimuovere (eventi correlati, sidebar, footer, header, nav, ads)
                        const unwantedSelectors = [
                            'header', 
                            'nav', 
                            'footer', 
                            '.sidebar', 
                            '.related-events', 
                            '.similar-events', 
                            '.recommended-events',
                            '.upcoming-events',
                            '.other-events',
                            '.more-events',
                            '.event-list',
                            '.events-list',
                            '[class*="sidebar"]',
                            '[class*="related"]',
                            '[class*="similar"]',
                            '[class*="recommended"]',
                            '[class*="upcoming"]',
                            '[id*="sidebar"]',
                            '[id*="related"]',
                            '[id*="similar"]',
                            '[id*="recommended"]',
                            'aside',
                            '.advertisement',
                            '.ad',
                            '[class*="ad-"]',
                            '[class*="banner"]',
                            '.cookie-notice',
                            '.cookie-banner',
                            '[role="complementary"]'
                        ];
                        
                        // Selettori specifici per visitSchio
                        const isVisitSchio = window.location.hostname.includes('visitschio.it');
                        if (isVisitSchio) {
                            // Aggiungi selettori specifici per visitSchio
                            unwantedSelectors.push(
                                '#navbar-event-show',
                                '.related_events',
                                '.altri-eventi',
                                '.eventi-correlati',
                                '[class*="eventi-correlati"]',
                                '[class*="related_events"]',
                                '[id*="eventi-correlati"]',
                                '[id*="related_events"]',
                                '.event-sidebar',
                                '.eventi-simili',
                                '.prossimi-eventi'
                            );
                        }
                        
                        // Clona il body per non modificare il DOM originale
                        const bodyClone = document.body.cloneNode(true) as HTMLElement;
                        
                        // Rimuovi elementi indesiderati
                        unwantedSelectors.forEach(selector => {
                            const elements = bodyClone.querySelectorAll(selector);
                            elements.forEach(el => el.remove());
                        });
                        
                        return bodyClone;
                    };
                    
                    // Estrai il contenuto principale
                    const getMainContent = () => {
                        // Logica specifica per visitSchio
                        const isVisitSchio = window.location.hostname.includes('visitschio.it');
                        if (isVisitSchio) {
                            console.log('[visitSchio] Using specific selectors for visitSchio.it');
                            
                            // Usa solo #event_description perché contiene già tutte le info dell'evento
                            const eventDescription = document.querySelector('#event_description');
                            
                            if (eventDescription) {
                                const descClone = eventDescription.cloneNode(true) as HTMLElement;
                                
                                // Rimuovi elementi indesiderati dal clone
                                const eventInterest = descClone.querySelector('#event_interest');
                                if (eventInterest) eventInterest.remove();
                                
                                const navbar = descClone.querySelector('#navbar-event-show');
                                if (navbar) navbar.remove();
                                
                                return descClone;
                            }
                            
                            // Fallback a #main.container-fluid solo se #event_description non esiste
                            const mainContainer = document.querySelector('#main.container-fluid');
                            if (mainContainer) {
                                const mainClone = mainContainer.cloneNode(true) as HTMLElement;
                                
                                // Rimuovi elementi indesiderati dal clone
                                const navbar = mainClone.querySelector('#navbar-event-show');
                                if (navbar) navbar.remove();
                                
                                const eventInterest = mainClone.querySelector('#event_interest');
                                if (eventInterest) eventInterest.remove();
                                
                                return mainClone;
                            }
                        }
                        
                        // Cerca il contenuto principale in ordine di priorità (per altri siti)
                        const mainSelectors = [
                            'main',
                            '[role="main"]',
                            '.main-content',
                            '.event-details',
                            '.event-info',
                            '.event-content',
                            '[class*="event-detail"]',
                            '[class*="event-info"]',
                            '[id*="event-detail"]',
                            '[id*="event-info"]',
                            'article',
                            '[itemtype*="Event"]'
                        ];
                        
                        for (const selector of mainSelectors) {
                            const element = document.querySelector(selector);
                            if (element && element.textContent && element.textContent.trim().length > 100) {
                                return element;
                            }
                        }
                        
                        // Fallback: usa body pulito
                        return removeUnwantedElements();
                    };
                    
                    const mainContent = getMainContent();
                    return (mainContent as HTMLElement)?.innerText || mainContent?.textContent || (document.body as HTMLElement)?.innerText || document.body?.textContent || '';
                });
                
                console.log(`📄 Extracted ${pageText.length} characters from main content`);
            } catch (textError) {
                console.warn('Could not extract page text:', textError);
                // Fallback: prova a prendere il titolo almeno
                try {
                    pageText = await page.evaluate(() => document.title || '');
                } catch (titleError) {
                    console.error('Could not extract even title:', titleError);
                    pageText = 'Unable to extract page content';
                }
            }
        

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

            finalImageUrl = imageUrl;
            if (!finalImageUrl) {
                console.log('No image found, taking screenshot...');
                const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
                const screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');
                finalImageUrl = `data:image/jpeg;base64,${screenshotBase64}`;
            }

            await closeBrowser(browser);
            console.log('Final image URL:', finalImageUrl ? 'Found' : 'Using screenshot');
            
            return { pageText, finalImageUrl };
                })(),
                scrapingTimeout
            ]);

            // Extract results from scrapingResult
            pageText = (scrapingResult as { pageText: string; finalImageUrl: string }).pageText;
            finalImageUrl = (scrapingResult as { pageText: string; finalImageUrl: string }).finalImageUrl;

        } catch (browserError) {
            console.error('Errore durante lo scraping con browser:', browserError);
            await closeBrowser(browser);
            
            // Check if it's a timeout error
            if (browserError instanceof Error && browserError.message.includes('timed out')) {
                return NextResponse.json(
                    { error: 'La richiesta ha impiegato troppo tempo. Riprova più tardi.' },
                    { status: 408 } // Request Timeout
                );
            }
            
            // Check if it's a Chromium shared library error
            if (browserError instanceof Error && (
                browserError.message.includes('libnss3.so') || 
                browserError.message.includes('Code: 127') ||
                browserError.message.includes('shared libraries')
            )) {
                console.log('🔄 Browser failed due to missing libraries, trying HTTP fallback...');
                
                try {
                    // Import and use HTTP fallback scraper
                    const { httpScraper } = await import('../../../lib/http-scraper');
                    const fallbackResult = await httpScraper(url);
                    pageText = fallbackResult.pageText;
                    finalImageUrl = fallbackResult.finalImageUrl;
                    
                    console.log('✅ HTTP fallback scraping successful');
                } catch (fallbackError) {
                    console.error('❌ HTTP fallback also failed:', fallbackError);
                    return NextResponse.json(
                        { error: 'Impossibile accedere alla pagina web. Il sito potrebbe non essere accessibile o avere restrizioni.' },
                        { status: 503 } // Service Unavailable
                    );
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
                
                // Scarica l'immagine se è un URL esterno
                let imageBlob: Blob;
                if (finalImageUrl.startsWith('data:')) {
                    // È già un data URL (screenshot)
                    const base64Data = finalImageUrl.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    imageBlob = new Blob([buffer], { type: 'image/jpeg' });
                } else {
                    // Scarica l'immagine dall'URL
                    const imageResponse = await fetch(finalImageUrl);
                    imageBlob = await imageResponse.blob();
                }

                // Converti Blob in File per l'OCR
                const imageFile = new File([imageBlob], 'event-image.jpg', { type: imageBlob.type });

                // Prova OCR semplificato
                try {
                    console.log('🔄 Trying simplified OCR on webpage image...');
                    imageText = await extractTextFromImageSimple(imageFile);
                    console.log('✅ OCR semplificato riuscito, testo estratto:', imageText.substring(0, 200));
                } catch (simpleOcrError) {
                    console.log('⚠️ OCR semplificato fallito, provo Tesseract...');
                    
                    try {
                        imageText = await extractTextFromImage(imageFile);
                        console.log('✅ Tesseract OCR riuscito');
                    } catch (tesseractError) {
                        console.warn('⚠️ OCR fallito su entrambi i metodi:', {
                            simple: simpleOcrError instanceof Error ? simpleOcrError.message : simpleOcrError,
                            tesseract: tesseractError instanceof Error ? tesseractError.message : tesseractError
                        });
                        // Non è fatale, continua senza testo dall'immagine
                    }
                }
            } catch (ocrError) {
                console.warn('⚠️ Impossibile processare l\'immagine con OCR:', ocrError);
                // Non è fatale, continua con solo il testo della pagina
            }
        }

        // Combina testo pagina + testo immagine
        let combinedText = pageText;
        if (imageText && imageText.trim().length > 10) {
            console.log(`📝 Testo dall'immagine trovato (${imageText.length} caratteri), combinando con testo pagina...`);
            combinedText = `TESTO DALLA PAGINA WEB:\n${pageText}\n\nTESTO DALL'IMMAGINE (OCR):\n${imageText}`;
        } else {
            console.log('📝 Nessun testo utile dall\'immagine, uso solo testo pagina');
        }

        // 2. Usa Groq per estrarre le informazioni dell'evento
        console.log('=== GROQ API CALL ===');
        console.log('Environment check:');
        console.log('- GROQ_API_KEY configured:', !!process.env.GROQ_API_KEY);
        console.log('- GROQ_API_KEY length:', process.env.GROQ_API_KEY?.length || 0);
        console.log('- Combined text length:', combinedText.length);
        console.log('- Combined text preview:', combinedText.slice(0, 200).replace(/\s+/g, ' '));
        console.log('- Platform:', process.env.VERCEL ? 'Vercel' : 'Local');
        
        if (!combinedText || combinedText.length < 50) {
            console.error('⚠️ WARNING: Combined text is too short or empty!');
            console.log('Full combinedText:', combinedText);
        }
        
        // Determina se ci sono eventi multipli analizzando il testo in modo intelligente
        const textLines = combinedText.split(/\n+/).filter(s => s.trim().length > 0);
        const dateMatches = combinedText.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g) || [];
        const uniqueDates = [...new Set(dateMatches)];
        const timeMatches = combinedText.match(/\d{1,2}:\d{2}/g) || [];
        
        // Cerca indicatori di eventi multipli
        const lowerText = combinedText.toLowerCase();
        const hasLineup = lowerText.includes('lineup') || lowerText.includes('line up') || lowerText.includes('line-up');
        const hasProgramma = lowerText.includes('programma') || lowerText.includes('program');
        const hasMultipleDays = lowerText.includes('giorno 1') || lowerText.includes('day 1') || 
                               lowerText.includes('sabato') && lowerText.includes('domenica');
        const hasVsOrWith = (combinedText.match(/\s+vs\s+/gi) || []).length > 0 || 
                           (combinedText.match(/\s+with\s+/gi) || []).length > 0 ||
                           (combinedText.match(/\s+&\s+/g) || []).length > 2;
        
        // Rileva cicli/rassegne: date diverse + stesso orario ripetuto
        const hasCyclePattern = uniqueDates.length >= 3 && timeMatches.length >= 3;
        
        // Rileva titoli in maiuscolo ripetuti (tipico di rassegne)
        const upperCaseTitles = combinedText.match(/^[A-Z\s]{3,}$/gm) || [];
        const hasMultipleTitles = upperCaseTitles.length >= 3;
        
        // Cerca parole chiave di cicli
        const hasCiclo = lowerText.includes('ciclo') || lowerText.includes('rassegna') || 
                         lowerText.includes('stagione') || lowerText.includes('incontri');
        
        // Determina se ci sono eventi multipli
        const hasMultipleEvents = (dateMatches.length > 1 && timeMatches.length > 1) || 
                                  textLines.length > 30 ||
                                  hasLineup || 
                                  hasProgramma ||
                                  hasMultipleDays ||
                                  (hasVsOrWith && (dateMatches.length > 1 || timeMatches.length > 2)) ||
                                  hasCyclePattern ||
                                  (hasCiclo && uniqueDates.length >= 2) ||
                                  hasMultipleTitles;
        
        console.log('🔍 Analisi eventi multipli:', {
            dateMatches: dateMatches.length,
            uniqueDates: uniqueDates.length,
            timeMatches: timeMatches.length,
            textLines: textLines.length,
            upperCaseTitles: upperCaseTitles.length,
            hasLineup,
            hasProgramma,
            hasMultipleDays,
            hasVsOrWith,
            hasCyclePattern,
            hasCiclo,
            hasMultipleTitles,
            conclusion: hasMultipleEvents ? 'EVENTI MULTIPLI' : 'EVENTO SINGOLO'
        });

        const currentDate = new Date().toISOString().split('T')[0];

        const prompt = hasMultipleEvents ? 
        // PROMPT PER EVENTI MULTIPLI
        `Sei un esperto analista di eventi. Questo contenuto contiene MULTIPLI EVENTI. Analizza attentamente ed estrai TUTTI gli eventi presenti.

PASSO 1 - IDENTIFICAZIONE:
Prima di tutto, CONTA quanti eventi distinti vedi NEL CONTENUTO PRINCIPALE (ignora eventi correlati/simili in sidebar).
Cerca SOLO nel contenuto principale:
- Nomi di artisti/band diversi
- Date diverse (anche se stesso orario e luogo - tipico di CICLI/RASSEGNE)
- Orari diversi nello stesso giorno
- Titoli di spettacoli/concerti diversi
- Divisioni visive (linee, box, sezioni ripetute)
- CICLI/RASSEGNE: eventi con date diverse ma stesso luogo/orario (es: "I Sabati dell'Arte")

IMPORTANTE: IGNORA completamente:
- Sezioni "Altri eventi", "Eventi correlati", "Ti potrebbe interessare"
- Sidebar con lista di eventi
- Eventi in date future non correlati
- Banner pubblicitari di altri eventi

ATTENZIONE CICLI E RASSEGNE:
Se vedi parole come "ciclo", "rassegna", "stagione", "incontri", "appuntamenti":
- OGNI DATA è un EVENTO SEPARATO
- Anche se hanno stesso orario e luogo
- Esempio: "29 novembre - Cleopatra", "6 dicembre - Ritratti", "13 dicembre - Giuditta" = 3 EVENTI

PASSO 2 - ESTRAZIONE DETTAGLIATA:
Per OGNI evento identificato, estrai TUTTE le informazioni disponibili:

ISTRUZIONI CRITICHE:
1. NON raggruppare eventi diversi insieme
2. OGNI evento DEVE avere il suo titolo unico
3. Se vedi "Artista A vs Artista B" o "Artista A & Artista B" nello stesso slot, è UN evento
4. Se vedi artisti in slot orari diversi, sono eventi SEPARATI
5. Se non sei sicuro, preferisci creare più eventi separati piuttosto che meno

REGOLE PER OGNI EVENTO:
- TITOLO: Deve essere UNICO e SPECIFICO (nome artista/band, titolo spettacolo)
  * Esempi CORRETTI: "Marco Carola DJ Set", "Teatro: Amleto", "Rock Night con The Beatles"
  * Esempi SBAGLIATI: "Evento 1", "Concerto", "Spettacolo"
- DESCRIZIONE: Crea una descrizione DETTAGLIATA e UNICA
  * Includi: artisti/ospiti, genere musicale/tipo, dettagli specifici, ospiti speciali
  * NON copiare l'intero testo grezzo
  * Esempio: "DJ set di techno con Marco Carola. Opening: Tale of Us. Musica elettronica underground."
- DATA e ORARIO: SPECIFICI per ogni evento
  * CONVERTI sempre in YYYY-MM-DD e HH:MM
  * Se manca l'anno, usa ${new Date().getFullYear()}
- LOCATION: Indirizzo completo (se uguale per tutti, ripetilo)
- PREZZO: Specifico per evento (se unico per tutti, applicalo a tutti)
- ORGANIZER: Se presente e condiviso, ripetilo
- CATEGORY: Dedotta dal tipo (musica/rock, musica/techno, teatro/commedia, sport/calcio, ecc.)

GESTIONE DATE:
- Data corrente di riferimento: ${currentDate}
- Se vedi "domani", "questo sabato", "prossimo weekend", calcolale rispetto a questa data
- Converti SEMPRE in formato YYYY-MM-DD

CONTENUTO DA ANALIZZARE:
${combinedText.slice(0, 12000)}

Rispondi SOLO con JSON array valido (senza markdown, senza testo aggiuntivo):
{
  "eventCount": 2,
  "events": [
    {
      "title": "Nome specifico evento 1",
      "description": "Descrizione dettagliata e unica per evento 1 con info specifiche",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "location": "Luogo completo",
      "organizer": "Organizzatore",
      "category": "Categoria specifica",
      "price": "Prezzo"
    },
    {
      "title": "Nome specifico evento 2",
      "description": "Descrizione dettagliata e unica per evento 2 con info specifiche",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "location": "Luogo completo",
      "organizer": "Organizzatore",
      "category": "Categoria specifica",
      "price": "Prezzo"
    }
  ]
}

IMPORTANTE: 
- Se c'è UN SOLO evento, restituisci eventCount: 1 con un solo oggetto nell'array
- Ogni evento DEVE avere titolo e descrizione UNICI e SPECIFICI
- Se un campo non è trovato, usa "" (stringa vuota)
- NON usare null o undefined`
        : 
        // PROMPT PER SINGOLO EVENTO
        `Estrai le informazioni dell'evento dal seguente testo di una pagina web.
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

GESTIONE DATE:
- Data corrente di riferimento: ${currentDate}
- Se vedi "domani", "questo sabato", "prossimo weekend", calcolale rispetto a questa data
- Converti SEMPRE in formato YYYY-MM-DD

CONTENUTO DA ANALIZZARE:
${combinedText.slice(0, 12000)}

Rispondi SOLO con il JSON, senza altri testi o spiegazioni.`;

        console.log('Calling Groq API with model: llama-3.1-8b-instant');
        const groqStartTime = Date.now();
        
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Sei un assistente AI esperto in analisi ed estrazione di informazioni da eventi.

CAPACITÀ:
- Comprensione del linguaggio naturale in italiano e inglese
- Riconoscimento di pattern di date, orari, prezzi
- Inferenza di informazioni da contesto visivo e testuale
- Gestione di formati multipli (pagine web, lineup, programmi)

REGOLE:
- Sii ESTREMAMENTE preciso nell'estrazione
- Per eventi multipli, crea descrizioni UNICHE per ogni evento
- NON inventare informazioni non presenti nel testo
- Usa il contesto per inferire solo quando c'è alta probabilità
- Formatta SEMPRE le date in YYYY-MM-DD
- Formatta SEMPRE gli orari in HH:MM
- Restituisci SOLO JSON valido, senza markdown o testo aggiuntivo`
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.1,
            max_tokens: 4000,
        });

        const groqDuration = Date.now() - groqStartTime;
        console.log(`Groq API responded in ${groqDuration}ms`);

        const responseText = completion.choices[0]?.message?.content || '';
        console.log('=== GROQ RESPONSE ===');
        console.log('Response length:', responseText.length);
        console.log('Response preview:', responseText.slice(0, 300));
        console.log('Full response:', responseText);

        // Parse JSON from response - cerca sia oggetto che array JSON
        let eventData = null;
        let first = responseText.indexOf('{');
        let last = responseText.lastIndexOf('}');
        
        // Se non trova oggetto, cerca array
        if (first === -1 || last === -1 || last <= first) {
            first = responseText.indexOf('[');
            last = responseText.lastIndexOf(']');
        }
        
        if (first === -1 || last === -1 || last <= first) {
            console.error('❌ No valid JSON found in response');
            throw new Error('Groq AI non ha restituito un JSON valido. Riprova.');
        }
        
        const jsonStr = responseText.slice(first, last + 1);
        console.log('🔍 Extracted JSON string (first 500 chars):', jsonStr.substring(0, 500));
        
        try {
            const parsedData = JSON.parse(jsonStr);
            console.log('📦 Parsed data structure:', JSON.stringify(parsedData, null, 2));
            
            // Gestisci sia evento singolo che eventi multipli
            if (parsedData.events && Array.isArray(parsedData.events)) {
                // Eventi multipli
                console.log(`✅ Estratti ${parsedData.eventCount} eventi`);
                console.log('Eventi estratti:', parsedData.events.map((e: { title: string }) => e.title));
                
                // Aggiungi imageUrl a ogni evento
                const eventsWithImage = parsedData.events.map((event: EventData) => ({
                    ...event,
                    imageUrl: finalImageUrl
                }));
                
                // Se c'è un solo evento, ritorna come oggetto singolo per retrocompatibilità
                if (eventsWithImage.length === 1) {
                    eventData = eventsWithImage[0];
                    console.log('📤 Returning single event from array');
                } else {
                    // Più eventi, ritorna con formato {events: [...]}
                    eventData = { events: eventsWithImage };
                    console.log(`📤 Returning ${eventsWithImage.length} events as array`);
                }
            } else {
                // Evento singolo (formato vecchio)
                eventData = parsedData;
                console.log('✅ Dati evento singolo estratti con successo');
            }
            
            console.log('📤 Final eventData:', JSON.stringify(eventData, null, 2));
        } catch (err) {
            console.error('❌ ERRORE CRITICO nel parsing JSON!');
            console.error('❌ Errore:', err);
            console.error('❌ Tipo errore:', err instanceof Error ? err.message : 'Unknown');
            console.error('❌ JSON string completo:', jsonStr);
            
            throw new Error('Impossibile interpretare i dati dell\'evento. Riprova.');
        }

        // 3. Restituisci i dati dell'evento
        // Se eventData contiene già un array di eventi, restituiscili direttamente
        // Altrimenti, wrappa il singolo evento in un array
        if (eventData.events && Array.isArray(eventData.events)) {
            return NextResponse.json({
                events: eventData.events,
                imageUrl: finalImageUrl,
            });
        } else {
            const eventWithImage = { ...eventData, imageUrl: finalImageUrl };
            return NextResponse.json({
                events: [eventWithImage],
                imageUrl: finalImageUrl,
            });
        }

    } catch (error) {
        console.error('Error processing link:', error);
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        return NextResponse.json(
            { error: `Errore durante l'elaborazione del link: ${errorMessage}` },
            { status: 500 }
        );
    }
}
