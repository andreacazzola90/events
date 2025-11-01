// Esegui con: node facebook-event-image.js <url>
import puppeteer from 'puppeteer';

async function getFacebookEventImage(url) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Prova a prendere l'immagine con vari metodi
    const imageUrl = await page.evaluate(() => {
        // 1. Facebook: img[data-imgperflogname]
        const fbImg = document.querySelector('img[data-imgperflogname]');
        if (fbImg && fbImg.src) return fbImg.src;

        // 2. og:image
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
        if (ogImage) return ogImage;

        // 3. Prima immagine grande
        const images = Array.from(document.querySelectorAll('img'));
        const large = images.find(img => img.width > 300 && img.height > 200 && img.src);
        if (large) return large.src;

        // 4. Screenshot fallback (handled outside)
        return null;
    });

    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
        // Screenshot fallback
        const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
        finalImageUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
    await browser.close();
    return finalImageUrl;
}

// CLI usage
if (require.main === module) {
    const url = process.argv[2];
    if (!url) {
        console.error('Usage: node facebook-event-image.js <url>');
        process.exit(1);
    }
    getFacebookEventImage(url).then(img => {
        console.log('Image URL:', img);
    }).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

export default getFacebookEventImage;
