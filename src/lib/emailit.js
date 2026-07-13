/**
 * Emailit API client (https://emailit.com) — transactional sending + marketing
 * contact sync. Uses native fetch (Node 18+), so no extra dependency is needed.
 *
 * Configuration priority: DB `settings` table, then process.env.
 *
 * Config is cached in memory but self-heals: if not yet configured, every
 * call re-checks the DB (so saving a key in Admin → Settings works without a
 * restart); once configured, it's re-checked at most every CACHE_TTL_MS so a
 * key rotation is picked up soon without hitting the DB on every send.
 */
// Email sending and audience/contact sync both use Emailit's current v2 API.
const API_BASE_V2 = 'https://api.emailit.com/v2';
const CACHE_TTL_MS = 30 * 1000;

let _knex;
function db() { if (!_knex) _knex = require('../config/db'); return _knex; }

let cache = {
  apiKey: null,
  fromEmail: null,
  smtpFrom: null,
  audienceId: null,
  smtpHost: null,
  smtpPort: 587,
  smtpUser: null,
  smtpPassword: null,
  loadedAt: 0,
};

async function refresh() {
  let apiKey = process.env.EMAILIT_API_KEY || null;
  let smtpFrom = process.env.MAIL_FROM || 'GDCU <admin@gdc.university>';
  let fromEmail = process.env.EMAILIT_FROM_EMAIL || smtpFrom;
  let audienceId = process.env.EMAILIT_AUDIENCE_ID || null;
  let smtpHost = process.env.SMTP_HOST || null;
  let smtpPort = process.env.SMTP_PORT || 587;
  let smtpUser = process.env.SMTP_USER || null;
  let smtpPassword = process.env.SMTP_PASSWORD || null;

  try {
    const rows = await db()('settings').whereIn('key', [
      'EMAILIT_API_KEY',
      'EMAILIT_FROM_EMAIL',
      'EMAILIT_AUDIENCE_ID',
      'MAIL_FROM',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASSWORD',
    ]);
    const byKey = {};
    rows.forEach((r) => { if (r.value) byKey[r.key] = r.value; });
    if (byKey.EMAILIT_API_KEY) apiKey = byKey.EMAILIT_API_KEY;
    if (byKey.EMAILIT_FROM_EMAIL) fromEmail = byKey.EMAILIT_FROM_EMAIL;
    if (byKey.MAIL_FROM) smtpFrom = byKey.MAIL_FROM;
    if (!byKey.EMAILIT_FROM_EMAIL && byKey.MAIL_FROM && !process.env.EMAILIT_FROM_EMAIL) fromEmail = byKey.MAIL_FROM;
    if (byKey.EMAILIT_AUDIENCE_ID) audienceId = byKey.EMAILIT_AUDIENCE_ID;
    if (byKey.SMTP_HOST) smtpHost = byKey.SMTP_HOST;
    if (byKey.SMTP_PORT) smtpPort = byKey.SMTP_PORT;
    if (byKey.SMTP_USER) smtpUser = byKey.SMTP_USER;
    if (byKey.SMTP_PASSWORD) smtpPassword = byKey.SMTP_PASSWORD;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('emailit: could not read settings table, using .env only:', err.message);
  }

  cache = {
    apiKey: apiKey && !apiKey.includes('xxx') ? apiKey : null,
    fromEmail,
    smtpFrom,
    audienceId,
    smtpHost,
    smtpPort: Number(smtpPort) || 587,
    smtpUser,
    smtpPassword,
    loadedAt: Date.now(),
  };
  return cache;
}

/**
 * Ensure config is loaded and fresh. MUST be awaited before every send —
 * this is what actually decides whether Emailit is used.
 */
async function ensureConfigured() {
  const stale = Date.now() - cache.loadedAt > CACHE_TTL_MS;
  if (!cache.apiKey || stale) await refresh();
  return Boolean(cache.apiKey);
}

/** Best-effort synchronous read of the last known state (for display only — not a send gate). */
function isConfigured() { return Boolean(cache.apiKey); }

function getFromEmail() { return cache.fromEmail; }

/**
 * Load the provider configuration used by both Emailit and SMTP.
 * Settings entered in Admin → Settings are included, not just .env values.
 */
async function getMailConfig() {
  await ensureConfigured();
  return {
    emailitConfigured: Boolean(cache.apiKey),
    fromEmail: cache.fromEmail,
    smtpFrom: cache.smtpFrom,
    smtpHost: cache.smtpHost,
    smtpPort: cache.smtpPort,
    smtpUser: cache.smtpUser,
    smtpPassword: cache.smtpPassword,
  };
}

// Warm the cache at boot (fire-and-forget) so the first real request is fast.
refresh().catch(() => {});

async function request(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cache.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { /* not JSON */ }

  if (!res.ok) {
    // Don't guess at Emailit's error field names — surface whatever came
    // back verbatim so the real reason is visible instead of a bare status.
    const detail =
      data.details ||
      (Array.isArray(data.validation_errors) ? data.validation_errors.join('; ') : null) ||
      data.error ||
      data.message ||
      (Object.keys(data).length ? JSON.stringify(data) : raw);
    // eslint-disable-next-line no-console
    console.error(`emailit: ${res.status} response body:`, raw);
    throw new Error(detail ? `Emailit (${res.status}): ${String(detail).slice(0, 300)}` : `Emailit API error (${res.status})`);
  }
  return data;
}

/** Send a transactional email via the Emailit API. Loads/refreshes config first. */
async function sendEmail({ from, to, subject, html, text, replyTo }) {
  const ok = await ensureConfigured();
  if (!ok) throw new Error('Emailit is not configured — set EMAILIT_API_KEY in Admin → Settings or .env');
  // Keep this payload minimal — matching the proven-working shape exactly
  // (plain "to" address, no tracking object) rather than the fuller v2
  // payload the docs describe; the sender domain remains provider-validated.
  return request(API_BASE_V2, '/emails', {
    from: from || cache.fromEmail,
    to,
    subject,
    html,
    text: text || undefined,
    reply_to: replyTo || undefined,
  });
}

/**
 * Upsert a contact into an Emailit audience for email marketing (newsletters,
 * campaigns). Requires an audience ID; a no-op otherwise. Callers should
 * treat this as fire-and-forget — never let a sync failure break the caller.
 */
async function upsertContact({ email, firstName, lastName, tags }) {
  const ok = await ensureConfigured();
  if (!ok || !cache.audienceId || !email) return null;
  return request(API_BASE_V2, `/audiences/${cache.audienceId}/contacts`, {
    email,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    tags: tags || undefined,
  });
}

module.exports = { isConfigured, ensureConfigured, getFromEmail, getMailConfig, sendEmail, upsertContact };
