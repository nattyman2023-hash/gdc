/**
 * Stripe webhook — marks application fees paid when Checkout completes.
 * The raw body parser is applied to this path in app.js (required for
 * signature verification).
 */
const express = require('express');
const knex = require('../config/db');
const { stripe, isConfigured } = require('../lib/stripe');

const router = express.Router();

router.post('/', async (req, res) => {
  if (!isConfigured) return res.status(200).json({ received: true, skipped: 'stripe not configured' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (secret && !secret.includes('xxx')) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } else {
      // No signing secret configured — parse without verification (dev only).
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const sessionObj = event.data.object;
      const meta = sessionObj.metadata || {};

      if (meta.kind === 'sponsorship') {
        await knex('sponsorship_contributions')
          .where({ stripe_session_id: sessionObj.id })
          .update({ status: 'paid' });
      } else if (meta.kind === 'invoice') {
        // Student tuition invoice payment
        await knex('invoices')
          .where({ stripe_session_id: sessionObj.id })
          .update({
            status: 'paid',
            payment_method: 'stripe',
            stripe_payment_intent: sessionObj.payment_intent || null,
            paid_at: knex.fn.now(),
            updated_at: knex.fn.now(),
          });
      } else {
        // Application fee (default)
        await knex('application_fees')
          .where({ stripe_session_id: sessionObj.id })
          .update({
            status: 'paid',
            stripe_payment_intent: sessionObj.payment_intent || null,
            updated_at: knex.fn.now(),
          });
        if (meta.application_id) {
          await knex('applications')
            .where({ id: meta.application_id })
            .update({ payment_status: 'paid', updated_at: knex.fn.now() });
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error handling Stripe event:', err);
    return res.status(500).send('handler error');
  }

  return res.json({ received: true });
});

module.exports = router;
