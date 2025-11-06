import { NextRequest, NextResponse } from 'next/server';
import { getBrowser, closeBrowser } from '../../../lib/browser-vercel';

export async function GET() {
    try {
        console.log('🧪 Testing browser functionality...');
        
        const browser = await getBrowser({
            headless: true,
        });
        
        console.log('✅ Browser launched successfully');
        
        const page = await browser.newPage();
        console.log('✅ New page created');
        
        await page.goto('https://httpbin.org/html', { 
            waitUntil: 'networkidle2',
            timeout: 10000 
        });
        console.log('✅ Navigation successful');
        
        const title = await page.title();
        console.log('✅ Title extracted:', title);
        
        await closeBrowser(browser);
        console.log('✅ Browser closed');
        
        return NextResponse.json({
            success: true,
            message: 'Browser test completed successfully',
            title,
            timestamp: new Date().toISOString(),
        });
        
    } catch (error) {
        console.error('❌ Browser test failed:', error);
        
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        }, { status: 500 });
    }
}