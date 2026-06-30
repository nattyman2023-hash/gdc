/**
 * HTTP server bootstrap.
 *
 * Listen FIRST, then run migrations in the background. Building the schema
 * before listening previously made the host kill the slow-to-start app
 * mid-migration. We deliberately do NOT install custom uncaughtException /
 * unhandledRejection handlers: Node's default is to log and exit, which lets
 * the host's process manager restart a genuinely broken process cleanly
 * (swallowing those errors left the process hung — bound but not responding).
 */
require('dotenv').config();

const app = require('./app');
const knex = require('./config/db');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`✓ GDCU listening on ${PORT}`);
  runStartupTasks();
});

async function runStartupTasks() {
  try {
    // Clear any stale migration lock left by a previously interrupted boot,
    // then apply pending migrations. Errors here are logged but do not take
    // the server down — it keeps serving pages that don't need the new schema.
    try {
      await knex.migrate.forceFreeMigrationsLock();
    } catch (e) {
      // No lock table yet (fresh database) — nothing to free.
    }
    await knex.migrate.latest();
    // eslint-disable-next-line no-console
    console.log('✓ Database migrations are up to date');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Migration error (continuing to serve):', err);
  }

  // Daily attendance sweep: escalating warning emails to inactive students.
  if (process.env.NODE_ENV !== 'test') {
    const { runSweep } = require('./lib/attendance');
    const sweep = () => runSweep()
      // eslint-disable-next-line no-console
      .then((s) => console.log(`✓ Attendance sweep: ${s.sent} warning(s) sent`, s.byStage))
      // eslint-disable-next-line no-console
      .catch((e) => console.error('Attendance sweep failed:', e.message));
    setTimeout(sweep, 60 * 1000); // once, shortly after boot
    setInterval(sweep, 24 * 60 * 60 * 1000); // then daily
  }
}

module.exports = server;
