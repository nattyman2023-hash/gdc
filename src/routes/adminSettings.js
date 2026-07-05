/**
 * Admin → Settings → Integrations.
 * Allows staff to enter Emailit, Stripe, and Zoom API keys from the CRM
 * without touching .env or the server filesystem.
 * Mounted at /admin/settings.
 */
const express = require('express');
const knex = require('../config/db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('staff', 'admin'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.adminActive = 'settings';
  next();
});

// ── Which keys appear on the form ───────────────────────────
const FIELDS = [
  { key: 'EMAILIT_API_KEY',     label: 'Emailit API Key',           group: 'Email',   sensitive: true },
  { key: 'EMAILIT_AUDIENCE_ID', label: 'Emailit Audience ID',       group: 'Email',   sensitive: false },
  { key: 'SMTP_HOST',           label: 'SMTP Host (fallback)',      group: 'Email',   sensitive: false },
  { key: 'SMTP_PORT',           label: 'SMTP Port',                 group: 'Email',   sensitive: false },
  { key: 'SMTP_USER',           label: 'SMTP User',                 group: 'Email',   sensitive: false },
  { key: 'SMTP_PASSWORD',       label: 'SMTP Password',             group: 'Email',   sensitive: true },
  { key: 'MAIL_FROM',           label: 'From Address',              group: 'Email',   sensitive: false },
  { key: 'STRIPE_SECRET_KEY',      label: 'Stripe Secret Key',      group: 'Payments', sensitive: true },
  { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Publishable Key', group: 'Payments', sensitive: false },
  { key: 'STRIPE_WEBHOOK_SECRET',  label: 'Stripe Webhook Secret',  group: 'Payments', sensitive: true },
  { key: 'APPLICATION_FEE_AMOUNT', label: 'Application Fee (pence)',group: 'Payments', sensitive: false },
  { key: 'APPLICATION_FEE_CURRENCY', label: 'Currency',             group: 'Payments', sensitive: false },
  { key: 'ZOOM_ACCOUNT_ID',   label: 'Zoom Account ID',   group: 'Zoom', sensitive: true },
  { key: 'ZOOM_CLIENT_ID',    label: 'Zoom Client ID',    group: 'Zoom', sensitive: true },
  { key: 'ZOOM_CLIENT_SECRET',label: 'Zoom Client Secret',group: 'Zoom', sensitive: true },
];

// ── Helper: load current values (db first, then env fallback) ──
async function loadSettings() {
  const dbRows = await knex('settings').select('key', 'value');
  const db = {};
  dbRows.forEach((r) => { db[r.key] = r.value; });
  const rows = [];
  for (const f of FIELDS) {
    const val = db[f.key] !== undefined ? db[f.key] : (process.env[f.key] || '');
    rows.push({ key: f.key, label: f.label, group: f.group, sensitive: f.sensitive, value: val, fromEnv: db[f.key] === undefined });
  }
  return { rows, groups: [...new Set(FIELDS.map((f) => f.group))] };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows, groups } = await loadSettings();
    res.render('admin/settings', { pageTitle: 'Settings & Integrations | GDCU', adminActive: 'settings', rows, groups });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    for (const f of FIELDS) {
      const val = (req.body[f.key] || '').trim();
      const existing = await knex('settings').where({ key: f.key }).first();
      if (existing) {
        if (val) {
          await knex('settings').where({ key: f.key }).update({ value: val, updated_at: knex.fn.now() });
        } else {
          // Empty value → remove the row so .env fallback is used.
          await knex('settings').where({ key: f.key }).del();
        }
      } else if (val) {
        await knex('settings').insert({ key: f.key, value: val, label: f.label, group: f.group, sensitive: f.sensitive });
      }
    }
    req.flash('success', 'Settings saved. Restart the server for changes to take effect.');
    res.redirect('/admin/settings');
  } catch (err) { next(err); }
});

module.exports = router;