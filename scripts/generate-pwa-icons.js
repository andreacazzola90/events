/**
 * Generate PWA icons placeholder using Sharp
 * Run: node scripts/generate-pwa-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

// Create a simple icon with gradient background and text
async function generateIcon(size, filename) {
    const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
      <text 
        x="50%" 
        y="50%" 
        text-anchor="middle" 
        dy=".35em" 
        font-size="${size * 0.5}" 
        fill="white" 
        font-family="Arial, sans-serif"
      >📅</text>
    </svg>
  `;

    const buffer = Buffer.from(svg);

    await sharp(buffer)
        .resize(size, size)
        .png()
        .toFile(path.join(publicDir, filename));

    console.log(`✅ Generated ${filename} (${size}x${size})`);
}

async function generateAllIcons() {
    console.log('🎨 Generating PWA icons...\n');

    try {
        await generateIcon(192, 'icon-192x192.png');
        await generateIcon(512, 'icon-512x512.png');

        // Also generate favicon
        await generateIcon(32, 'favicon.ico');

        console.log('\n✨ All icons generated successfully!');
        console.log('📁 Location: /public/');
    } catch (error) {
        console.error('❌ Error generating icons:', error);
    }
}

generateAllIcons();
