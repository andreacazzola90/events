// Test script per verificare la gestione automatica delle modali Facebook
// Esegui con: node scripts/test-facebook-modals.js

const { getBrowser, closeBrowser } = require('../lib/browser-vercel');
const { FacebookAuth } = require('../lib/facebook-auth');

async function testFacebookModals() {
  console.log('🧪 Testing Facebook Modal Handling...');
  
  let browser = null;
  try {
    // Launch browser (non-headless for visual verification)
    console.log('🚀 Launching browser...');
    browser = await getBrowser({ headless: false });
    
    const page = await browser.newPage();
    
    // Test with a public Facebook event URL
    const testUrl = 'https://www.facebook.com/events/explore/';
    
    console.log(`🔍 Testing modal handling for: ${testUrl}`);
    
    // Test the new navigation system
    const success = await FacebookAuth.navigateToFacebookEvent(page, testUrl);
    
    if (success) {
      console.log('✅ Successfully navigated and handled modals!');
      
      // Wait a bit to see the result
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take a screenshot
      await page.screenshot({ path: 'facebook-modal-test.png' });
      console.log('📸 Screenshot saved as facebook-modal-test.png');
      
    } else {
      console.log('❌ Modal handling failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (browser) {
      console.log('🔄 Waiting 10 seconds before closing browser...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      await closeBrowser(browser);
    }
  }
}

// Run test
testFacebookModals().catch(console.error);