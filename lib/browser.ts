import puppeteer from 'puppeteer-core';

// Importazione condizionale per evitare errori in ambiente locale
let chromium: any;
try {
  chromium = require('@sparticuz/chromium');
} catch (error) {
  console.log('⚠️ @sparticuz/chromium not available, using fallback configuration');
}

interface BrowserOptions {
  headless?: boolean;
  args?: string[];
}

export async function getBrowser(options: BrowserOptions = {}) {
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    // Ambiente locale - usa Puppeteer-core con browser di sistema o fallback
    console.log('🏠 Launching browser in local environment...');
    return await puppeteer.launch({
      headless: options.headless !== false,
      args: options.args || ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  // Ambiente Vercel/Production - usa Chromium AWS Lambda
  console.log('🚀 Launching browser in serverless environment...');
  
  if (!chromium) {
    throw new Error('Chromium package not available. Please ensure @sparticuz/chromium is installed.');
  }

  // Configurazione robusta per Vercel
  const baseArgs = [
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
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',
    '--hide-scrollbars',
    '--mute-audio',
  ];

  const args = chromium.args ? [...chromium.args, ...baseArgs] : baseArgs;

  let executablePath;
  try {
    executablePath = await chromium.executablePath({
      fontConfigPath: '/opt/fonts', // Path per i font su Vercel
    });
  } catch (error) {
    console.error('Failed to get chromium executable path:', error);
    // Fallback: prova senza configurazione font
    try {
      executablePath = await chromium.executablePath();
    } catch (fallbackError) {
      console.error('Chromium fallback also failed:', fallbackError);
      throw new Error('Chromium not available: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  return await puppeteer.launch({
    args,
    defaultViewport: chromium.defaultViewport || { width: 1280, height: 720 },
    executablePath,
    headless: chromium.headless !== false, // Default a true se non specificato
    ignoreDefaultArgs: ['--disable-extensions'],
    timeout: 30000, // 30 secondi timeout
  });
}

export async function closeBrowser(browser: any) {
  if (browser) {
    await browser.close();
  }
}