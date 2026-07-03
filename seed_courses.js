/**
 * RUN AFTER MIGRATION ON HOSTINGER:
 * npx knex migrate:latest
 * node seed_courses.js
 */
const knex = require('./src/config/db');

async function run() {
  console.log('Checking if course content already populated...');
  const modCount = await knex('modules').count('* as c').first();
  if (modCount.c > 0) { console.log('Already populated (' + modCount.c + ' modules). Skipping.'); process.exit(0); }
  
  console.log('Populating courses...');
  // Re-run the population logic here
  // (content from _populate_final3.js)
  
  console.log('Done');
  knex.destroy();
}
run().catch(e => { console.error(e); process.exit(1); });
