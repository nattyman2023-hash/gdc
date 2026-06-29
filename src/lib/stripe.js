/**
 * Stripe client. Returns null when no key is configured so the app still runs
 * locally without Stripe (the application is recorded; payment is skipped).
 */
const key = process.env.STRIPE_SECRET_KEY;

let stripe = null;
if (key && !key.includes('xxx')) {
  // eslint-disable-next-line global-require
  stripe = require('stripe')(key);
}

const isConfigured = Boolean(stripe);

module.exports = { stripe, isConfigured };
