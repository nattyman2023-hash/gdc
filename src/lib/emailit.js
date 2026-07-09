/**
 * Emailit API client (https://emailit.com) — transactional sending + marketing
 * contact sync. Uses native fetch (Node 18+), so no extra dependency is needed.
 * 
 * Configuration priority:
 * 1. process.env.EMAILIT_API_KEY (synchronous, no race condition)
 * 2. Database settings table (async fallback)
 */
const API_BASE = 'https://api.emailit.com/v2';

// Lazy-load the DB (avoids circular require at module init time).
let _knex;
function db() { if (!_knex) _knex = require('../config/db'); return _knex; }

/** Read a setting from DB: DB value first, then .env, otherwise undefined. */
async function getSetting(key) {
  try {
    const row = await db()('settings').where({ key }).first();
    if (row && row.value) return row.value;
  } catch (_) { /* table may not exist yet */ }
  return process.env[key] || undefined;
}

// Synchronous check - uses env var directly (no race condition)
let apiKey = process.env.EMAILIT_API_KEY || null;
let fromEmail = process.env.EMAILIT_FROM_EMAIL || process.env.MAIL_FROM || 'GDCU <no-reply@gdcu.edu>';
let _isConfigured = Boolean(apiKey && !apiKey.includes('xxx'));

// Promise for async initialization - resolves when config is ready
let _initPromise = null;

/** Check if Emailit is configured (synchronous, no race condition). */
function isConfigured() { return _isConfigured; }

/** Get the configured from email address. */
function getFromEmail() { return fromEmail; }

/** Initialize from DB (async, waits for completion). */
async function initFromDB() {
  if (_initPromise) return _initPromise; // Already initializing
  if (_isConfigured) return Promise.resolve(); // Already configured from env
  
  _initPromise = (async () => {
    const key = await getSetting('EMAILIT_API_KEY');
    const from = await getSetting('EMAILIT_FROM_EMAIL');
    if (key && !key.includes('xxx')) {
      apiKey = key;
      fromEmail = from || fromEmail;
      _isConfigured = true;
    }
  })().catch(() => {});
  
  return _initPromise;
}

/** Ensure config is loaded before sending (call this before sendEmail). */
async function ensureConfigured() {
  if (_isConfigured) return true;
  await initFromDB();
  return _isConfigured;
}

// Auto-init from DB on module load (fire-and-forget so it doesn't block app startup).
initFromDB().catch(() => {});

async function request(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Emailit API error (${res.status})`);
  return data;
}

/** Send a transactional email via the Emailit API. Waits for config if needed. */
async function sendEmail({ from, to, subject, html, text, replyTo }) {
  // Ensure config is loaded before sending
  await ensureConfigured();
  
  if (!_isConfigured) {
    throw new Error('Emailit not configured - no API key found');
  }
  
  return request('/emails', {
    from: from || fromEmail,
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
 * campaigns). Requires EMAILIT_AUDIENCE_ID; a no-op otherwise. Callers should
 * treat this as fire-and-forget — never let a sync failure break the caller.
 */
async function upsertContact({ email, firstName, lastName, tags }) {
  const audienceId = process.env.EMAILIT_AUDIENCE_ID;
  if (!await ensureConfigured() || !audienceId || !email) return null;
  return request(`/audiences/${audienceId}/contacts`, {
    email,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    tags: tags || undefined,
  });
}

module.exports = { isConfigured, getFromEmail, ensureConfigured, sendEmail, upsertContact };