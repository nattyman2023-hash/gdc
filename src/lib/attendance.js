/**
 * Attendance / engagement engine.
 *
 * A student's engagement is derived live from their last login (or account
 * creation if they have never logged in). Status therefore "refreshes
 * dynamically" — the moment a student logs in, last_login_at moves forward and
 * they are Active again on every screen, and a fresh absence streak resets the
 * warning escalation.
 */
const knex = require('../config/db');
const { notifyUser, email } = require('./notify');

// Escalation stages, keyed by minimum days of inactivity.
const STAGES = [
  {
    stage: 1, minDays: 7, key: 'week1',
    label: 'Week 1 — gentle nudge',
    subject: 'We miss you at GDCU — check back in',
    heading: 'We haven’t seen you in a while',
    body: (name) => `<p>Dear ${name},</p>
      <p>We’ve noticed it has been over a week since you last logged in to your GDCU studies. We understand life gets busy — this is just a friendly nudge to log back in and pick up where you left off.</p>
      <p>If anything is getting in the way, reply to this email and our student support team will be glad to help.</p>`,
  },
  {
    stage: 2, minDays: 14, key: 'week2',
    label: 'Week 2 — firm reminder',
    subject: 'Action needed: you’ve been away from GDCU for two weeks',
    heading: 'It’s been two weeks — let’s get you back on track',
    body: (name) => `<p>Dear ${name},</p>
      <p>Our records show you have not logged in for <strong>two weeks</strong>. Sustained engagement is an important part of your programme, and falling behind can affect your progress and standing.</p>
      <p>Please log in this week to resume your studies. If you are facing difficulties, contact student support now so we can put support in place before this escalates.</p>`,
  },
  {
    stage: 3, minDays: 21, key: 'week3',
    label: 'Week 3 — final notice',
    subject: 'FINAL NOTICE: risk of withdrawal from your GDCU programme',
    heading: 'Final notice regarding your enrolment',
    body: (name) => `<p>Dear ${name},</p>
      <p>You have now been inactive for <strong>three weeks or more</strong>. This is a <strong>final notice</strong>: if we do not see you re-engage with your studies, your enrolment may be placed under review and your place on the programme could be <strong>withdrawn</strong>.</p>
      <p>To avoid this, please log in immediately and contact student support to confirm your intention to continue. We genuinely want to help you finish what you started — but we need to hear from you now.</p>`,
  },
];

/** Days since the student was last seen (login, else account creation). */
function daysInactive(user, now = Date.now()) {
  const ref = user.last_login_at ? new Date(user.last_login_at) : new Date(user.created_at);
  return Math.floor((now - ref.getTime()) / 86400000);
}

/** Engagement descriptor for a single user, computed live. */
function engagementFor(user, now = Date.now()) {
  const days = daysInactive(user, now);
  let stage = 0;
  for (const s of STAGES) if (days >= s.minDays) stage = s.stage;
  const map = {
    0: { label: 'Active', tone: 'active' },
    1: { label: 'Inactive 1 week', tone: 'warn' },
    2: { label: 'Inactive 2 weeks', tone: 'warn2' },
    3: { label: 'At risk (3+ weeks)', tone: 'risk' },
  };
  return { days, stage, neverLoggedIn: !user.last_login_at, ...map[stage] };
}

/** Record a login (called from the auth flow). */
async function recordLogin(userId) {
  try { await knex('login_events').insert({ user_id: userId }); } catch (e) { /* non-fatal */ }
}

/**
 * Sweep all active students and send the appropriate escalation email.
 * Each stage fires at most once per absence streak (we only count warnings sent
 * after the student's last login). Safe to run daily.
 */
async function runSweep({ dryRun = false } = {}) {
  const now = Date.now();
  const students = await knex('users').where({ role: 'student', status: 'active' });
  const summary = { checked: students.length, sent: 0, byStage: { 1: 0, 2: 0, 3: 0 } };

  for (const student of students) {
    const eng = engagementFor(student, now);
    if (!eng.stage) continue;
    const cfg = STAGES.find((s) => s.stage === eng.stage);
    const since = student.last_login_at ? new Date(student.last_login_at) : new Date(student.created_at);

    // Already warned at this stage during the current absence streak?
    const already = await knex('attendance_warnings')
      .where({ user_id: student.id, stage: eng.stage })
      .where('sent_at', '>=', since.toISOString().slice(0, 19).replace('T', ' '))
      .first();
    if (already) continue;

    summary.sent += 1;
    summary.byStage[eng.stage] += 1;
    if (dryRun) continue;

    await knex('attendance_warnings').insert({ user_id: student.id, stage: eng.stage });
    const name = student.first_name || 'student';
    email({
      to: student.email, toName: `${student.first_name} ${student.last_name || ''}`.trim(),
      subject: cfg.subject, heading: cfg.heading, bodyHtml: cfg.body(name),
      relatedType: 'attendance', relatedId: student.id,
    });
    notifyUser(student.id, { type: 'attendance', title: cfg.heading, body: 'Please log in to resume your studies.' });
  }
  return summary;
}

module.exports = { STAGES, engagementFor, daysInactive, recordLogin, runSweep };
