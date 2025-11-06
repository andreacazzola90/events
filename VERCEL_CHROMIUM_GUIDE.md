# Vercel Deployment Guide - Chromium Setup

## Issue: "libnss3.so: cannot open shared object file"

This error occurs when deploying to Vercel because the serverless environment is missing shared libraries required by Chromium.

## Solution Applied

### 1. Updated Chromium Configuration

The `lib/browser-vercel.ts` file has been updated with:

- **Latest @sparticuz/chromium version** (131.0.0) with better serverless support
- **Enhanced error handling** for missing shared libraries
- **Ultra-minimal Chrome arguments** to avoid library dependencies
- **Multiple fallback mechanisms** for different serverless environments

### 2. Key Chrome Arguments for Serverless

```javascript
const args = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
  '--no-zygote',
  '--disable-software-rasterizer',
  '--disable-accelerated-2d-canvas',
  '--disable-web-security',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run'
];
```

### 3. Vercel Configuration (`vercel.json`)

```json
{
  "functions": {
    "app/api/*/route.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  },
  "build": {
    "env": {
      "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD": "true"
    }
  }
}
```

### 4. Environment Variables

Add these to your Vercel dashboard:
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`

### 5. Deploy to Vercel

```bash
# If using Vercel CLI
vercel --prod

# Or push to connected GitHub repo
git push origin main
```

## Troubleshooting

If you still encounter issues:

1. **Check Vercel Function Logs**: Look for specific error messages in the Vercel dashboard
2. **Increase Memory**: Try increasing function memory to 1024MB in vercel.json
3. **Increase Timeout**: Set maxDuration to 60 seconds for Chrome initialization
4. **Check Region**: Some Vercel regions might have different library availability

## Alternative Solutions

If the issue persists, consider:
1. Using **Playwright** instead of Puppeteer (available as fallback in local development)
2. Using external screenshot/scraping services like **Bannerbear** or **HTMLCSStoImage**
3. Moving browser operations to a dedicated service like **AWS Lambda** with custom layers

## Testing

Test the deployment with:

```bash
curl -X POST https://your-app.vercel.app/api/process-link \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.example.com"}'
```