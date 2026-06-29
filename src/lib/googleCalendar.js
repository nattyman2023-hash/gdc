/**
 * Google Calendar integration — SCAFFOLD.
 *
 * This is wired through the app but stays dormant until OAuth credentials are
 * provided via env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.
 * Until then `isConfigured` is false and every function is a safe no-op, so the
 * rest of the app behaves exactly as before.
 *
 * When you're ready to switch it on:
 *   1. Create an OAuth client in Google Cloud Console (type: Web application).
 *   2. Add the redirect URI (e.g. https://your-domain/faculty/calendar/callback).
 *   3. Set the three env vars above and `npm i googleapis`.
 *   4. Replace the stubbed bodies below with real googleapis calls.
 */
const knex = require('../config/db');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
const isConfigured = Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);

/** Has this user connected a calendar? */
async function getConnection(userId) {
  if (!userId) return null;
  try { return await knex('calendar_connections').where({ user_id: userId }).first(); }
  catch { return null; }
}

/** Build the Google consent URL (only meaningful once configured). */
function getAuthUrl(state) {
  if (!isConfigured) return null;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    state: state || '',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange an auth code for tokens and persist the connection. (Stub.) */
async function handleCallback(/* userId, code */) {
  if (!isConfigured) throw new Error('Google Calendar is not configured.');
  // TODO: exchange code → tokens via googleapis, then upsert calendar_connections.
  throw new Error('Google Calendar exchange not yet implemented — add googleapis and credentials.');
}

/** Push an interview to the host's connected calendar. No-op when not configured. */
async function createInterviewEvent(hostUserId, { summary, description, startsAt, durationMins = 30, location }) {
  if (!isConfigured || !hostUserId) return { skipped: true };
  const conn = await getConnection(hostUserId);
  if (!conn) return { skipped: true };
  // TODO: use stored tokens to insert an event into conn.calendar_id.
  return { skipped: true };
}

async function disconnect(userId) {
  try { await knex('calendar_connections').where({ user_id: userId }).del(); } catch { /* ignore */ }
}

module.exports = { isConfigured, getConnection, getAuthUrl, handleCallback, createInterviewEvent, disconnect };
