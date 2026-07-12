/**
 * The 4-hour drip-feed cooldown between lessons was built and wired
 * correctly (src/lib/lms.js isLessonAvailable/blockLessonAvailable), but
 * every course had drip_feed_enabled=false (the column's own default), so
 * the gate never actually applied to any course, certificate/diploma
 * included. Turn it on everywhere, and flip the column default so newly
 * created courses have it enabled from the start.
 */
// Deliberately a plain data UPDATE only — no schema .alter(). On SQLite,
// altering a column's default rebuilds the whole table (rename → create →
// copy → drop old), and with `PRAGMA foreign_keys=ON` (enabled for every
// connection in this app), dropping the renamed-away old `courses` table
// mid-rebuild cascades DELETEs onto every child row referencing it
// (modules.course_id, course_shared_modules.course_id, enrollments, etc.)
// — this was discovered the hard way, wiping the local dev DB's modules
// and course_shared_modules tables. The application layer always sets
// drip_feed_enabled explicitly on course creation (src/routes/admin.js), so
// there's no real need to touch the column default at all.
exports.up = async function (knex) {
  await knex('courses').update({ drip_feed_enabled: true });
};

exports.down = async function (knex) {
  await knex('courses').update({ drip_feed_enabled: false });
};
