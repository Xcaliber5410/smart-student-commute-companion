# Icon Conversion Instructions

The SVG icons have been generated. For production use, they should be converted to PNG format.

## Quick Conversion Options

### Option 1: Using vite-plugin-pwa (Recommended)
Install the plugin which will auto-generate PNG icons:
```bash
npm install -D vite-plugin-pwa
```

Then update `vite.config.js` (see PWA_SETUP.md)

### Option 2: Online Conversion
1. Visit https://svgtopng.com or https://cloudconvert.com/svg-to-png
2. Upload each SVG file from this directory
3. Download PNG versions with the same filename

### Option 3: ImageMagick CLI
If you have ImageMagick installed:
```bash
for file in *.svg; do
  convert "$file" "${file%.svg}.png"
done
```

### Option 4: Sharp CLI
Using Node.js sharp package:
```bash
npm install -g sharp-cli
sharp -i icon-*.svg -o . -f png
```

## Temporary Solution
For development, modern browsers support SVG in manifest.json, so the app will work with SVG icons. However, PNG is recommended for maximum compatibility.
