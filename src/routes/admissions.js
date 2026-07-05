/**
 * Admissions: overview, the Apply Now application (saved to DB),
 * Stripe Checkout for the application fee, and Request Info lead capture.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const knex = require('../config/db');
const { makeReference } = require('../lib/helpers');
const { stripe, isConfigured } = require('../lib/stripe');
const { notifyRoles, email } = require('../lib/notify');
const emailit = require('../lib/emailit');

const router = express.Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Admissions overview ─────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const programs = await knex('programs').where({ published: true }).orderBy('sort_order');
    res.render('public/admissions', { pageTitle: 'Admissions & Tuition | GDCU', programs });
  } catch (err) {
    next(err);
  }
});

// ─── Apply: show form ────────────────────────────────────────
router.get('/apply', async (req, res, next) => {
  try {
    const programs = await knex('programs').where({ published: true }).orderBy('sort_order');
    res.render('public/apply', {
      pageTitle: 'Apply Now | GDCU',
      programs,
      form: {},
      errors: {},
      selectedProgram: req.query.program || '',
    });
  } catch (err) {
    next(err);
  }
});

const applyValidators = [
  body('first_name').trim().notEmpty().withMessage('First name is required.'),
  body('last_name').trim().notEmpty().withMessage('Last name is required.'),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('A contact phone number is required.'),
  body('date_of_birth').trim().notEmpty().withMessage('Date of birth is required.'),
  body('country').trim().notEmpty().withMessage('Country of residence is required.'),
  body('nationality').trim().notEmpty().withMessage('Nationality is required.'),
  body('program_id').notEmpty().withMessage('Please choose a program.'),
  body('prev_qualification').trim().notEmpty().withMessage('Please tell us your highest qualification.'),
  body('statement').trim().isLength({ min: 50 }).withMessage('Please write a personal statement (at least 50 characters).'),
  body('ref1_name').trim().notEmpty().withMessage('At least one referee is required.'),
  body('ref1_email').trim().isEmail().withMessage('A valid referee email is required.'),
  body('consent').notEmpty().withMessage('Please confirm the declaration to proceed.'),
];

// Fields copied straight from the form into the applications row.
const APPLICATION_FIELDS = [
  'title', 'middle_name', 'preferred_name', 'gender', 'nationality',
  'address_line1', 'address_line2', 'city', 'region', 'postal_code',
  'prev_institution', 'prev_qualification', 'prev_grade', 'prev_year', 'english_proficiency',
  'employment_status', 'occupation', 'employer', 'church_involvement',
  'ref1_name', 'ref1_email', 'ref1_relationship', 'ref2_name', 'ref2_email', 'ref2_relationship',
  'how_heard',
];

// ─── Apply: submit ───────────────────────────────────────────
router.post('/apply', formLimiter, applyValidators, async (req, res, next) => {
  try {
    const programs = await knex('programs').where({ published: true }).orderBy('sort_order');
    const result = validationResult(req);
    if (!result.isEmpty()) {
      const errors = {};
      for (const e of result.array()) errors[e.path] = e.msg;
      return res.status(422).render('public/apply', {
        pageTitle: 'Apply Now | GDCU',
        programs,
        form: req.body,
        errors,
        selectedProgram: req.body.program_id || '',
      });
    }

    const reference = makeReference();
    const record = {
      reference,
      program_id: req.body.program_id || null,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      phone: req.body.phone || null,
      country: req.body.country,
      date_of_birth: req.body.date_of_birth || null,
      prior_education: req.body.prev_qualification || req.body.prior_education || null,
      statement: req.body.statement || null,
      intake: req.body.intake || null,
      sponsorship_interest: req.body.sponsorship_interest === 'on',
      status: 'new',
      payment_status: 'unpaid',
    };
    for (const f of APPLICATION_FIELDS) record[f] = (req.body[f] || '').trim() || null;
    const [appId] = await knex('applications').insert(record);

    const applicationId = Array.isArray(appId) ? appId[0] : appId;

    // Notify admissions staff and email the applicant a confirmation.
    notifyRoles(['admin', 'staff'], {
      type: 'application', title: 'New application received',
      body: `${req.body.first_name} ${req.body.last_name} — ${reference}`,
      link: `/admin/applications/${applicationId}`,
    });
    email({
      to: req.body.email, toName: `${req.body.first_name} ${req.body.last_name}`,
      subject: `We've received your application (${reference})`,
      heading: 'Thank you for applying to GDCU',
      bodyHtml: `<p>Dear ${req.body.first_name},</p><p>We have received your application <strong>${reference}</strong> and our admissions team will be in touch shortly.</p><p>You can reply to this email if you have any questions.</p>`,
      relatedType: 'application', relatedId: applicationId,
    });
    emailit.upsertContact({ email: req.body.email, firstName: req.body.first_name, lastName: req.body.last_name, tags: ['applicant'] }).catch(() => {});

    // If Stripe is configured, send the applicant to Checkout for the fee.
    if (isConfigured) {
      const amount = Number(process.env.APPLICATION_FEE_AMOUNT || 5000);
      const currency = (process.env.APPLICATION_FEE_CURRENCY || 'gbp').toLowerCase();

      const checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: req.body.email,
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: 'GDCU Application Fee',
                description: `Application ${reference}`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        metadata: { kind: 'application_fee', application_id: String(applicationId), reference },
        success_url: `${process.env.APP_URL}/admissions/apply/success?ref=${reference}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/admissions/apply/cancelled?ref=${reference}`,
      });

      await knex('application_fees').insert({
        application_id: applicationId,
        amount,
        currency,
        provider: 'stripe',
        stripe_session_id: checkout.id,
        status: 'pending',
      });

      return res.redirect(303, checkout.url);
    }

    // No Stripe configured (e.g. local dev) — record and confirm directly.
    req.flash(
      'success',
      `Your application (ref ${reference}) has been received. Our admissions team will be in touch shortly.`
    );
    return res.redirect(`/admissions/apply/success?ref=${reference}`);
  } catch (err) {
    next(err);
  }
});

// ─── Apply: success / cancelled ──────────────────────────────
router.get('/apply/success', async (req, res, next) => {
  try {
    const application = req.query.ref
      ? await knex('applications').where({ reference: req.query.ref }).first()
      : null;
    res.render('public/apply-success', {
      pageTitle: 'Application Received | GDCU',
      application,
      paid: Boolean(req.query.session_id),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/apply/cancelled', (req, res) => {
  req.flash(
    'info',
    'Your application is saved but the fee was not paid. You can complete payment any time — contact admissions for a payment link.'
  );
  res.redirect('/admissions');
});

// ─── Request Info (lead capture) ─────────────────────────────
const leadValidators = [
  body('first_name').trim().notEmpty().withMessage('Please enter your name.'),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('phone').optional({ checkFalsy: true }).trim(),
];

router.post('/request-info', formLimiter, leadValidators, async (req, res, next) => {
  try {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      req.flash('error', result.array()[0].msg);
      return res.redirect(req.get('referer') || '/admissions');
    }
    await knex('leads').insert({
      first_name: req.body.first_name,
      last_name: req.body.last_name || null,
      email: req.body.email,
      phone: req.body.phone || null,
      country: req.body.country || null,
      program_id: req.body.program_id || null,
      interest: req.body.interest || null,
      message: req.body.message || null,
      source: 'request_info',
      status: 'new',
    });
    emailit.upsertContact({ email: req.body.email, firstName: req.body.first_name, lastName: req.body.last_name, tags: ['lead'] }).catch(() => {});
    req.flash('success', 'Thank you! We have received your enquiry and will be in touch soon.');
    return res.redirect(req.get('referer') || '/');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
