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

/**
 * Create a first admin account if none exists yet. Safe to run on every boot:
 * it only inserts when there is no admin, so it never clobbers a later password
 * or email change made from the admin panel. Email/password come from the
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars (recommended), with sensible
 * defaults so the site is reachable out of the box.
 */
async function ensureAdminUser() {
  const existing = await knex('users').where({ role: 'admin' }).first();
  if (existing) return;
  const bcrypt = require('bcryptjs');
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@gdc.university';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!2026';
  const hash = await bcrypt.hash(password, 12);
  await knex('users').insert({
    first_name: 'GDCU',
    last_name: 'Administrator',
    email,
    password_hash: hash,
    role: 'admin',
    status: 'active',
  });
  // eslint-disable-next-line no-console
  console.log(`✓ Created initial admin user: ${email}`);
}

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

  // Independent of migrations: ensure an admin exists so the panel is reachable.
  try {
    await ensureAdminUser();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('ensureAdminUser failed:', err);
  }

  // Course content is provisioned via restore-courses.sql (imported through
  // phpMyAdmin) — see scripts/export-lms.js. The old boot-time seed script was
  // removed; nothing to run here.

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
