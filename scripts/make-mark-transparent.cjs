/**
 * Builds assets/mark.png from assets/icon.png by clearing light matte / fake
 * checkerboard pixels so the gradient D can sit on any header background.
 *
 * Requires: npm i sharp --no-save --legacy-peer-deps
 * Run: node scripts/make-mark-transparent.cjs
 */
const sharp = require('sharp');
const path = require('path');

const input = path.join(__dirname, '../assets/icon.png');
const output = path.join(__dirname, '../assets/mark.png');

(async () => {
  const {
    data,
    info: { width, height, channels },
  } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r + g + b) / 3;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;

    if (r > 247 && g > 247 && b > 247) {
      data[i + 3] = 0;
      continue;
    }
    if (lum > 165 && lum < 252 && sat < 0.12) {
      data[i + 3] = 0;
      continue;
    }
    if (lum > 205 && sat < 0.3) {
      data[i + 3] = 0;
      continue;
    }
  }

  await sharp(Buffer.from(data), { raw: { width, height, channels } })
    .resize(256, 256, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(output);
  console.log('Wrote', output);
})();
