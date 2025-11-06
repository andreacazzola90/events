interface LaunchOptions {
  args?: string[];
  headless?: boolean;
  timeout?: number;
}

export async function getBrowser(options: LaunchOptions = {}) {
  const isVercel = !!process.env.VERCEL_ENV;
  let puppeteer: any,
    launchOptions: any = {
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
    };

  console.log('🚀 Launching browser...', { 
    isVercel, 
    platform: process.platform,
    arch: process.arch,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV
  });

  if (isVercel) {
    console.log('📦 Using Vercel serverless configuration');
    try {
      const chromium = (await import("@sparticuz/chromium")).default;
      puppeteer = await import("puppeteer-core");
      launchOptions = {
        ...launchOptions,
        args: chromium.args,
        executablePath: await chromium.executablePath(),
      };
      console.log('✅ Chromium configuration loaded for Vercel');
    } catch (error) {
      console.error('❌ Failed to load Vercel Chromium configuration:', error);
      throw error;
    }
  } else {
    console.log('🏠 Using local development configuration');
    puppeteer = await import("puppeteer");
    // Add local args if provided
    if (options.args) {
      launchOptions.args = options.args;
    }
  }

  try {
    console.log('🚀 Launching browser with options:', launchOptions);
    const browser = await puppeteer.launch(launchOptions);
    
    // Add user agent and headers setup for compatibility
    const originalNewPage = browser.newPage.bind(browser);
    browser.newPage = async function() {
      const page = await originalNewPage();
      
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
        console.warn('⚠️ Could not set headers:', headerError);
      }
      
      return page;
    };

    console.log('✅ Browser launched successfully');
    return browser;
    
  } catch (error) {
    console.error('❌ Failed to launch browser:', error);
    throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function closeBrowser(browser: any) {
  if (browser && typeof browser.close === 'function') {
    try {
      await browser.close();
      console.log('✅ Browser closed successfully');
    } catch (error) {
      console.error('❌ Error closing browser:', error);
    }
  }
}
