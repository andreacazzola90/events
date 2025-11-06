import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

interface LaunchOptions {
  args?: string[];
  headless?: boolean;
  timeout?: number;
}

export async function getBrowser(options: LaunchOptions = {}) {
  // More precise detection: only use Vercel configuration when actually running on Vercel/AWS
  const isServerlessEnvironment = !!process.env.AWS_REGION || 
                                  !!process.env.VERCEL || 
                                  !!process.env.VERCEL_ENV ||
                                  !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  console.log('🚀 Launching browser...', { 
    isServerlessEnvironment, 
    platform: process.platform,
    arch: process.arch,
    VERCEL: !!process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    AWS_REGION: !!process.env.AWS_REGION,
    NODE_ENV: process.env.NODE_ENV
  });

  if (isServerlessEnvironment) {
    console.log('📦 Using serverless configuration with @sparticuz/chromium');
    
    try {
      // Set Chromium font configuration for serverless environment
      console.log('🔧 Setting up Chromium for serverless environment...');
      
      console.log('�🔄 Getting Chromium executable path...');
      const executablePath = await chromium.executablePath();
      console.log('🎯 Chromium executable path:', executablePath);
      
      // Args specifically designed for AWS Lambda/Vercel serverless environment
      // These args help with missing shared libraries like libnss3.so
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-ipc-flooding-protection',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-domain-reliability',
        '--disable-features=AudioServiceOutOfProcess'
      ];
      
      console.log('🚀 Launching browser with enhanced args...');
      const browser = await puppeteer.launch({
        args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: true,
        timeout: options.timeout || 45000, // Reduced from 60s to 45s
        ignoreDefaultArgs: ['--disable-extensions'],
      });

      const originalNewPage = browser.newPage.bind(browser);
      browser.newPage = async function() {
        const page = await originalNewPage();
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
        return page;
      };

      return browser;
    } catch (error) {
      console.error('❌ Failed to launch with @sparticuz/chromium:', error);
      console.error('🔍 Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Handle specific serverless environment errors
      if (error instanceof Error && (
        error.message.includes('brotli files') || 
        error.message.includes('does not exist') ||
        error.message.includes('libnss3.so') ||
        error.message.includes('shared libraries') ||
        error.message.includes('Code: 127')
      )) {
        console.log('🛠️ Attempting to resolve serverless environment library issue...');
        
        // Prova a reinstanziare chromium con un approccio diverso
        try {
          console.log('🔄 Attempting minimal Chromium setup...');
          
          // Get the executable path again
          const alternativeExecutablePath = await chromium.executablePath();
          
          // Use ultra-minimal args for environments with missing shared libraries
          const minimalArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees,VizDisplayCompositor',
            '--disable-accelerated-2d-canvas',
            '--disable-web-security',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run'
          ];
          
          const browser = await puppeteer.launch({
            args: minimalArgs,
            executablePath: alternativeExecutablePath,
            headless: true,
            timeout: 120000, // Longer timeout for initialization
            ignoreDefaultArgs: ['--disable-extensions']
          });
          
          console.log('✅ Minimal Chromium setup successful');
          return browser;
        } catch (alternativeError) {
          console.error('❌ Alternative setup also failed:', alternativeError);
          console.log('🔄 Trying fallback to local Chromium detection...');
          
          // Fallback: try to use local chromium if available
          try {
            const browser = await puppeteer.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
              timeout: 60000
            });
            console.log('✅ Fallback to local Chromium successful');
            return browser;
          } catch (fallbackError) {
            console.error('❌ All Chromium launch attempts failed');
          }
        }
      }
      
      throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    console.log('🏠 Using local development configuration');
    
    try {
      const { chromium: playwrightChromium } = require('playwright');
      console.log('✅ Found playwright, using it for local development');
      
      const browser = await playwrightChromium.launch({
        headless: options.headless !== false,
        args: options.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      return {
        ...browser,
        newPage: async () => {
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
          });
          const page = await context.newPage();
          
          return {
            ...page,
            setUserAgent: async () => { /* Already set via context */ },
            setExtraHTTPHeaders: (headers: Record<string, string>) => context.setExtraHTTPHeaders(headers),
            goto: (url: string, opts?: any) => {
              const gotoOptions = { ...opts };
              if (opts?.waitUntil === 'networkidle2') {
                gotoOptions.waitUntil = 'networkidle';
              }
              return page.goto(url, gotoOptions);
            },
            evaluate: (fn: any) => page.evaluate(fn),
            screenshot: (opts?: any) => page.screenshot(opts),
            title: () => page.title(),
            waitForTimeout: async (ms: number) => {
              await new Promise(resolve => setTimeout(resolve, ms));
            },
          };
        },
        close: async () => {
          await browser.close();
        },
      };
    } catch (playwrightError) {
      console.log('⚠️ Playwright not available, trying local Chrome...');
      
      const commonPaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ];

      for (const executablePath of commonPaths) {
        try {
          const fs = require('fs');
          if (fs.existsSync && fs.existsSync(executablePath)) {
            console.log(`✅ Found local Chrome at: ${executablePath}`);
            return await puppeteer.launch({
              executablePath,
              headless: options.headless !== false,
              args: options.args || ['--no-sandbox', '--disable-setuid-sandbox'],
              timeout: options.timeout || 30000,
            });
          }
        } catch (error) {
          continue;
        }
      }
      
      throw new Error('No suitable browser found for local development. Please install Chrome or use playwright-chromium.');
    }
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