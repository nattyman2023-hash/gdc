/**
 * Public website pages — Privacy Policy, Terms, Statement of Faith, Accessibility, Credit-Hour Policy.
 */
const express = require('express');
const knex = require('../config/db');
const router = express.Router();

/**
 * GET /privacy — Privacy Policy
 */
router.get('/privacy', (req, res) => {
  res.render('public/privacy', {
    pageTitle: 'Privacy Policy | GDCU',
    metaDescription: 'Privacy Policy for Global Diaspora Christian University.',
    currentPath: req.path,
  });
});

/**
 * GET /terms — Terms and Conditions
 */
router.get('/terms', (req, res) => {
  res.render('public/terms', {
    pageTitle: 'Terms & Conditions | GDCU',
    metaDescription: 'Terms and Conditions for Global Diaspora Christian University.',
    currentPath: req.path,
  });
});

/**
 * GET /statement-of-faith — Statement of Faith
 */
router.get('/statement-of-faith', (req, res) => {
  res.render('public/statement-of-faith', {
    pageTitle: 'Statement of Faith | GDCU',
    metaDescription: 'Our Pentecostal Christian Statement of Faith at Global Diaspora Christian University.',
    currentPath: req.path,
  });
});

/**
 * GET /accessibility — Accessibility Statement
 */
router.get('/accessibility', (req, res) => {
  res.render('public/accessibility', {
    pageTitle: 'Accessibility | GDCU',
    metaDescription: 'Accessibility statement for Global Diaspora Christian University.',
    currentPath: req.path,
  });
});

/**
 * GET /credit-hour-policy — Institutional Credit-Hour Policy
 */
router.get('/credit-hour-policy', async (req, res, next) => {
  try {
    const setting = await knex('settings').where({ key: 'credit_hour_policy' }).first();
    res.render('public/credit-hour-policy', {
      pageTitle: 'Credit-Hour Policy | GDCU',
      metaDescription: 'How Global Diaspora Christian University defines, measures and documents semester credit hours for online learning.',
      policyText: setting ? setting.value : null,
      currentPath: req.path,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
