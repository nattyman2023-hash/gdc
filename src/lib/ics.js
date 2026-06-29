/**
 * Minimal iCalendar (.ics) generation for calendar invites.
 */
function icsDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildIcs({ uid, start, end, summary, description, location }) {
  const startD = new Date(start);
  const endD = end ? new Date(end) : new Date(startD.getTime() + 30 * 60000);
  const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GDCU//Interview//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@gdcu`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(startD)}`,
    `DTEND:${icsDate(endD)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = { buildIcs };
