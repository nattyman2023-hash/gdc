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
const API_BASE = 'https://api.emailit.com/v2';
const CACHE_TTL_MS = 30 * 1000;

let _knex;
function db() { if (!_knex) _knex = require('../config/db'); return _knex; }

let cache = { apiKey: null, fromEmail: null, audienceId: null, loadedAt: 0 };

async function refresh() {
  let apiKey = process.env.EMAILIT_API_KEY || null;
  let fromEmail = process.env.EMAILIT_FROM_EMAIL || process.env.MAIL_FROM || 'GDCU <no-reply@gdcu.edu>';
  let audienceId = process.env.EMAILIT_AUDIENCE_ID || null;

  try {
    const rows = await db()('settings').whereIn('key', ['EMAILIT_API_KEY', 'EMAILIT_FROM_EMAIL', 'EMAILIT_AUDIENCE_ID']);
    const byKey = {};
    rows.forEach((r) => { if (r.value) byKey[r.key] = r.value; });
    if (byKey.EMAILIT_API_KEY) apiKey = byKey.EMAILIT_API_KEY;
    if (byKey.EMAILIT_FROM_EMAIL) fromEmail = byKey.EMAILIT_FROM_EMAIL;
    if (byKey.EMAILIT_AUDIENCE_ID) audienceId = byKey.EMAILIT_AUDIENCE_ID;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('emailit: could not read settings table, using .env only:', err.message);
  }

  cache = {
    apiKey: apiKey && !apiKey.includes('xxx') ? apiKey : null,
    fromEmail,
    audienceId,
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

// Warm the cache at boot (fire-and-forget) so the first real request is fast.
refresh().catch(() => {});

async function request(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cache.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Emailit API error (${res.status})`);
  return data;
}

/** Send a transactional email via the Emailit API. Loads/refreshes config first. */
async function sendEmail({ from, to, subject, html, text, replyTo }) {
  const ok = await ensureConfigured();
  if (!ok) throw new Error('Emailit is not configured — set EMAILIT_API_KEY in Admin → Settings or .env');
  return request('/emails', {
    from: from || cache.fromEmail,
    to,
    subject,
    html,
    text,
    reply_to: replyTo || undefined,
    tracking: { loads: true, clicks: true },
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
  return request(`/audiences/${cache.audienceId}/contacts`, {
    email,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    tags: tags || undefined,
  });
}

module.exports = { isConfigured, ensureConfigured, getFromEmail, sendEmail, upsertContact };
