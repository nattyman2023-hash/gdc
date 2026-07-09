/**
 * Stripe Checkout Routes.
 * Creates Stripe checkout sessions for tuition/fee payments.
 * Webhook handling is in ./stripeWebhook.js
 *
 * @todo Set STRIPE_SECRET_KEY and STRIPE_PUBLIC_KEY in .env for live mode.
 *       Test with Stripe test keys first (sk_test_... / pk_test_...).
 */
const express = require('express');
const knex = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { stripe, isConfigured } = require('../lib/stripe');
const emailTemplates = require('../lib/emailTemplates');
const { sendMail, emailLayout } = require('../lib/mailer');

const router = express.Router();

/**
 * POST /pay/create-checkout-session
 * Creates a Stripe checkout session for a payment.
 * Body: { application_id, amount (in minor units, e.g. 5000 = £50.00), description }
 */
router.post('/pay/create-checkout-session', requireRole('student', 'staff', 'admin'), async (req, res, next) => {
  try {
    const { application_id, amount, description } = req.body;

    if (!isConfigured || !stripe) {
      // Stripe not configured — record pending payment and redirect to success
      const [paymentId] = await knex('payments').insert({
        user_id: req.session.user.id,
        application_id: application_id || null,
        amount: amount || 0,
        currency: 'GBP',
        status: 'pending',
        description: description || 'Tuition payment',
      });
      req.flash('info', 'Payment system is being configured. Your enrolment is noted.');
      return res.redirect('/portal/billing');
    }

    // Get user details
    const user = await knex('users').where({ id: req.session.user.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: description || 'GDCU Tuition Payment',
            description: `Payment for application ${application_id || 'GDCU'}`,
          },
          unit_amount: amount || 0,
        },
        quantity: 1,
      }],
      metadata: {
        user_id: String(user.id),
        application_id: String(application_id || ''),
      },
      success_url: `${process.env.APP_URL || ''}/portal/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${process.env.APP_URL || ''}/portal/billing?status=cancelled`,
    });

    // Record the pending payment
    await knex('payments').insert({
      user_id: user.id,
      application_id: application_id || null,
      stripe_session_id: session.id,
      amount: amount || 0,
      currency: 'GBP',
      status: 'pending',
      description: description || 'Tuition payment',
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /pay/success
 * Handle successful payment redirect from Stripe.
 */
router.get('/pay/success', requireRole('student', 'staff', 'admin'), async (req, res, next) => {
  try {
    const { session_id } = req.query;
    if (session_id) {
      await knex('payments')
        .where({ stripe_session_id: session_id })
        .update({ status: 'paid', paid_at: knex.fn.now() });

      // Send confirmation email
      const payment = await knex('payments')
        .where({ stripe_session_id: session_id })
        .first();
      if (payment) {
        const user = await knex('users').where({ id: payment.user_id }).first();
        if (user) {
          const html = emailTemplates.paymentConfirmation({
            firstName: user.first_name,
            programmeName: payment.description || 'your programme',
            applicationId: payment.application_id || '',
            amount: `£${(payment.amount / 100).toFixed(2)}`,
          });
          await sendMail({
            to: user.email,
            toName: `${user.first_name} ${user.last_name}`,
            subject: 'Payment Confirmed — GDCU',
            html,
            relatedType: 'payment',
            relatedId: payment.id,
          });
        }
      }
    }
    req.flash('success', 'Payment successful. Thank you!');
    res.redirect('/portal/billing');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /pay/cancel
 * Handle cancelled payment redirect from Stripe.
 */
router.get('/pay/cancel', requireRole('student', 'staff', 'admin'), (req, res) => {
  req.flash('error', 'Payment was cancelled. You can try again at any time.');
  res.redirect('/portal/billing');
});

/**
 * GET /admin/payments
 * Admin view for all payments.
 */
router.get('/admin/payments', requireRole('staff', 'admin'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const [{ count }] = await knex('payments').count('* as count');
    const payments = await knex('payments')
      .leftJoin('users', 'payments.user_id', 'users.id')
      .select(
        'payments.*',
        knex.raw("CONCAT(users.first_name, ' ', users.last_name) as user_name"),
        'users.email as user_email'
      )
      .orderBy('payments.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    res.render('admin/payments', {
      pageTitle: 'Payments | GDCU Admin',
      layout: 'layouts/admin',
      payments,
      page,
      totalPages: Math.ceil(count / limit),
      currentPath: req.path,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/payments/:id
 * Admin view for a single payment.
 */
router.get('/admin/payments/:id', requireRole('staff', 'admin'), async (req, res, next) => {
  try {
    const payment = await knex('payments')
      .leftJoin('users', 'payments.user_id', 'users.id')
      .leftJoin('applications', 'payments.application_id', 'applications.id')
      .select(
        'payments.*',
        knex.raw("CONCAT(users.first_name, ' ', users.last_name) as user_name"),
        'users.email as user_email',
        'applications.status as application_status'
      )
      .where('payments.id', req.params.id)
      .first();

    if (!payment) return res.status(404).render('errors/404', { pageTitle: 'Not found' });

    res.render('admin/payment-detail', {
      pageTitle: `Payment #${payment.id} | GDCU Admin`,
      layout: 'layouts/admin',
      payment,
      currentPath: req.path,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;