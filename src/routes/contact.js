/**
 * Contact form + newsletter subscription.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const knex = require('../config/db');
const emailit = require('../lib/emailit');

const router = express.Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.get('/contact', (req, res) => {
  res.render('public/contact', {
    pageTitle: 'Contact Us | GDCU',
    form: {},
    errors: {},
  });
});

router.post(
  '/contact',
  limiter,
  [
    body('name').trim().notEmpty().withMessage('Please enter your name.'),
    body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('message').trim().notEmpty().withMessage('Please enter a message.'),
  ],
  async (req, res, next) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        const errors = {};
        for (const e of result.array()) errors[e.path] = e.msg;
        return res.status(422).render('public/contact', {
          pageTitle: 'Contact Us | GDCU',
          form: req.body,
          errors,
        });
      }
      await knex('contact_messages').insert({
        name: req.body.name,
        email: req.body.email,
        subject: req.body.subject || null,
        message: req.body.message,
      });
      req.flash('success', 'Thank you for getting in touch. We will respond as soon as we can.');
      return res.redirect('/contact');
    } catch (err) {
      next(err);
    }
  }
);

// Newsletter (footer)
router.post(
  '/newsletter',
  limiter,
  [body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail()],
  async (req, res, next) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        req.flash('error', 'Please enter a valid email address.');
        return res.redirect(req.get('referer') || '/');
      }
      // Upsert-style: ignore if already subscribed.
      const existing = await knex('newsletter_subscribers').where({ email: req.body.email }).first();
      if (!existing) {
        await knex('newsletter_subscribers').insert({ email: req.body.email });
      }
      emailit.upsertContact({ email: req.body.email, tags: ['newsletter'] }).catch(() => {});
      req.flash('success', 'You are subscribed. Thank you!');
      return res.redirect(req.get('referer') || '/');
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
