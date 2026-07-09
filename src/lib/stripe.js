/**
 * Stripe client. Reads the secret key from the DB `settings` table first,
 * then falls back to .env. Returns { stripe: null, isConfigured: false } when
 * no key is configured so the app still runs locally without Stripe.
 *
 * Config is cached but self-heals: if not yet configured, every call
 * re-checks the DB (so saving a key in Admin → Settings works without a
 * restart); once configured, it's re-checked at most every CACHE_TTL_MS.
 *
 * Call sites must `await getStripe()` at the point of use rather than
 * destructuring `{ stripe, isConfigured }` at module-load time — destructuring
 * a plain exported value freezes it at whatever it was when the module was
 * first required, which is always before this file's async DB lookup can
 * possibly resolve, so it would always read as "not configured".
 */
const CACHE_TTL_MS = 30 * 1000;

let cache = { client: null, loadedAt: 0 };

async function refresh() {
  let key = process.env.STRIPE_SECRET_KEY || null;
  try {
    const knex = require('../config/db');
    const row = await knex('settings').where({ key: 'STRIPE_SECRET_KEY' }).first();
    if (row && row.value) key = row.value;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('stripe: could not read settings table, using .env only:', err.message);
  }

  if (key && !key.includes('xxx')) {
    // eslint-disable-next-line global-require
    cache = { client: require('stripe')(key), loadedAt: Date.now() };
  } else {
    cache = { client: null, loadedAt: Date.now() };
  }
  return cache;
}

// Warm the cache at boot (fire-and-forget) so the first real request is fast.
refresh().catch(() => {});

/** Ensure config is loaded and fresh; returns { stripe, isConfigured }. */
async function getStripe() {
  const stale = Date.now() - cache.loadedAt > CACHE_TTL_MS;
  if (!cache.client || stale) await refresh();
  return { stripe: cache.client, isConfigured: Boolean(cache.client) };
}

module.exports = { getStripe };
