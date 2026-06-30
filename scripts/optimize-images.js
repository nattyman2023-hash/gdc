/**
 * One-off image optimiser. The generated hero/news/program artwork was saved as
 * ~2.2 MB PNGs (1672×941 photos), which made pages painfully slow to load.
 * This converts every PNG under public/img/generated to WebP at the same size,
 * which is ~10× smaller with no visible quality loss.
 *
 * Usage: node scripts/optimize-images.js
 * Re-run safely; it overwrites the .webp outputs.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'public', 'img', 'generated');
const SKIP = '_replaced-photo-backup';
const QUALITY = 80;

async function run() {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'));

  let beforeTotal = 0;
  let afterTotal = 0;

  for (const file of files) {
    const src = path.join(DIR, file);
    if (src.includes(SKIP)) continue;
    const out = path.join(DIR, file.replace(/\.png$/i, '.webp'));
    const before = fs.statSync(src).size;
    // Read into a buffer first so we never read+write the same path at once.
    const input = fs.readFileSync(src);
    await sharp(input).webp({ quality: QUALITY, effort: 5 }).toFile(out);
    const after = fs.statSync(out).size;
    beforeTotal += before;
    afterTotal += after;
    // eslint-disable-next-line no-console
    console.log(`${file}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nDONE: ${files.length} images, ${(beforeTotal / 1048576).toFixed(1)}MB -> ${(afterTotal / 1048576).toFixed(1)}MB`
  );
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
