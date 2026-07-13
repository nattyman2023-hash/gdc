/**
 * Versioned JSON API for the student Android app.
 *
 * This API deliberately accepts student accounts only. Staff and admin
 * sessions cannot obtain mobile student tokens, and every protected request
 * is scoped to the student represented by its bearer token.
 */
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const knex = require('../config/db');
const { getStripe } = require('../lib/stripe');
const programmes = require('../lib/programmes');
const {
  getCourseAccess,
  getCourseStructure,
  isLessonAvailable,
  completeLessonWithDrip,
} = require('../lib/lms');
const { hashToken, requireMobileAuth } = require('../middleware/mobileAuth');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'too_many_attempts', message: 'Too many login attempts. Please try again later.' } },
});

const TOKEN_TTL_DAYS = 30;

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}

function fail(res, status, message, code = 'request_failed') {
  return res.status(status).json({ error: { code, message } });
}

function publicUser(user) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: `${user.first_name} ${user.last_name}`.trim(),
    email: user.email,
    role: 'student',
  };
}

function publicCourse(course) {
  return {
    id: course.id,
    slug: course.slug,
    code: course.code,
    title: course.title,
    summary: course.summary,
    description: course.description,
    credits: course.credits,
    icon: course.icon,
    featured_image: course.featured_image,
    program_id: course.program_id,
  };
}

function publicEnrollment(enrollment) {
  if (!enrollment) return null;
  return {
    id: enrollment.id,
    course_id: enrollment.course_id,
    status: enrollment.status,
    progress_pct: enrollment.progress_pct,
    enrolled_at: enrollment.enrolled_at,
    completed_at: enrollment.completed_at,
    payment_waived: Boolean(enrollment.payment_waived),
  };
}

function publicInvoice(invoice) {
  return {
    id: invoice.id,
    reference: invoice.reference,
    program_id: invoice.program_id,
    description: invoice.description,
    amount: Number(invoice.amount),
    currency: invoice.currency,
    due_date: invoice.due_date,
    status: invoice.status,
    payment_method: invoice.payment_method,
    paid_at: invoice.paid_at,
    is_overdue: Boolean(invoice.is_overdue),
  };
}

async function getStudentCourse(userId, slug) {
  const course = await knex('courses').where({ slug, published: true }).first();
  if (!course) return { course: null, enrollment: null };
  const enrollment = await knex('enrollments')
    .where({ user_id: userId, course_id: course.id })
    .whereIn('status', ['active', 'completed'])
    .first();
  return { course, enrollment };
}

function isValidId(value) {
  return /^\d+$/.test(String(value));
}

// ─── Authentication ─────────────────────────────────────────
router.post('/auth/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const deviceName = String(req.body.device_name || '').trim().slice(0, 120) || null;

  if (!email || !password) return fail(res, 422, 'Email and password are required.', 'validation_failed');

  const user = await knex('users').where({ email }).first();
  if (!user || user.status !== 'active' || user.role !== 'student' || !(await bcrypt.compare(password, user.password_hash))) {
    return fail(res, 401, 'Invalid student credentials.', 'invalid_credentials');
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await knex('mobile_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(rawToken),
    device_name: deviceName,
    expires_at: expiresAt,
  });
  await knex('users').where({ id: user.id }).update({ last_login_at: knex.fn.now() });

  return ok(res, { token: rawToken, token_type: 'Bearer', expires_at: expiresAt.toISOString(), user: publicUser(user) });
}));

router.post('/auth/logout', requireMobileAuth, asyncRoute(async (req, res) => {
  await knex('mobile_tokens').where({ id: req.mobileTokenId }).update({ revoked_at: knex.fn.now() });
  return ok(res, { logged_out: true });
}));

router.get('/auth/me', requireMobileAuth, asyncRoute(async (req, res) => ok(res, { user: publicUser(req.mobileUser) })));

// ─── Student dashboard ───────────────────────────────────────
router.get('/dashboard', requireMobileAuth, asyncRoute(async (req, res) => {
  const userId = req.mobileUser.id;
  const enrollments = await knex('enrollments')
    .join('courses', 'enrollments.course_id', 'courses.id')
    .where('enrollments.user_id', userId)
    .whereIn('enrollments.status', ['active', 'completed'])
    .select('enrollments.*', 'courses.slug as course_slug', 'courses.title as course_title', 'courses.code as course_code', 'courses.icon as course_icon', 'courses.featured_image')
    .orderBy('enrollments.enrolled_at', 'desc');
  const courseIds = enrollments.map((enrollment) => enrollment.course_id);
  const announcements = await knex('announcements')
    .where(function () {
      this.whereNull('course_id');
      if (courseIds.length) this.orWhereIn('course_id', courseIds);
    })
    .orderBy('published_at', 'desc')
    .limit(5);
  const certificates = await knex('certificates').where({ user_id: userId }).orderBy('issued_at', 'desc');
  const notifications = await knex('notifications').where({ user_id: userId }).orderBy('created_at', 'desc').limit(5);
  const outstandingRow = await knex('invoices').where({ user_id: userId }).whereIn('status', ['sent', 'overdue']).sum({ amount: 'amount' }).first();

  return ok(res, {
    user: publicUser(req.mobileUser),
    courses: enrollments.map((enrollment) => ({
      ...publicEnrollment(enrollment),
      course: {
        id: enrollment.course_id,
        slug: enrollment.course_slug,
        title: enrollment.course_title,
        code: enrollment.course_code,
        icon: enrollment.course_icon,
        featured_image: enrollment.featured_image,
      },
    })),
    announcements,
    certificates,
    notifications,
    outstanding_amount: Number(outstandingRow.amount || 0),
  });
}));

// ─── Courses and learning progress ───────────────────────────
router.get('/courses', requireMobileAuth, asyncRoute(async (req, res) => {
  const rows = await knex('enrollments')
    .join('courses', 'enrollments.course_id', 'courses.id')
    .where('enrollments.user_id', req.mobileUser.id)
    .whereIn('enrollments.status', ['active', 'completed'])
    .select(
      'enrollments.id as enrollment_id',
      'enrollments.course_id',
      'enrollments.status as enrollment_status',
      'enrollments.progress_pct',
      'enrollments.enrolled_at',
      'enrollments.completed_at',
      'enrollments.payment_waived',
      'courses.id as course_id_value',
      'courses.slug',
      'courses.program_id',
      'courses.code',
      'courses.title',
      'courses.summary',
      'courses.description',
      'courses.credits',
      'courses.icon',
      'courses.featured_image'
    )
    .orderBy('enrollments.enrolled_at', 'desc');
  return ok(res, {
    courses: rows.map((row) => ({
      course: publicCourse({ ...row, id: row.course_id_value }),
      enrollment: publicEnrollment({
        id: row.enrollment_id,
        course_id: row.course_id,
        status: row.enrollment_status,
        progress_pct: row.progress_pct,
        enrolled_at: row.enrolled_at,
        completed_at: row.completed_at,
        payment_waived: row.payment_waived,
      }),
    })),
  });
}));

router.get('/courses/:slug', requireMobileAuth, asyncRoute(async (req, res) => {
  const { course, enrollment } = await getStudentCourse(req.mobileUser.id, req.params.slug);
  if (!course) return fail(res, 404, 'Course not found.', 'not_found');
  const access = await getCourseAccess(req.mobileUser.id, course.id, { requirePaid: false });
  const paid = await programmes.hasPaidTuition(req.mobileUser.id, course.program_id);
  const structure = enrollment && paid ? await getCourseStructure(course.id, enrollment.id) : [];
  const quizzes = await knex('quizzes').where({ course_id: course.id }).select('id', 'title', 'description', 'pass_mark', 'time_limit_min', 'sort_order').orderBy('sort_order');
  return ok(res, {
    course: publicCourse(course),
    enrollment: publicEnrollment(enrollment),
    access: { allowed: Boolean(enrollment && paid), reason: enrollment ? (paid ? 'allowed' : 'payment_required') : 'not_enrolled' },
    modules: structure,
    quizzes,
  });
}));

router.get('/courses/:slug/lessons/:lessonId', requireMobileAuth, asyncRoute(async (req, res) => {
  if (!isValidId(req.params.lessonId)) return fail(res, 400, 'Invalid lesson id.', 'validation_failed');
  const { course, enrollment } = await getStudentCourse(req.mobileUser.id, req.params.slug);
  if (!course || !enrollment) return fail(res, 404, 'Enrolled course not found.', 'not_found');
  const access = await getCourseAccess(req.mobileUser.id, course.id);
  if (!access.allowed) return fail(res, 402, 'Tuition payment is required before course content can be opened.', 'payment_required');

  const structure = await getCourseStructure(course.id, enrollment.id);
  const lesson = structure.flatMap((module) => module.lessons).find((item) => item.id === Number(req.params.lessonId));
  if (!lesson) return fail(res, 404, 'Lesson not found.', 'not_found');
  const availability = await isLessonAvailable(enrollment.id, lesson.id, structure);
  const materials = await knex('lesson_materials').where({ lesson_id: lesson.id }).orderBy('sort_order');
  const comments = await knex('lesson_comments').where({ lesson_id: lesson.id }).orderBy('created_at', 'desc').limit(50);
  const note = await knex('lesson_notes').where({ lesson_id: lesson.id, user_id: req.mobileUser.id }).first();
  return ok(res, { course: publicCourse(course), lesson, availability, materials, comments, note });
}));

router.post('/courses/:slug/lessons/:lessonId/complete', requireMobileAuth, asyncRoute(async (req, res) => {
  if (!isValidId(req.params.lessonId)) return fail(res, 400, 'Invalid lesson id.', 'validation_failed');
  const { course, enrollment } = await getStudentCourse(req.mobileUser.id, req.params.slug);
  if (!course || !enrollment) return fail(res, 404, 'Enrolled course not found.', 'not_found');
  const access = await getCourseAccess(req.mobileUser.id, course.id);
  if (!access.allowed) return fail(res, 402, 'Tuition payment is required before course content can be opened.', 'payment_required');
  const structure = await getCourseStructure(course.id, enrollment.id);
  const lesson = structure.flatMap((module) => module.lessons).find((item) => item.id === Number(req.params.lessonId));
  if (!lesson) return fail(res, 404, 'Lesson not found.', 'not_found');
  const result = await completeLessonWithDrip(enrollment.id, lesson.id, structure);
  if (!result.success) return fail(res, 409, result.message, 'lesson_unavailable');
  const updatedEnrollment = await knex('enrollments').where({ id: enrollment.id }).first();
  return ok(res, { message: result.message, next_lesson: result.next_lesson || null, enrollment: publicEnrollment(updatedEnrollment) });
}));

// ─── Billing ──────────────────────────────────────────────────
router.get('/billing', requireMobileAuth, asyncRoute(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const invoices = await knex('invoices').where({ user_id: req.mobileUser.id }).whereNot('status', 'draft').orderBy('due_date');
  invoices.forEach((invoice) => {
    invoice.is_overdue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_date && String(invoice.due_date).slice(0, 10) < today;
  });
  return ok(res, { invoices: invoices.map(publicInvoice), outstanding_amount: invoices.filter((invoice) => ['sent', 'overdue'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount), 0) });
}));

router.get('/billing/invoices/:id', requireMobileAuth, asyncRoute(async (req, res) => {
  if (!isValidId(req.params.id)) return fail(res, 400, 'Invalid invoice id.', 'validation_failed');
  const invoice = await knex('invoices').where({ id: req.params.id, user_id: req.mobileUser.id }).first();
  if (!invoice || invoice.status === 'draft') return fail(res, 404, 'Invoice not found.', 'not_found');
  return ok(res, { invoice: publicInvoice(invoice) });
}));

router.post('/billing/invoices/:id/pay', requireMobileAuth, asyncRoute(async (req, res) => {
  if (!isValidId(req.params.id)) return fail(res, 400, 'Invalid invoice id.', 'validation_failed');
  const invoice = await knex('invoices').where({ id: req.params.id, user_id: req.mobileUser.id }).first();
  if (!invoice || invoice.status === 'draft' || invoice.status === 'void') return fail(res, 404, 'Invoice is not available for payment.', 'not_found');
  if (invoice.status === 'paid') return ok(res, { paid: true, invoice: publicInvoice(invoice) });

  const { stripe, isConfigured } = await getStripe();
  if (!isConfigured) {
    if (process.env.NODE_ENV === 'production') return fail(res, 503, 'Online payments are temporarily unavailable.', 'payments_unavailable');
    await knex('invoices').where({ id: invoice.id }).update({ status: 'paid', payment_method: 'manual (dev)', paid_at: knex.fn.now(), updated_at: knex.fn.now() });
    const paid = await knex('invoices').where({ id: invoice.id }).first();
    return ok(res, { paid: true, invoice: publicInvoice(paid) });
  }

  const currency = (invoice.currency || 'GBP').toLowerCase();
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: req.mobileUser.email,
    line_items: [{ price_data: { currency, product_data: { name: invoice.description, description: `Invoice ${invoice.reference}` }, unit_amount: Math.round(Number(invoice.amount) * 100) }, quantity: 1 }],
    metadata: { kind: 'invoice', invoice_id: String(invoice.id), reference: invoice.reference },
    success_url: `${process.env.APP_URL}/portal/billing?paid=${invoice.reference}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/portal/billing?cancelled=1`,
  });
  await knex('invoices').where({ id: invoice.id }).update({ stripe_session_id: checkout.id, updated_at: knex.fn.now() });
  return ok(res, { paid: false, checkout_url: checkout.url, invoice: publicInvoice(invoice) });
}));

// ─── Notifications and profile ───────────────────────────────
router.get('/notifications', requireMobileAuth, asyncRoute(async (req, res) => {
  const notifications = await knex('notifications').where({ user_id: req.mobileUser.id }).orderBy('created_at', 'desc').limit(100);
  return ok(res, { notifications });
}));

router.post('/notifications/read-all', requireMobileAuth, asyncRoute(async (req, res) => {
  await knex('notifications').where({ user_id: req.mobileUser.id, read: false }).update({ read: true });
  return ok(res, { read_all: true });
}));

router.get('/profile', requireMobileAuth, asyncRoute(async (req, res) => {
  const user = await knex('users').where({ id: req.mobileUser.id }).first();
  const safe = { ...user };
  delete safe.password_hash;
  return ok(res, { user: safe });
}));

module.exports = router;
