// Script per testare il browser helper robusto localmente
import { getBrowserRobust, closeBrowserRobust } from '../lib/browser-robust';

async function testBrowser() {
    console.log('🧪 Testing browser functionality...');
    
    try {
        console.log('1. Launching browser...');
        const browser = await getBrowserRobust();
        
        console.log('2. Creating new page...');
        const page = await browser.newPage();
        
        console.log('3. Navigating to a test page...');
        await page.goto('https://httpbin.org/html', { waitUntil: 'networkidle2' });
        
        console.log('4. Getting page title...');
        const title = await page.title();
        console.log('   Title:', title);
        
        console.log('5. Taking screenshot...');
        const screenshot = await page.screenshot({ type: 'png' });
        console.log('   Screenshot size:', screenshot.length, 'bytes');
        
        console.log('6. Closing browser...');
        await closeBrowserRobust(browser);
        
        console.log('✅ Browser test completed successfully!');
        
    } catch (error) {
        console.error('❌ Browser test failed:', error);
        process.exit(1);
    }
}

testBrowser();