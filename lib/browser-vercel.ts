import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

interface LaunchOptions {
  args?: string[];
  headless?: boolean;
  timeout?: number;
}

export async function getBrowser(options: LaunchOptions = {}) {
  // Rileva se siamo su Vercel/produzione (più accurato)
  const isProduction = !!process.env.AWS_REGION || 
                       !!process.env.VERCEL || 
                       !!process.env.VERCEL_ENV || 
                       process.env.NODE_ENV === 'production';
  
  console.log('🚀 Launching browser...', { 
    isProduction, 
    platform: process.platform,
    arch: process.arch,
    VERCEL: !!process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    AWS_REGION: !!process.env.AWS_REGION,
    NODE_ENV: process.env.NODE_ENV
  });

  if (isProduction) {
    // Configurazione per Vercel/AWS Lambda seguendo la guida ufficiale
    console.log('📦 Using Vercel/Production configuration with @sparticuz/chromium');
    
    try {
      const executablePath = await chromium.executablePath();
      console.log('🎯 Chromium executable path:', executablePath);
      
      return await puppeteer.launch({
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
          ...(options.args || [])
        ],
        defaultViewport: { width: 1280, height: 720 },
        executablePath,
        headless: 'new',
        ignoreHTTPSErrors: true,
        timeout: options.timeout || 30000,
        ignoreDefaultArgs: ['--disable-extensions'],
      });
    } catch (error) {
      console.error('❌ Failed to launch with @sparticuz/chromium-min:', error);
      throw new Error(`Browser launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Configurazione per sviluppo locale
    console.log('🏠 Using local development configuration');
    
    // Prova prima con playwright-chromium (se disponibile)
    try {
      const playwrightChromium = require('playwright-chromium');
      console.log('✅ Found playwright-chromium, using it for local development');
      
      const browser = await playwrightChromium.chromium.launch({
        headless: options.headless !== false,
        args: options.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      // Wrapper per compatibilità API Puppeteer
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
          };
        },
        close: async () => {
          await browser.close();
        },
      };
    } catch (playwrightError) {
      console.log('⚠️ Playwright-chromium not available, trying local Chrome...');
      
      // Fallback: prova con Chrome locale
      const commonPaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
        '/usr/bin/google-chrome-stable', // Linux
        '/usr/bin/google-chrome', // Linux
        '/usr/bin/chromium-browser', // Linux
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
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