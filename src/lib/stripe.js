/**
 * Stripe client. Returns null when no key is configured so the app still runs
 * locally without Stripe (the application is recorded; payment is skipped).
 * Reads the secret key from the DB settings table first, then falls back to .env.
 */
const knex = require('../config/db');

let stripe = null;
let isConfigured = false;

/** Read Stripe secret key: DB value first, then .env. */
async function initStripe() {
  if (stripe) return stripe;
  let key = process.env.STRIPE_SECRET_KEY;

  // DB override (silently skip if settings table doesn't exist yet).
  try {
    const row = await knex('settings').where({ key: 'STRIPE_SECRET_KEY' }).first();
    if (row && row.value) key = row.value;
  } catch (_) { /* table may not exist */ }

  // eslint-disable-next-line global-require
  if (key && !key.includes('xxx')) {
    stripe = require('stripe')(key);
    isConfigured = true;
  }
  return stripe;
}

// Init on load, but don't block (it's async but fast).
initStripe().catch(() => {});

module.exports = { stripe, isConfigured };