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
  try {
    // Require here (not at module top) so that a load-time failure — e.g. the
    // database module throwing while it connects — is caught and shown by the
    // diagnostic server instead of crashing silently into a blank 503.
    const app = require('./app');
    const knex = require('./config/db');
    // Run any pending migrations on boot so a fresh deploy is ready to serve.
    await knex.migrate.latest();
    // eslint-disable-next-line no-console
    console.log('✓ Database migrations are up to date');

    app.listen(PORT, () => {
      appStarted = true;
      // eslint-disable-next-line no-console
      console.log(`✓ GDCU running at ${process.env.APP_URL || `http://localhost:${PORT}`}`);
    });

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
    startDiagnosticServer(err);
  }
}

// Catch anything that escapes the try/catch (e.g. an async DB pool error
// surfacing after boot) so it's shown rather than crashing into a 503.
process.on('unhandledRejection', (err) => startDiagnosticServer(err));
process.on('uncaughtException', (err) => startDiagnosticServer(err));

start();
