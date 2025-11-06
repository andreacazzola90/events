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
                                  !!process.env.VERCEL_ENV;
  
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
      const executablePath = await chromium.executablePath();
      console.log('🎯 Chromium executable path:', executablePath);
      
      const browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          '--hide-scrollbars',
          '--disable-web-security',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--deterministic-fetch',
          '--disable-features=VizDisplayCompositor',
          '--single-process',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--memory-pressure-off',
          '--max_old_space_size=4096',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          ...(options.args || [])
        ],
        defaultViewport: { width: 1280, height: 720 },
        executablePath,
        headless: true,
        timeout: options.timeout || 30000,
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