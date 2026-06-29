/**
 * Authentication — login / logout.
 * The login page exists now (per the Stitch design) so the public site links work.
 * Full student/staff dashboards arrive in the LMS & CRM phases; on success we
 * route users to a sensible landing place based on role.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const knex = require('../config/db');

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

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

module.exports = router;
