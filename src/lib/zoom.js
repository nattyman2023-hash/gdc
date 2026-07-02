/**
 * Zoom API integration (Server-to-Server OAuth).
 *
 * Used to create/manage meetings for live classroom streaming and webinars.
 * Configure in .env:
 *   ZOOM_ACCOUNT_ID  — from your Zoom Server-to-Server OAuth app
 *   ZOOM_CLIENT_ID
 *   ZOOM_CLIENT_SECRET
 *
 * Gracefully degrades: when unconfigured every function returns null and the
 * admin UI falls back to manually pasted join URLs.
 *
 * Docs: https://developers.zoom.us/docs/internal-apps/s2s-oauth/
 */
const ZOOM_API = 'https://api.zoom.us/v2';
const ZOOM_OAUTH = 'https://zoom.us/oauth/token';

function isConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET &&
    !/xxx/i.test(process.env.ZOOM_CLIENT_SECRET)
  );
}

// ─── Token cache (S2S tokens last 1 hour) ────────────────────
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (!isConfigured()) return null;
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry - 60_000) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(
    `${ZOOM_OAUTH}?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID)}`,
    { method: 'POST', headers: { Authorization: `Basic ${credentials}` } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Zoom OAuth failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function zoomFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${ZOOM_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return {};
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Zoom API ${options.method || 'GET'} ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Create a scheduled Zoom meeting for a live class or webinar.
 * @param {object} opts { topic, startsAt (Date|string), durationMin, agenda }
 * @returns {object|null} { meetingId, joinUrl, startUrl, passcode } or null when unconfigured.
 */
async function createMeeting({ topic, startsAt, durationMin = 60, agenda = '' }) {
  if (!isConfigured()) return null;
  const start = startsAt ? new Date(startsAt) : new Date();
  const meeting = await zoomFetch('/users/me/meetings', {
    method: 'POST',
    body: JSON.stringify({
      topic: String(topic || 'GDCU Live Session').slice(0, 200),
      type: 2, // scheduled
      start_time: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      duration: Math.max(15, Math.min(durationMin, 720)),
      timezone: 'UTC',
      agenda: String(agenda || '').slice(0, 2000),
      settings: {
        host_video: true,
        participant_video: false,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: true,
        approval_type: 2,
        audio: 'both',
        auto_recording: 'cloud',
      },
    }),
  });
  if (!meeting) return null;
  return {
    meetingId: String(meeting.id),
    joinUrl: meeting.join_url,
    startUrl: meeting.start_url,
    passcode: meeting.password || null,
  };
}

/** Update an existing meeting's topic/time. Returns true on success. */
async function updateMeeting(meetingId, { topic, startsAt, durationMin }) {
  if (!isConfigured() || !meetingId) return false;
  const body = {};
  if (topic) body.topic = String(topic).slice(0, 200);
  if (startsAt) body.start_time = new Date(startsAt).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (durationMin) body.duration = Math.max(15, Math.min(durationMin, 720));
  await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return true;
}

/** Delete a meeting (best-effort — swallows 404s). */
async function deleteMeeting(meetingId) {
  if (!isConfigured() || !meetingId) return false;
  try {
    await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, { method: 'DELETE' });
    return true;
  } catch (err) {
    if (/\(404\)/.test(err.message)) return true;
    throw err;
  }
}

/** Fetch cloud recordings for a meeting (used to auto-fill recording_url). */
async function getRecordings(meetingId) {
  if (!isConfigured() || !meetingId) return null;
  try {
    const data = await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}/recordings`);
    return data && data.share_url ? { shareUrl: data.share_url } : null;
  } catch (err) {
    if (/\(404\)/.test(err.message)) return null;
    throw err;
  }
}

module.exports = { isConfigured, createMeeting, updateMeeting, deleteMeeting, getRecordings };
