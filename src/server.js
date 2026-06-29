/**
 * HTTP server bootstrap. Ensures the database schema exists before listening.
 */
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// TEMPORARY DIAGNOSTIC: when startup fails (e.g. the database can't be reached
// or a migration errors), Hostinger only shows a blank 503 because the process
// exits. Instead, start a tiny server that prints the real error so we can see
// it in the browser. REMOVE this block once the deploy is healthy.
let appStarted = false;
let diagnosticStarted = false;
function startDiagnosticServer(err) {
  // If the real app already bound the port, don't fight it for the port.
  if (appStarted || diagnosticStarted) return;
  diagnosticStarted = true;
  const http = require('http');
  const message = err && err.stack ? err.stack : String(err);
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  http
    .createServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`GDCU failed to start.\n\n${message}\n`);
    })
    .listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`⚠ Diagnostic server running on ${PORT} — startup failed`);
    });
}

async function start() {
  let app;
  let knex;
  try {
    // Require here (not at module top) so that a load-time failure — e.g. the
    // database module throwing while it connects — is caught and shown by the
    // diagnostic server instead of crashing silently into a blank 503.
    app = require('./app');
    knex = require('./config/db');
  } catch (err) {
    startDiagnosticServer(err);
    return;
  }

  // Open the port FIRST, then migrate. The hosting platform restarts the app if
  // it doesn't start listening quickly; building 32 tables on boot took longer
  // than that grace period, so the app was killed and restarted mid-migration —
  // re-running an add-column step and failing with "duplicate column". Binding
  // the port immediately keeps the platform happy while migrations finish.
  const server = app.listen(PORT, () => {
    appStarted = true;
    // eslint-disable-next-line no-console
    console.log(`✓ GDCU listening on ${PORT} — running migrations…`);
  });

  try {
    // A boot that was interrupted mid-migration can leave the migration lock
    // stuck ("Migration table is already locked"); clear any stale lock first.
    try {
      await knex.migrate.forceFreeMigrationsLock();
    } catch (e) {
      // No lock table yet (fresh database) — nothing to free.
    }
    await knex.migrate.latest();
    // eslint-disable-next-line no-console
    console.log('✓ Database migrations are up to date');

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
  } catch (err) {
    // Migrations failed after the port was bound — tear the server down and
    // surface the real error through the diagnostic page.
    // eslint-disable-next-line no-console
    console.error('Migration failed:', err);
    appStarted = false;
    server.close(() => startDiagnosticServer(err));
  }
}

// Catch anything that escapes the try/catch (e.g. an async DB pool error
// surfacing after boot) so it's shown rather than crashing into a 503.
process.on('unhandledRejection', (err) => startDiagnosticServer(err));
process.on('uncaughtException', (err) => startDiagnosticServer(err));

start();
