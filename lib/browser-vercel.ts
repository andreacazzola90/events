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
        args: [
          ...chromium.args,
          // Anti-detection args to appear more human-like
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--disable-extensions',
        ],
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
    // Add anti-detection args for local development too
    launchOptions.args = [
      ...(options.args || []),
      '--disable-blink-features=AutomationControlled',
      '--disable-features=VizDisplayCompositor',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-extensions',
    ];
  }

  try {
    console.log('🚀 Launching browser with options:', launchOptions);
    const browser = await puppeteer.launch(launchOptions);
    
    // Add user agent and headers setup for compatibility
    const originalNewPage = browser.newPage.bind(browser);
    browser.newPage = async function() {
      const page = await originalNewPage();
      
      try {
        // Set a more realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set realistic headers
        await page.setExtraHTTPHeaders({
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Cache-Control': 'max-age=0'
        });

        // Remove automation indicators
        await page.evaluateOnNewDocument(() => {
          // Remove webdriver property
          delete (window.navigator as any).webdriver;
          
          // Override the plugins property to use a custom getter
          Object.defineProperty(window.navigator, 'plugins', {
            get: function() {
              return [1, 2, 3, 4, 5]; // fake plugins
            },
          });
          
          // Override the languages property to use a custom getter
          Object.defineProperty(window.navigator, 'languages', {
            get: function() {
              return ['it-IT', 'it', 'en-US', 'en'];
            },
          });
          
          // Override the permissions property to use a custom getter
          Object.defineProperty(window.navigator, 'permissions', {
            get: function() {
              return {
                query: function() {
                  return Promise.resolve({ state: 'granted' });
                }
              };
            },
          });
        });

        // Set viewport to common desktop resolution
        await page.setViewport({
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        });

      } catch (headerError) {
        console.warn('⚠️ Could not set headers or execute stealth script:', headerError);
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
