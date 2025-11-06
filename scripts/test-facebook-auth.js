// Test script per verificare l'autenticazione Facebook
// Esegui con: node scripts/test-facebook-auth.js

const { getBrowser, closeBrowser } = require('../lib/browser-vercel');
const { FacebookAuth } = require('../lib/facebook-auth');

async function testFacebookAuth() {
  console.log('🧪 Testing Facebook Authentication...');
  
  let browser = null;
  try {
    // Launch browser
    console.log('🚀 Launching browser...');
    browser = await getBrowser({ headless: false }); // Non-headless per debug
    
    const page = await browser.newPage();
    
    // Test URL Facebook
    const testUrl = 'https://www.facebook.com/events';
    
    console.log(`🔍 Testing authentication for: ${testUrl}`);
    
    // Attempt authentication
    const isAuthenticated = await FacebookAuth.authenticateIfNeeded(page, testUrl);
    
    if (isAuthenticated) {
      console.log('✅ Authentication successful!');
      
      // Navigate to the target page
      await page.goto(testUrl, { waitUntil: 'networkidle2' });
      
      // Check if we can access content
      const title = await page.title();
      console.log(`📄 Page title: ${title}`);
      
      // Take a screenshot for verification
      await page.screenshot({ path: 'facebook-auth-test.png' });
      console.log('📸 Screenshot saved as facebook-auth-test.png');
      
    } else {
      console.log('❌ Authentication failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
  }
}

// Run test
testFacebookAuth().catch(console.error);