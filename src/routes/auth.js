/**
 * Authentication — login / logout.
 * The login page exists now (per the Stitch design) so the public site links work.
 * Full student/staff dashboards arrive in the LMS & CRM phases; on success we
 * route users to a sensible landing place based on role.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const knex = require('../config/db');
const { email: sendEmail } = require('../lib/notify');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', {
    pageTitle: 'Sign In | GDCU',
    layout: 'layouts/auth',
    form: {},
    error: null,
    next: req.query.next || '',
  });
});

router.post(
  '/login',
  loginLimiter,
  [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const result = validationResult(req);
      const renderError = (msg) =>
        res.status(401).render('auth/login', {
          pageTitle: 'Sign In | GDCU',
          layout: 'layouts/auth',
          form: { email: req.body.email },
          error: msg,
          next: req.body.next || '',
        });

      if (!result.isEmpty()) return renderError('Please enter a valid email and password.');

      const user = await knex('users').where({ email: req.body.email }).first();
      if (!user || user.status !== 'active') {
        return renderError('Invalid credentials.');
      }
      const ok = await bcrypt.compare(req.body.password, user.password_hash);
      if (!ok) return renderError('Invalid credentials.');

      await knex('users').where({ id: user.id }).update({ last_login_at: knex.fn.now() });
      if (user.role === 'student') require('../lib/attendance').recordLogin(user.id);

      req.session.user = {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
      };

      req.flash('success', `Welcome back, ${user.first_name}.`);
      // Honour an explicit ?next, otherwise send students to their portal.
      let dest = '/';
      if (req.body.next && req.body.next.startsWith('/')) {
        dest = req.body.next;
      } else if (user.role === 'student') {
        dest = '/portal';
      } else if (user.role === 'faculty') {
        dest = '/faculty';
      } else if (user.role === 'staff' || user.role === 'admin') {
        dest = '/admin';
      }
      return res.redirect(dest);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ─── Forgot / reset password ────────────────────────────────────
router.get('/forgot-password', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/forgot-password', {
    pageTitle: 'Forgot Password | GDCU',
    layout: 'layouts/auth',
    sent: false,
    error: null,
  });
});

router.post(
  '/forgot-password',
  resetLimiter,
  [body('email').trim().isEmail().normalizeEmail()],
  async (req, res, next) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(422).render('auth/forgot-password', {
          pageTitle: 'Forgot Password | GDCU',
          layout: 'layouts/auth',
          sent: false,
          error: 'Please enter a valid email address.',
        });
      }

      const user = await knex('users').where({ email: req.body.email }).first();
      if (user && user.status === 'active') {
        const token = crypto.randomBytes(32).toString('hex');
        await knex('password_reset_tokens').insert({
          user_id: user.id,
          token_hash: hashToken(token),
          expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        });
        const resetUrl = `${process.env.APP_URL || ''}/reset-password/${token}`;
        sendEmail({
          to: user.email,
          toName: `${user.first_name} ${user.last_name}`,
          subject: 'Reset your GDCU password',
          heading: 'Password reset request',
          bodyHtml: `<p>Dear ${user.first_name},</p><p>We received a request to reset your GDCU account password. Click the button below to choose a new one — this link expires in 1 hour.</p><p style="margin:24px 0"><a href="${resetUrl}" style="background:#071d3a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reset your password</a></p><p style="color:#74777e;font-size:13px">If you didn't request this, you can safely ignore this email — your password will not be changed.</p>`,
          relatedType: 'user',
          relatedId: user.id,
        });
      }

      // Always show the same message, whether or not the email exists, to avoid leaking account existence.
      res.render('auth/forgot-password', {
        pageTitle: 'Forgot Password | GDCU',
        layout: 'layouts/auth',
        sent: true,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/reset-password/:token', async (req, res, next) => {
  try {
    if (req.session.user) return res.redirect('/');
    const record = await knex('password_reset_tokens')
      .where({ token_hash: hashToken(req.params.token) })
      .whereNull('used_at')
      .first();
    const valid = Boolean(record) && new Date(record.expires_at) > new Date();
    res.render('auth/reset-password', {
      pageTitle: 'Reset Password | GDCU',
      layout: 'layouts/auth',
      token: req.params.token,
      valid,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/reset-password/:token',
  resetLimiter,
  [body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')],
  async (req, res, next) => {
    try {
      const renderError = (msg, valid = true) =>
        res.status(422).render('auth/reset-password', {
          pageTitle: 'Reset Password | GDCU',
          layout: 'layouts/auth',
          token: req.params.token,
          valid,
          error: msg,
        });

      const result = validationResult(req);
      if (!result.isEmpty()) return renderError(result.array()[0].msg);
      if (req.body.password !== req.body.password_confirm) return renderError('Passwords do not match.');

      const record = await knex('password_reset_tokens')
        .where({ token_hash: hashToken(req.params.token) })
        .whereNull('used_at')
        .first();
      if (!record || new Date(record.expires_at) <= new Date()) {
        return renderError('This reset link is invalid or has expired. Please request a new one.', false);
      }

      const hash = await bcrypt.hash(req.body.password, 12);
      await knex('users').where({ id: record.user_id }).update({ password_hash: hash, updated_at: knex.fn.now() });
      await knex('password_reset_tokens').where({ id: record.id }).update({ used_at: knex.fn.now() });
      // Invalidate any other outstanding reset links for this user.
      await knex('password_reset_tokens').where({ user_id: record.user_id }).whereNull('used_at').update({ used_at: knex.fn.now() });

      const user = await knex('users').where({ id: record.user_id }).first();
      sendEmail({
        to: user.email,
        toName: `${user.first_name} ${user.last_name}`,
        subject: 'Your GDCU password was changed',
        heading: 'Password changed',
        bodyHtml: `<p>Dear ${user.first_name},</p><p>Your GDCU account password was just changed. If you did not make this change, please contact us immediately.</p>`,
        relatedType: 'user',
        relatedId: user.id,
      });

      req.flash('success', 'Your password has been reset. Please sign in.');
      res.redirect('/login');
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
