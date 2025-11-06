import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    // Info ambiente
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      AWS_REGION: process.env.AWS_REGION,
      platform: process.platform,
      arch: process.arch,
      versions: process.versions,
      memory: process.memoryUsage()
    };

    console.log('🔍 Environment info:', envInfo);

    // Test import chromium
    let chromiumInfo = {};
    try {
      const chromium = await import('@sparticuz/chromium');
      const executablePath = await chromium.default.executablePath();
      chromiumInfo = {
        executablePath,
        args: chromium.default.args,
        version: 'loaded successfully'
      };
      console.log('✅ Chromium loaded successfully:', chromiumInfo);
    } catch (error) {
      console.error('❌ Failed to load chromium:', error);
      chromiumInfo = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test puppeteer import
    let puppeteerInfo = {};
    try {
      const puppeteer = await import('puppeteer-core');
      puppeteerInfo = { version: 'loaded' };
      console.log('✅ Puppeteer loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load puppeteer:', error);
      puppeteerInfo = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    return NextResponse.json({
      success: true,
      environment: envInfo,
      chromium: chromiumInfo,
      puppeteer: puppeteerInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}