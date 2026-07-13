/**
 * Admin → Settings → Integrations.
 * Allows staff to enter Emailit, Stripe, and Zoom API keys from the CRM
 * without touching .env or the server filesystem.
 * Mounted at /admin/settings.
 */
const express = require('express');
const knex = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

router.use(requirePermission('manage_settings'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.adminActive = 'settings';
  next();
});

// ── Which keys appear on the form ───────────────────────────
const FIELDS = [
  { key: 'EMAILIT_API_KEY',     label: 'Emailit API Key',           group: 'Email',   sensitive: true },
  { key: 'EMAILIT_FROM_EMAIL',  label: 'Emailit From Address (verified domain)', group: 'Email', sensitive: false },
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
    res.render('admin/settings', {
      pageTitle: 'Settings & Integrations | GDCU', adminActive: 'settings', rows, groups,
      currentUserEmail: req.session.user.email,
    });
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
    req.flash('success', 'Settings saved.');
    res.redirect('/admin/settings');
  } catch (err) { next(err); }
});

// Send a real test email through the exact same code path production emails
// use, so it actually proves whether Emailit/SMTP is reachable — rather than
// just checking whether a key string is saved.
router.post('/test-email', async (req, res, next) => {
  try {
    const to = req.session.user.email;
    const result = await sendMail({
      to,
      toName: req.session.user.name,
      subject: 'GDCU test email',
      html: '<p>This is a test email from <strong>Admin → Settings</strong> to confirm your email provider is working.</p>',
    });

    if (result.status === 'sent') {
      const provider = result.provider === 'smtp' ? 'SMTP fallback' : 'Emailit';
      req.flash('success', `Test email sent to ${to} via ${provider}. Check your inbox.`);
    } else if (result.status === 'logged') {
      req.flash('error', 'No email provider is configured — the test email was only logged to the Email Outbox, not sent. Enter an Emailit API key (or SMTP settings) below, save, then try again.');
    } else {
      const last = await knex('email_log').where({ to_email: to }).orderBy('id', 'desc').first();
      const detail = last && last.error ? `: ${last.error}` : '.';
      const hint = last && last.error && /domain.*(not verified|unverified)/i.test(last.error)
        ? ' Set Emailit From Address to an address on a verified Emailit domain, or verify the current sender domain in Emailit.'
        : '';
      req.flash('error', `Test email failed to send${detail}${hint}`);
    }
    res.redirect('/admin/settings');
  } catch (err) { next(err); }
});

module.exports = router;
