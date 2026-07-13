/**
 * Express application setup for Global Diaspora Christian University.
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const ConnectSessionKnexStore = require('connect-session-knex')(session);
const flash = require('connect-flash');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');

const knex = require('./config/db');
const locals = require('./middleware/locals');
const { permissionLocals } = require('./middleware/auth');
const { formatMoney, formatMinor, formatDate, formatDateTime, truncate, imageFor, videoEmbed } = require('./lib/helpers');

const maintenance = require('./middleware/maintenance');
const cache = require('./middleware/cache');

const app = express();

// Behind Hostinger / a reverse proxy — needed for secure cookies & correct IPs.
app.set('trust proxy', 1);

// ─── Maintenance mode ────────────────────────────────────────
app.use(maintenance);

// ─── View engine ─────────────────────────────────────────────
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/base');

// ─── Security & performance ──────────────────────────────────
// CSP is configured to allow the CDNs the design system relies on
// (Tailwind Play, Google Fonts, Material Symbols) and Stripe.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://js.stripe.com'],
        // Allow inline event handlers (onclick row-navigation, confirm dialogs).
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.onestream.live', 'https://onestream.live'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
    // YouTube/Vimeo reject embeds when no referrer is sent (Helmet's default is
    // `no-referrer`, which triggers YouTube "Error 153"). Send the origin instead.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate limiting (auth only - global limiter used in production) ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
});
app.use('/login', authLimiter);
app.use('/register', authLimiter);

// ─── HTTPS redirect (production only) ────────────────────────
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ─── Health check (Hostinger monitoring) ─────────────────────
app.get('/health', (req, res) => {
  const ready = app.locals.migrationsReady !== false;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'starting',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    commit: app.locals.deployedCommit,
    bootedAt: app.locals.bootedAt,
    error: app.locals.startupError || undefined,
  });
});

// ─── Stripe webhook (needs the RAW body, so mount BEFORE json parser) ──
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// ─── Body parsing & static assets ────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
}));

// ─── Sessions & flash ────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production.');
}
app.use(
  session({
    store: new ConnectSessionKnexStore({ knex, tablename: 'sessions', createtable: false, cleanupInterval: 900000 }),
    secret: process.env.SESSION_SECRET || 'insecure-dev-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);
app.use(flash());
app.use(locals);
app.use(permissionLocals);

// Protect all browser state-changing requests. Stripe signs its own webhook
// payload, so that endpoint is deliberately excluded from CSRF/session checks.
const csrfProtection = csrf();
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks/stripe') || req.path.startsWith('/api/mobile')) return next();
  return csrfProtection(req, res, next);
});
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

// ─── Response cache (production only) ────────────────────────
// Must come AFTER session/locals — its "skip if logged in" check reads
// req.session.user, which doesn't exist until the session middleware runs.
// Caching earlier in the chain served one visitor's authenticated header
// (My Portal / Sign out) to the next anonymous visitor on the same URL,
// and could just as easily serve a logged-in user a stale logged-out page.
app.use(cache(60 * 1000)); // Cache public pages for 60 seconds

// View helpers available in every template.
app.locals.formatMoney = formatMoney;
app.locals.formatMinor = formatMinor;
app.locals.formatDate = formatDate;
app.locals.formatDateTime = formatDateTime;
app.locals.truncate = truncate;
app.locals.imageFor = imageFor;
app.locals.videoEmbed = videoEmbed;
// Cache-busting token for static assets (changes each boot/deploy) so updated
// JS/CSS is always picked up instead of a stale 7-day-cached copy.
app.locals.assetVersion = process.env.ASSET_VERSION || String(Date.now());

// Which commit is actually running — shown on Admin → Settings so "did my
// deploy actually go out" is never a guessing game again.
try {
  // eslint-disable-next-line global-require
  app.locals.deployedCommit = require('child_process').execSync('git rev-parse --short HEAD').toString().trim();
} catch (_) {
  app.locals.deployedCommit = 'unknown';
}
app.locals.bootedAt = new Date().toISOString();

// ─── Routes ──────────────────────────────────────────────────
app.use('/', require('./routes/public'));
app.use('/programs', require('./routes/programs'));
app.use('/admissions', require('./routes/admissions'));
app.use('/news', require('./routes/news'));
app.use('/', require('./routes/contact'));
app.use('/', require('./routes/auth'));
app.use('/api/mobile/v1', require('./routes/mobileApi'));
app.use('/portal', require('./routes/portal'));
app.use('/faculty', require('./routes/faculty'));
app.use('/notifications', require('./routes/notifications'));
app.use('/admin/content', require('./routes/adminContent'));
app.use('/admin/users', require('./routes/adminUsers'));
app.use('/admin/settings', require('./routes/adminSettings'));
app.use('/admin', require('./routes/admin'));
app.use('/webhooks/stripe', require('./routes/stripeWebhook'));
app.use('/chat', require('./routes/chat'));
app.use('/cohorts', require('./routes/cohorts'));
app.use('/', require('./routes/stripeCheckout'));
app.use('/admin/faculty', require('./routes/adminFaculty'));
app.use('/admin/preview', require('./routes/adminPreview'));
app.use('/', require('./routes/publicPages'));

// Fetch-based builder actions must receive JSON even when a route is missing
// or throws. Returning an HTML error page here makes the browser display the
// template/code response as if it were the result of the reorder request.
function wantsJson(req) {
  return req.path.startsWith('/api/') || req.get('X-Requested-With') === 'fetch' || req.is('application/json');
}

// ─── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  if (wantsJson(req)) return res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
  res.status(404).render('errors/404', { pageTitle: 'Page not found' });
});

// ─── Error handler ───────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  // Keep stack traces in the server logs, but never put source paths or
  // template code into a live browser response. This is especially important
  // for admin pages, where an error should still be a normal, readable page.
  const showDetail = process.env.NODE_ENV !== 'production';
  if (wantsJson(req)) {
    return res.status(err.status || 500).json({ error: {
      code: 'server_error',
      message: showDetail ? (err.message || 'Unexpected server error.') : 'Unexpected server error.',
    } });
  }
  res.status(err.status || 500).render('errors/500', {
    pageTitle: 'Something went wrong',
    showDetail,
    detail: showDetail ? (err.stack || err.message) : null,
  });
});

module.exports = app;
