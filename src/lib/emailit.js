/**
 * Emailit API client (https://emailit.com) — transactional sending + marketing
 * contact sync. Uses native fetch (Node 18+), so no extra dependency is needed.
 * No-op (isConfigured=false) when EMAILIT_API_KEY is not set.
 */
const API_BASE = 'https://api.emailit.com/v2';

const apiKey = process.env.EMAILIT_API_KEY;
const isConfigured = Boolean(apiKey);

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

/** Send a transactional email via the Emailit API. */
async function sendEmail({ from, to, subject, html, text, replyTo }) {
  return request('/emails', {
    from,
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
  if (!isConfigured || !audienceId || !email) return null;
  return request(`/audiences/${audienceId}/contacts`, {
    email,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    tags: tags || undefined,
  });
}

module.exports = { isConfigured, sendEmail, upsertContact };
