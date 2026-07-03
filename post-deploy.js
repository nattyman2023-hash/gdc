#!/usr/bin/env node
/**
 * Post-deploy hook: runs DB migrations and seeds if the database hasn't been set up.
 * Called by Hostinger deploy.yml or manually.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname);

function run(cmd) {
  console.log('> ' + cmd);
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
    return out.toString();
  } catch (e) {
    console.log(e.stdout ? e.stdout.toString() : e.message);
    throw e;
  }
}

async function main() {
  console.log('=== Post-deploy setup ===\n');

  // Check if DB exists with tables
  const dbPath = path.join(ROOT, 'data', 'gdcu.sqlite');
  const dbExists = fs.existsSync(dbPath);

  // Run migrations
  console.log('Running migrations...');
  run('npx knex migrate:latest');
  console.log('Migrations OK\n');

  // Run seed if fresh DB
  if (!dbExists || process.argv.includes('--force-seed')) {
    console.log('Fresh database — seeding courses...');
    run('node seed_production.js');
    console.log('Seed OK\n');
  } else {
    const { execSync } = require('child_process');
    const knex = require(path.join(ROOT, 'src', 'config', 'db'));
    const hasModules = await knex('modules').count('* as c').first();
    if (hasModules.c === 0) {
      console.log('No content found — seeding...');
      run('node seed_production.js');
    } else {
      console.log(`Database has ${hasModules.c} modules — skipping seed.`);
    }
    knex.destroy();
  }

  console.log('=== Done ===');
}

main().catch(e => { console.error(e); process.exit(1); });
