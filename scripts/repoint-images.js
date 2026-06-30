/**
 * Repoints every reference to a generated PNG (/img/generated/NAME.png) to the
 * optimised WebP produced by scripts/optimize-images.js. Runs over templates,
 * the image-helper, and DB seeds. Idempotent.
 *
 * Usage: node scripts/repoint-images.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RE = /\/img\/generated\/([A-Za-z0-9_-]+)\.png/g;

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

const targets = [
  ...walk(path.join(ROOT, 'views')),
  path.join(ROOT, 'src', 'lib', 'helpers.js'),
  ...walk(path.join(ROOT, 'src', 'db', 'seeds')),
].filter((f) => /\.(ejs|js)$/.test(f));

let changedFiles = 0;
let changedRefs = 0;
for (const file of targets) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(RE, (m, name) => {
    changedRefs += 1;
    return `/img/generated/${name}.webp`;
  });
  if (after !== before) {
    fs.writeFileSync(file, after);
    changedFiles += 1;
    // eslint-disable-next-line no-console
    console.log(`updated ${path.relative(ROOT, file)}`);
  }
}
// eslint-disable-next-line no-console
console.log(`\nDONE: ${changedRefs} references in ${changedFiles} files repointed to .webp`);
