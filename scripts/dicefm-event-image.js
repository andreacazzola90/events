/**
 * Script to extract event images from dice.fm
 * Usage: 
 *   node dicefm-event-image.js <url>              # Standard mode with fallbacks
 *   node dicefm-event-image.js <url> --strict     # Strict mode (minimal fallbacks)
 */

import puppeteer from 'puppeteer';

// Shared setup logic for both modes
async function setupPage(url) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    return { browser, page };
}

// Standard mode with all fallbacks
async function getDiceFmEventImage(url) {
    const { browser, page } = await setupPage(url);

    // 1. Immagine dentro il container evento
    const eventImg = await page.evaluate(() => {
        const container = document.querySelector('.EventDetailsLayout__Container-sc-e27c8822-0.jbWxWb.hide-in-purchase-flow');
        if (container) {
            const img = container.querySelector('img');
            if (img && img.src && !img.src.includes('dice-fan-social.png') && !img.src.includes('favicon') && !img.src.includes('logo') && !img.src.includes('icon')) {
                return img.src;
            }
        }
        // 2. Immagine con classe che inizia per EventDetailsImage__Image-sc
        const diceImgs = Array.from(document.querySelectorAll('img')).filter(img => {
            return Array.from(img.classList).some(cls => cls.startsWith('EventDetailsImage__Image-sc'));
        });
        const diceMainImg = diceImgs.find(img => img.src && !img.src.includes('dice-fan-social.png'));
        if (diceMainImg) return diceMainImg.src;
        // 3. Immagine più grande della pagina (escludi icone)
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
        // 4. Fallback: prima immagine con src valido
        const firstImg = images.find(img => img.src);
        if (firstImg) return firstImg.src;
        return null;
    });

    await browser.close();
    return eventImg;
}

// Strict mode with minimal fallbacks
async function getDiceFmEventImageStrict(url) {
    const { browser, page } = await setupPage(url);

    const eventImg = await page.evaluate(() => {
        // 1. Immagine dentro il container layout evento
        const container = document.querySelector('.EventDetailsLayout__Container-sc-e27c8822-0.jbWxWb.hide-in-purchase-flow');
        if (container) {
            const img = container.querySelector('img');
            if (img && img.src && !img.src.includes('dice-fan-social.png') && !img.src.includes('favicon') && !img.src.includes('logo') && !img.src.includes('icon')) {
                return img.src;
            }
        }
        // 2. Immagine con classe .EventDetailsImage__Image
        const imgStrict = document.querySelector('img.EventDetailsImage__Image');
        if (imgStrict && imgStrict.src && !imgStrict.src.includes('dice-fan-social.png') && !imgStrict.src.includes('favicon') && !imgStrict.src.includes('logo') && !imgStrict.src.includes('icon')) {
            return imgStrict.src;
        }
        // 3. Immagine con classe che inizia per EventDetailsImage__Image-sc
        const diceImgs = Array.from(document.querySelectorAll('img')).filter(img => {
            return Array.from(img.classList).some(cls => cls.startsWith('EventDetailsImage__Image-sc'));
        });
        const diceMainImg = diceImgs.find(img => img.src && !img.src.includes('dice-fan-social.png'));
        if (diceMainImg) return diceMainImg.src;
        return null;
    });

    await browser.close();
    return eventImg;
}

// CLI usage
if (require.main === module) {
    const url = process.argv[2];
    const isStrict = process.argv.includes('--strict');

    if (!url) {
        console.error('Usage:');
        console.error('  node dicefm-event-image.js <url>              # Standard mode');
        console.error('  node dicefm-event-image.js <url> --strict     # Strict mode');
        process.exit(1);
    }

    const extractor = isStrict ? getDiceFmEventImageStrict : getDiceFmEventImage;
    extractor(url).then(img => {
        console.log('Event image:', img);
    }).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

export { getDiceFmEventImage, getDiceFmEventImageStrict };
