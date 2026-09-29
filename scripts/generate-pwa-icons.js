/**
 * Generate PWA icons placeholder using Sharp
 * Run: node scripts/generate-pwa-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises');

const publicDir = path.join(__dirname, '../public');

// "E/S" monogram in the site's editorial style: cream background, black heavy type, accent slash.
// markScale shrinks the mark (maskable icons must fit the central 80% safe circle); radius rounds the corners.
async function generateIcon(size, filename, { markScale = 1, radius = 0 } = {}) {
  const fontSize = size * 0.38 * markScale;
  // librsvg has no 900 weight for the fallback fonts: a same-colour stroke thickens the letters.
  const stroke = fontSize * 0.037;
  const barWidth = size * 0.44 * markScale;
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * radius}" fill="#f1eee7"/>
      <text
        x="50%"
        y="${50 - 2 * markScale}%"
        text-anchor="middle"
        dominant-baseline="central"
        font-size="${fontSize}"
        font-weight="900"
        letter-spacing="${-fontSize * 0.02}"
        fill="#1d1d1b"
        stroke="#1d1d1b"
        stroke-width="${stroke}"
        stroke-linejoin="round"
        font-family="Inter, 'Helvetica Neue', 'Arial Black', Arial, sans-serif"
      >E<tspan fill="#d65a38" stroke="#d65a38">/</tspan>S</text>
      <rect x="${(size - barWidth) / 2}" y="${size * (0.5 + 0.22 * markScale)}" width="${barWidth}" height="${Math.max(1, size * 0.03 * markScale)}" fill="#d65a38"/>
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
    await fs.mkdir(path.join(publicDir, 'icons'), { recursive: true });
    await generateIcon(192, 'icons/pwa-192.png', { radius: 0.22 });
    await generateIcon(512, 'icons/pwa-512.png', { radius: 0.22 });
    await generateIcon(192, 'icons/pwa-maskable-192.png', { markScale: 0.8 });
    await generateIcon(512, 'icons/pwa-maskable-512.png', { markScale: 0.8 });
    await generateIcon(180, 'icons/apple-touch-icon.png');
    await generateIcon(32, 'favicon.ico');

    console.log('\n✨ All icons generated successfully!');
    console.log('📁 Location: /public/');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
  }
}

generateAllIcons();
