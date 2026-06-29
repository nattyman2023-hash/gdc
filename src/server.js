/**
 * HTTP server bootstrap. Ensures the database schema exists before listening.
 */
require('dotenv').config();

const app = require('./app');
const knex = require('./config/db');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Run any pending migrations on boot so a fresh deploy is ready to serve.
    await knex.migrate.latest();
    // eslint-disable-next-line no-console
    console.log('✓ Database migrations are up to date');

    app.listen(PORT, () => {
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
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
