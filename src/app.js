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

const knex = require('./config/db');
const locals = require('./middleware/locals');
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
        frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
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

// ─── Response cache (production only) ────────────────────────
app.use(cache(60 * 1000)); // Cache public pages for 60 seconds

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
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
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

// ─── Routes ──────────────────────────────────────────────────
app.use('/', require('./routes/public'));
app.use('/programs', require('./routes/programs'));
app.use('/admissions', require('./routes/admissions'));
app.use('/news', require('./routes/news'));
app.use('/', require('./routes/contact'));
app.use('/', require('./routes/auth'));
app.use('/portal', require('./routes/portal'));
app.use('/faculty', require('./routes/faculty'));
app.use('/notifications', require('./routes/notifications'));
app.use('/admin/content', require('./routes/adminContent'));
app.use('/admin/users', require('./routes/adminUsers'));
app.use('/admin', require('./routes/admin'));
app.use('/webhooks/stripe', require('./routes/stripeWebhook'));

// ─── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('errors/404', { pageTitle: 'Page not found' });
});

// ─── Error handler ───────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(err.status || 500).render('errors/500', {
    pageTitle: 'Something went wrong',
    showDetail: process.env.NODE_ENV !== 'production',
    detail: err.message,
  });
});

module.exports = app;

