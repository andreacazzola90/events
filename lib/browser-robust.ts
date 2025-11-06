// Browser helper alternativo per Vercel con multiple strategie
import puppeteer from 'puppeteer-core';

interface BrowserOptions {
  headless?: boolean;
  args?: string[];
}

// Strategia 1: Puppeteer con Chromium ottimizzato
async function tryPuppeteerChromium(options: BrowserOptions = {}) {
  console.log('🧪 Trying Puppeteer with @sparticuz/chromium...');
  
  try {
    console.log('Loading @sparticuz/chromium...');
    const chromium = require('@sparticuz/chromium');
    console.log('✅ Chromium package loaded');
    
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--hide-scrollbars',
      '--mute-audio',
      ...(chromium.args || []),
      ...(options.args || []),
    ];

    console.log('Getting chromium executable path...');
    const executablePath = await chromium.executablePath();
    console.log('✅ Executable path obtained:', executablePath);
    
    console.log('Launching puppeteer...');
    return await puppeteer.launch({
      args,
      defaultViewport: chromium.defaultViewport || { width: 1280, height: 720 },
      executablePath,
      headless: options.headless !== false,
      timeout: 30000,
    });
  } catch (error) {
    console.error('❌ Puppeteer with chromium failed:', error);
    throw error;
  }
}

// Strategia 2: Playwright come fallback
async function tryPlaywright(options: BrowserOptions = {}) {
  console.log('🧪 Trying Playwright with bundled chromium...');
  
  try {
    console.log('Loading playwright-chromium...');
    const { chromium } = require('playwright-chromium');
    console.log('✅ Playwright-chromium package loaded');
    
    console.log('Launching Playwright browser...');
    const browser = await chromium.launch({
      headless: options.headless !== false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        ...(options.args || []),
      ],
    });
    console.log('✅ Playwright browser launched');

    // Wrapper semplificato per compatibilità con l'API Puppeteer
    let currentContext: any = null;
    
    return {
      ...browser,
      newPage: async () => {
        // Creiamo il context con configurazioni di base
        currentContext = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const page = await currentContext.newPage();
        
        // Aggiungi metodi compatibili con Puppeteer
        return {
          ...page,
          setUserAgent: async (userAgent: string) => {
            // Per Playwright, semplicemente logga - userAgent è già impostato
            console.log('UserAgent set via context:', userAgent);
          },
          setExtraHTTPHeaders: (headers: Record<string, string>) => currentContext.setExtraHTTPHeaders(headers),
          goto: (url: string, options?: any) => {
            // Converti le opzioni Puppeteer in opzioni Playwright
            const playwrightOptions = { ...options };
            if (options?.waitUntil === 'networkidle2') {
              playwrightOptions.waitUntil = 'networkidle';
            }
            return page.goto(url, playwrightOptions);
          },
          evaluate: (fn: any) => page.evaluate(fn),
          screenshot: (options?: any) => {
            // Converti le opzioni screenshot se necessario
            const playwrightOptions = { ...options };
            if (options?.type === 'jpeg') {
              playwrightOptions.type = 'jpeg';
            }
            return page.screenshot(playwrightOptions);
          },
          title: () => page.title(),
        };
      },
      close: async () => {
        if (currentContext) await currentContext.close();
        await browser.close();
      },
    };
  } catch (error) {
    console.error('❌ Playwright failed:', error);
    throw error;
  }
}

// Strategia 3: Puppeteer locale (per sviluppo)
async function tryLocalPuppeteer(options: BrowserOptions = {}) {
  console.log('🧪 Trying local Puppeteer...');
  
  // Percorsi comuni per Chrome/Chromium su diversi sistemi
  const commonPaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  
  for (const executablePath of commonPaths) {
    try {
      console.log(`Trying executablePath: ${executablePath}`);
      const fs = require('fs');
      
      // Verifica se il file esiste (solo su sistemi che supportano fs.existsSync)
      try {
        if (!fs.existsSync(executablePath)) continue;
      } catch (e) {
        // Se fs.existsSync fallisce, prova comunque il path
      }
      
      const browser = await puppeteer.launch({
        headless: options.headless !== false,
        executablePath,
        args: options.args || ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      console.log('✅ Local Puppeteer launched with:', executablePath);
      return browser;
    } catch (error) {
      console.log(`Failed with ${executablePath}:`, (error as Error).message);
      continue;
    }
  }
  
  throw new Error('No working Chrome/Chromium executable found in common paths');
}

// Strategia 4: Backup minimalista
async function tryMinimalBackup(options: BrowserOptions = {}) {
  console.log('🧪 Trying minimal backup strategy...');
  
  // Questa strategia è solo per completezza, Playwright dovrebbe sempre funzionare
  throw new Error('Minimal backup strategy - all other strategies should have worked');
}

export async function getBrowserRobust(options: BrowserOptions = {}) {
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  
  console.log('🚀 Starting browser launch process...');
  console.log('Environment:', { isProduction, VERCEL: !!process.env.VERCEL, NODE_ENV: process.env.NODE_ENV });
  
  // Prova sempre tutte le strategie disponibili (Playwright per primo perché più affidabile)
  const strategies = [
    { name: 'Playwright', fn: tryPlaywright },
    { name: 'Puppeteer + Chromium', fn: tryPuppeteerChromium },
    { name: 'Local Puppeteer', fn: tryLocalPuppeteer },
    { name: 'Minimal Backup', fn: tryMinimalBackup },
  ];

  for (const { name, fn } of strategies) {
    try {
      console.log(`🧪 Trying strategy: ${name}`);
      const browser = await fn(options);
      console.log(`✅ Success with strategy: ${name}`);
      return browser;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Strategy '${name}' failed:`, errorMsg);
      errors.push(`${name}: ${errorMsg}`);
    }
  }

  const fullError = `All browser strategies failed:\n${errors.join('\n')}`;
  console.error('💥 Complete failure:', fullError);
  throw new Error(fullError);
}

export async function closeBrowserRobust(browser: any) {
  if (browser && typeof browser.close === 'function') {
    try {
      await browser.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }
}