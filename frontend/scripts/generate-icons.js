/**
 * PWA Icon Generator Script
 * 
 * Generates PWA icons in multiple sizes from an SVG source.
 * Uses Node.js built-in modules only (no external dependencies required).
 * 
 * The icons use the project's brand color (emerald-500: #10b981) and
 * a layered map/route symbol representing transit navigation.
 * 
 * Run: node scripts/generate-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '../public/icons');

// Create icons directory if it doesn't exist
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon sizes to generate
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// SVG template with dynamic size
const generateSVG = (size, maskable = false) => {
  const padding = maskable ? size * 0.2 : 0; // 20% padding for maskable icons
  const innerSize = size - (padding * 2);
  const scale = innerSize / 24; // Base SVG is 24x24 viewBox
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${maskable ? `<rect width="${size}" height="${size}" fill="#10b981"/>` : ''}
  <g transform="translate(${padding}, ${padding}) scale(${scale})">
    <!-- Layered map/route symbol -->
    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="${maskable ? '#ffffff' : '#10b981'}" opacity="0.9"/>
    <path d="M2 12l10 5 10-5" stroke="${maskable ? '#ffffff' : '#10b981'}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.7"/>
    <path d="M2 17l10 5 10-5" stroke="${maskable ? '#ffffff' : '#10b981'}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>
  </g>
</svg>`;
};

// Generate standard icons
sizes.forEach(size => {
  const svg = generateSVG(size, false);
  const filename = `icon-${size}x${size}.png`;
  const svgPath = path.join(iconsDir, `icon-${size}x${size}.svg`);
  
  fs.writeFileSync(svgPath, svg);
  console.log(`✓ Generated ${filename} (SVG)`);
});

// Generate maskable icons (with safe zone padding)
[192, 512].forEach(size => {
  const svg = generateSVG(size, true);
  const filename = `icon-maskable-${size}x${size}.png`;
  const svgPath = path.join(iconsDir, `icon-maskable-${size}x${size}.svg`);
  
  fs.writeFileSync(svgPath, svg);
  console.log(`✓ Generated ${filename} (SVG, maskable)`);
});

// Generate favicon
const faviconSVG = generateSVG(32, false);
fs.writeFileSync(path.join(__dirname, '../public/favicon.svg'), faviconSVG);
console.log('✓ Generated favicon.svg');

console.log('\n✅ Icon generation complete!');
console.log('\nNote: SVG icons generated. For production, consider converting to PNG using:');
console.log('  - Online tools like https://svgtopng.com');
console.log('  - CLI tools like sharp-cli or imagemagick');
console.log('  - Build-time plugin like vite-plugin-pwa');
