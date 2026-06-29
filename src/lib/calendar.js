/**
 * Academic-calendar helpers: which audiences see what, category metadata,
 * and grouping events by month for display.
 */
const knex = require('../config/db');

const CATEGORIES = {
  closure:  { label: 'Closure',   icon: 'event_busy',     tone: 'bg-error-container text-on-error-container' },
  opening:  { label: 'Open',      icon: 'event_available', tone: 'bg-secondary-container text-on-secondary-container' },
  term:     { label: 'Term',      icon: 'school',          tone: 'bg-secondary-fixed text-on-secondary-fixed' },
  deadline: { label: 'Deadline',  icon: 'schedule',        tone: 'bg-tertiary-container text-on-tertiary-container' },
  holiday:  { label: 'Holiday',   icon: 'celebration',     tone: 'bg-surface-container-high text-on-surface-variant' },
  exam:     { label: 'Exam',      icon: 'quiz',            tone: 'bg-tertiary-container text-on-tertiary-container' },
  event:    { label: 'Event',     icon: 'event',           tone: 'bg-secondary-fixed text-on-secondary-fixed' },
};

const AUDIENCES = ['all', 'public', 'students', 'faculty', 'staff'];

/** Audiences a given viewer is allowed to see. */
function audiencesFor(role) {
  if (role === 'public' || !role) return ['all', 'public'];
  if (role === 'student') return ['all', 'public', 'students'];
  if (role === 'faculty') return ['all', 'public', 'faculty'];
  // staff/admin see everything
  return AUDIENCES;
}

/** Upcoming published events visible to a viewer role. */
async function upcomingFor(role, { limit = 50, includePast = false } = {}) {
  const allowed = audiencesFor(role);
  const q = knex('calendar_events').where({ published: true }).whereIn('audience', allowed);
  if (!includePast) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // keep events whose end (or start, if no end) is still in the future
    q.where(function () {
      this.where('ends_at', '>=', now).orWhere(function () {
        this.whereNull('ends_at').andWhere('starts_at', '>=', now);
      });
    });
  }
  return q.orderBy('starts_at').limit(limit);
}

/** Group a flat list of events into [{ key, label, events }] by month. */
function groupByMonth(events) {
  const groups = [];
  const index = {};
  for (const e of events) {
    const d = new Date(e.starts_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!index[key]) {
      index[key] = { key, label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), events: [] };
      groups.push(index[key]);
    }
    index[key].events.push(e);
  }
  return groups;
}

module.exports = { CATEGORIES, AUDIENCES, audiencesFor, upcomingFor, groupByMonth };
