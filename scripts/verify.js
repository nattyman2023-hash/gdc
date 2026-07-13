/* Lightweight regression checks that do not require a running database. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const failures = [];

function walk(dir, extension, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, extension, callback);
    else if (file.endsWith(extension)) callback(file);
  }
}

walk(path.join(root, 'src'), '.js', (file) => {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: ${result.stderr.trim()}`);
});

walk(path.join(root, 'views'), '.ejs', (file) => {
  try {
    ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (err) {
    failures.push(`${file}: ${err.message}`);
  }
});

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Verification passed: source JavaScript and EJS templates compile.');
