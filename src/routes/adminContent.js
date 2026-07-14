/**
 * In-admin content management — staff can manage Programs, Courses
 * (with modules & lessons), News and FAQs without touching code.
 * Mounted at /admin/content; requires staff/admin (guarded by parent mount).
 */
const express = require('express');
const knex = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { slugify } = require('../lib/helpers');
const { notifyUser } = require('../lib/notify');
const { isConfigured: zoomConfigured, createMeeting, updateMeeting } = require('../lib/zoom');

// Notify the relevant students about an announcement (course cohort or all students).
async function notifyAnnouncement(courseId, title) {
  let userIds;
  if (courseId) userIds = await knex('enrollments').where({ course_id: courseId }).pluck('user_id');
  else userIds = await knex('users').where({ role: 'student', status: 'active' }).pluck('id');
  for (const id of userIds) await notifyUser(id, { type: 'info', title: 'New announcement', body: title, link: '/portal' });
}

const router = express.Router();

router.use(requirePermission('manage_content'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.adminActive = '';
  next();
});

// Ensure a slug is unique within a table (appends -2, -3, … if needed).
async function uniqueSlug(table, base, ignoreId = null) {
  let slug = slugify(base) || 'item';
  let candidate = slug;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = knex(table).where({ slug: candidate });
    if (ignoreId) q.whereNot('id', ignoreId);
    const exists = await q.first();
    if (!exists) return candidate;
    n += 1;
    candidate = `${slug}-${n}`;
  }
}

const bool = (v) => v === 'on' || v === 'true' || v === '1' || v === true;

/* ─────────────────────────── PROGRAMS ─────────────────────── */
router.get('/programs', async (req, res, next) => {
  try {
    const programs = await knex('programs').orderBy('sort_order');
    res.render('admin/content/programs', { pageTitle: 'Manage Programs | GDCU', adminActive: 'programs', programs });
  } catch (err) { next(err); }
});

router.get('/programs/new', (req, res) => {
  res.render('admin/content/program-form', { pageTitle: 'New Program | GDCU', adminActive: 'programs', program: {}, isNew: true });
});

router.get('/programs/:id/edit', async (req, res, next) => {
  try {
    const program = await knex('programs').where({ id: req.params.id }).first();
    if (!program) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/content/program-form', { pageTitle: 'Edit Program | GDCU', adminActive: 'programs', program, isNew: false });
  } catch (err) { next(err); }
});

function programData(body) {
  return {
    title: body.title,
    level: body.level,
    school: body.school,
    credential: body.credential || null,
    summary: body.summary,
    description: body.description || null,
    duration: body.duration || null,
    semester_credits: body.semester_credits ? Number(body.semester_credits) : null,
    study_mode: body.study_mode || 'Online',
    tuition: body.tuition ? Number(body.tuition) : null,
    tuition_currency: body.tuition_currency || 'GBP',
    icon: body.icon || 'school',
    featured: bool(body.featured),
    published: bool(body.published),
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
  };
}

router.post('/programs', async (req, res, next) => {
  try {
    const data = programData(req.body);
    data.slug = await uniqueSlug('programs', req.body.slug || req.body.title);
    data.created_at = knex.fn.now();
    data.updated_at = knex.fn.now();
    await knex('programs').insert(data);
    req.flash('success', 'Program created.');
    res.redirect('/admin/content/programs');
  } catch (err) { next(err); }
});

router.post('/programs/:id', async (req, res, next) => {
  try {
    const data = programData(req.body);
    if (req.body.slug) data.slug = await uniqueSlug('programs', req.body.slug, Number(req.params.id));
    data.updated_at = knex.fn.now();
    await knex('programs').where({ id: req.params.id }).update(data);
    req.flash('success', 'Program updated.');
    res.redirect('/admin/content/programs');
  } catch (err) { next(err); }
});

router.post('/programs/:id/delete', async (req, res, next) => {
  try {
    await knex('programs').where({ id: req.params.id }).del();
    req.flash('success', 'Program deleted.');
    res.redirect('/admin/content/programs');
  } catch (err) { next(err); }
});

/* ──────────────────────────── NEWS ────────────────────────── */
router.get('/news', async (req, res, next) => {
  try {
    const posts = await knex('news_posts').orderBy('published_at', 'desc');
    res.render('admin/content/news', { pageTitle: 'Manage News | GDCU', adminActive: 'news', posts });
  } catch (err) { next(err); }
});

router.get('/news/new', (req, res) => {
  res.render('admin/content/news-form', { pageTitle: 'New Article | GDCU', adminActive: 'news', post: {}, isNew: true });
});

router.get('/news/:id/edit', async (req, res, next) => {
  try {
    const post = await knex('news_posts').where({ id: req.params.id }).first();
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/content/news-form', { pageTitle: 'Edit Article | GDCU', adminActive: 'news', post, isNew: false });
  } catch (err) { next(err); }
});

function newsData(body) {
  return {
    title: body.title,
    category: body.category || 'University News',
    excerpt: body.excerpt || null,
    body: body.body || null,
    author: body.author || null,
    published: bool(body.published),
  };
}

router.post('/news', async (req, res, next) => {
  try {
    const data = newsData(req.body);
    data.slug = await uniqueSlug('news_posts', req.body.slug || req.body.title);
    data.published_at = req.body.published_at || knex.fn.now();
    data.created_at = knex.fn.now();
    data.updated_at = knex.fn.now();
    await knex('news_posts').insert(data);
    req.flash('success', 'Article published.');
    res.redirect('/admin/content/news');
  } catch (err) { next(err); }
});

router.post('/news/:id', async (req, res, next) => {
  try {
    const data = newsData(req.body);
    if (req.body.slug) data.slug = await uniqueSlug('news_posts', req.body.slug, Number(req.params.id));
    data.updated_at = knex.fn.now();
    await knex('news_posts').where({ id: req.params.id }).update(data);
    req.flash('success', 'Article updated.');
    res.redirect('/admin/content/news');
  } catch (err) { next(err); }
});

router.post('/news/:id/delete', async (req, res, next) => {
  try {
    await knex('news_posts').where({ id: req.params.id }).del();
    req.flash('success', 'Article deleted.');
    res.redirect('/admin/content/news');
  } catch (err) { next(err); }
});

/* ──────────────────────────── FAQs ────────────────────────── */
router.get('/faqs', async (req, res, next) => {
  try {
    const faqs = await knex('faqs').orderBy(['category', 'sort_order']);
    const editing = req.query.edit ? await knex('faqs').where({ id: req.query.edit }).first() : null;
    res.render('admin/content/faqs', { pageTitle: 'Manage FAQs | GDCU', adminActive: 'faqs', faqs, editing });
  } catch (err) { next(err); }
});

router.post('/faqs', async (req, res, next) => {
  try {
    await knex('faqs').insert({
      category: req.body.category || 'General',
      question: req.body.question,
      answer: req.body.answer,
      sort_order: req.body.sort_order ? Number(req.body.sort_order) : 0,
      published: bool(req.body.published),
    });
    req.flash('success', 'FAQ added.');
    res.redirect('/admin/content/faqs');
  } catch (err) { next(err); }
});

router.post('/faqs/:id', async (req, res, next) => {
  try {
    await knex('faqs').where({ id: req.params.id }).update({
      category: req.body.category || 'General',
      question: req.body.question,
      answer: req.body.answer,
      sort_order: req.body.sort_order ? Number(req.body.sort_order) : 0,
      published: bool(req.body.published),
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'FAQ updated.');
    res.redirect('/admin/content/faqs');
  } catch (err) { next(err); }
});

router.post('/faqs/:id/delete', async (req, res, next) => {
  try {
    await knex('faqs').where({ id: req.params.id }).del();
    req.flash('success', 'FAQ deleted.');
    res.redirect('/admin/content/faqs');
  } catch (err) { next(err); }
});

/* ───────────────────────── ANNOUNCEMENTS ─────────────────── */
router.get('/announcements', async (req, res, next) => {
  try {
    const announcements = await knex('announcements')
      .leftJoin('courses', 'announcements.course_id', 'courses.id')
      .select('announcements.*', 'courses.title as course_title')
      .orderBy('announcements.published_at', 'desc');
    const courses = await knex('courses').where({ published: true }).orderBy('title').select('id', 'title');
    const editing = req.query.edit ? await knex('announcements').where({ id: req.query.edit }).first() : null;
    res.render('admin/content/announcements', {
      pageTitle: 'Announcements | GDCU', adminActive: 'announcements', announcements, courses, editing,
    });
  } catch (err) { next(err); }
});

router.post('/announcements', async (req, res, next) => {
  try {
    await knex('announcements').insert({
      course_id: req.body.course_id || null,
      title: req.body.title,
      body: req.body.body,
      author: req.body.author || res.locals.currentUser.name,
      published_at: knex.fn.now(),
    });
    await notifyAnnouncement(req.body.course_id || null, req.body.title);
    req.flash('success', 'Announcement posted.');
    res.redirect('/admin/content/announcements');
  } catch (err) { next(err); }
});

router.post('/announcements/:id', async (req, res, next) => {
  try {
    await knex('announcements').where({ id: req.params.id }).update({
      course_id: req.body.course_id || null,
      title: req.body.title,
      body: req.body.body,
      author: req.body.author || null,
    });
    req.flash('success', 'Announcement updated.');
    res.redirect('/admin/content/announcements');
  } catch (err) { next(err); }
});

router.post('/announcements/:id/delete', async (req, res, next) => {
  try {
    await knex('announcements').where({ id: req.params.id }).del();
    req.flash('success', 'Announcement deleted.');
    res.redirect('/admin/content/announcements');
  } catch (err) { next(err); }
});

/* ──────────────────────────── EVENTS ──────────────────────── */
router.get('/events', async (req, res, next) => {
  try {
    const events = await knex('events').orderBy('starts_at', 'desc');
    for (const e of events) {
      e.rsvps = Number((await knex('event_rsvps').where({ event_id: e.id }).count({ x: '*' }).first()).x);
    }
    res.render('admin/content/events', { pageTitle: 'Manage Events | GDCU', adminActive: 'events', events });
  } catch (err) { next(err); }
});

router.get('/events/new', (req, res) => {
  res.render('admin/content/event-form', { pageTitle: 'New Event | GDCU', adminActive: 'events', event: {}, isNew: true });
});

router.get('/events/:id/edit', async (req, res, next) => {
  try {
    const event = await knex('events').where({ id: req.params.id }).first();
    if (!event) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/content/event-form', { pageTitle: 'Edit Event | GDCU', adminActive: 'events', event, isNew: false });
  } catch (err) { next(err); }
});

function eventData(body) {
  return {
    title: body.title,
    category: body.category || 'Event',
    description: body.description || null,
    is_online: bool(body.is_online),
    location: body.location || null,
    join_url: body.join_url || null,
    starts_at: body.starts_at ? body.starts_at.replace('T', ' ') + ':00' : null,
    ends_at: body.ends_at ? body.ends_at.replace('T', ' ') + ':00' : null,
    published: bool(body.published),
  };
}

router.post('/events', async (req, res, next) => {
  try {
    const data = eventData(req.body);
    data.slug = await uniqueSlug('events', req.body.slug || req.body.title);
    data.created_at = knex.fn.now();
    data.updated_at = knex.fn.now();
    await knex('events').insert(data);
    req.flash('success', 'Event created.');
    res.redirect('/admin/content/events');
  } catch (err) { next(err); }
});

router.post('/events/:id', async (req, res, next) => {
  try {
    const data = eventData(req.body);
    if (req.body.slug) data.slug = await uniqueSlug('events', req.body.slug, Number(req.params.id));
    data.updated_at = knex.fn.now();
    await knex('events').where({ id: req.params.id }).update(data);
    req.flash('success', 'Event updated.');
    res.redirect('/admin/content/events');
  } catch (err) { next(err); }
});

router.post('/events/:id/delete', async (req, res, next) => {
  try {
    await knex('events').where({ id: req.params.id }).del();
    req.flash('success', 'Event deleted.');
    res.redirect('/admin/content/events');
  } catch (err) { next(err); }
});

/* ─────────────────────────── RESOURCES ────────────────────── */
router.get('/resources', async (req, res, next) => {
  try {
    const resources = await knex('resources').orderBy(['category', 'sort_order']);
    const courses = await knex('courses').where({ published: true }).orderBy('title').select('id', 'title');
    const editing = req.query.edit ? await knex('resources').where({ id: req.query.edit }).first() : null;
    res.render('admin/content/resources', { pageTitle: 'Manage Library | GDCU', adminActive: 'resources', resources, courses, editing });
  } catch (err) { next(err); }
});

function resourceData(body) {
  return {
    title: body.title,
    type: ['document', 'link', 'video', 'book', 'journal'].includes(body.type) ? body.type : 'link',
    category: body.category || null,
    description: body.description || null,
    url: body.url,
    author: body.author || null,
    course_id: body.course_id || null,
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
    published: bool(body.published),
  };
}

router.post('/resources', async (req, res, next) => {
  try {
    const data = resourceData(req.body);
    data.created_at = knex.fn.now();
    data.updated_at = knex.fn.now();
    await knex('resources').insert(data);
    req.flash('success', 'Resource added.');
    res.redirect('/admin/content/resources');
  } catch (err) { next(err); }
});

router.post('/resources/:id', async (req, res, next) => {
  try {
    const data = resourceData(req.body);
    data.updated_at = knex.fn.now();
    await knex('resources').where({ id: req.params.id }).update(data);
    req.flash('success', 'Resource updated.');
    res.redirect('/admin/content/resources');
  } catch (err) { next(err); }
});

router.post('/resources/:id/delete', async (req, res, next) => {
  try {
    await knex('resources').where({ id: req.params.id }).del();
    req.flash('success', 'Resource deleted.');
    res.redirect('/admin/content/resources');
  } catch (err) { next(err); }
});

/* ───────────────────────── SCHOLARSHIPS ───────────────────── */
router.get('/scholarships', async (req, res, next) => {
  try {
    const scholarships = await knex('scholarships').orderBy('sort_order');
    const editing = req.query.edit ? await knex('scholarships').where({ id: req.query.edit }).first() : null;
    res.render('admin/content/scholarships', { pageTitle: 'Scholarships | GDCU', adminActive: 'scholarships', scholarships, editing });
  } catch (err) { next(err); }
});

function scholarshipData(body) {
  return {
    title: body.title,
    summary: body.summary || null,
    description: body.description || null,
    award: body.award || null,
    eligibility: body.eligibility || null,
    deadline: body.deadline || null,
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
    published: bool(body.published),
  };
}

router.post('/scholarships', async (req, res, next) => {
  try {
    const data = scholarshipData(req.body);
    data.slug = await uniqueSlug('scholarships', req.body.title);
    data.created_at = knex.fn.now(); data.updated_at = knex.fn.now();
    await knex('scholarships').insert(data);
    req.flash('success', 'Scholarship created.');
    res.redirect('/admin/content/scholarships');
  } catch (err) { next(err); }
});

router.post('/scholarships/:id', async (req, res, next) => {
  try {
    const data = scholarshipData(req.body);
    data.updated_at = knex.fn.now();
    await knex('scholarships').where({ id: req.params.id }).update(data);
    req.flash('success', 'Scholarship updated.');
    res.redirect('/admin/content/scholarships');
  } catch (err) { next(err); }
});

router.post('/scholarships/:id/delete', async (req, res, next) => {
  try {
    await knex('scholarships').where({ id: req.params.id }).del();
    req.flash('success', 'Scholarship deleted.');
    res.redirect('/admin/content/scholarships');
  } catch (err) { next(err); }
});

/* ──────────────────────────── CAREERS ─────────────────────── */
router.get('/careers', async (req, res, next) => {
  try {
    const jobs = await knex('job_openings').orderBy('created_at', 'desc');
    for (const j of jobs) j.applicants = Number((await knex('job_applications').where({ job_id: j.id }).count({ x: '*' }).first()).x);
    res.render('admin/content/careers', { pageTitle: 'Careers | GDCU', adminActive: 'careers', jobs });
  } catch (err) { next(err); }
});

router.get('/careers/new', (req, res) => {
  res.render('admin/content/career-form', { pageTitle: 'New Position | GDCU', adminActive: 'careers', job: {}, isNew: true });
});

router.get('/careers/:id/edit', async (req, res, next) => {
  try {
    const job = await knex('job_openings').where({ id: req.params.id }).first();
    if (!job) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const applicants = await knex('job_applications').where({ job_id: job.id }).orderBy('created_at', 'desc');
    res.render('admin/content/career-form', { pageTitle: 'Edit Position | GDCU', adminActive: 'careers', job, isNew: false, applicants });
  } catch (err) { next(err); }
});

function jobData(body) {
  return {
    title: body.title,
    department: body.department || null,
    location: body.location || null,
    type: body.type || 'Faculty',
    summary: body.summary || null,
    description: body.description || null,
    closes_on: body.closes_on || null,
    published: bool(body.published),
  };
}

router.post('/careers', async (req, res, next) => {
  try {
    const data = jobData(req.body);
    data.slug = await uniqueSlug('job_openings', req.body.title);
    data.created_at = knex.fn.now(); data.updated_at = knex.fn.now();
    await knex('job_openings').insert(data);
    req.flash('success', 'Position published.');
    res.redirect('/admin/content/careers');
  } catch (err) { next(err); }
});

router.post('/careers/:id', async (req, res, next) => {
  try {
    const data = jobData(req.body);
    data.updated_at = knex.fn.now();
    await knex('job_openings').where({ id: req.params.id }).update(data);
    req.flash('success', 'Position updated.');
    res.redirect('/admin/content/careers');
  } catch (err) { next(err); }
});

router.post('/careers/:id/delete', async (req, res, next) => {
  try {
    await knex('job_openings').where({ id: req.params.id }).del();
    req.flash('success', 'Position deleted.');
    res.redirect('/admin/content/careers');
  } catch (err) { next(err); }
});

/* ──────────────────────────── ALUMNI ──────────────────────── */
router.get('/alumni', async (req, res, next) => {
  try {
    const alumni = await knex('alumni_profiles').orderBy('sort_order').orderBy('name');
    const editing = req.query.edit ? await knex('alumni_profiles').where({ id: req.query.edit }).first() : null;
    res.render('admin/content/alumni', { pageTitle: 'Alumni | GDCU', adminActive: 'alumni', alumni, editing });
  } catch (err) { next(err); }
});

function alumniData(body) {
  return {
    name: body.name,
    graduation_year: body.graduation_year ? Number(body.graduation_year) : null,
    program: body.program || null,
    role: body.role || null,
    organisation: body.organisation || null,
    country: body.country || null,
    bio: body.bio || null,
    is_mentor: bool(body.is_mentor),
    published: bool(body.published),
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
  };
}

router.post('/alumni', async (req, res, next) => {
  try {
    const data = alumniData(req.body);
    data.created_at = knex.fn.now(); data.updated_at = knex.fn.now();
    await knex('alumni_profiles').insert(data);
    req.flash('success', 'Alumni profile added.');
    res.redirect('/admin/content/alumni');
  } catch (err) { next(err); }
});

router.post('/alumni/:id', async (req, res, next) => {
  try {
    const data = alumniData(req.body);
    data.updated_at = knex.fn.now();
    await knex('alumni_profiles').where({ id: req.params.id }).update(data);
    req.flash('success', 'Alumni profile updated.');
    res.redirect('/admin/content/alumni');
  } catch (err) { next(err); }
});

router.post('/alumni/:id/delete', async (req, res, next) => {
  try {
    await knex('alumni_profiles').where({ id: req.params.id }).del();
    req.flash('success', 'Alumni profile deleted.');
    res.redirect('/admin/content/alumni');
  } catch (err) { next(err); }
});

/* ──────────────────────────── WEBINARS ────────────────────── */
router.get('/webinars', async (req, res, next) => {
  try {
    const webinars = await knex('webinars').orderBy('starts_at', 'desc');
    res.render('admin/content/webinars', { pageTitle: 'Webinars | GDCU', adminActive: 'webinars', webinars });
  } catch (err) { next(err); }
});

router.get('/webinars/new', (req, res) => {
  res.render('admin/content/webinar-form', { pageTitle: 'New Webinar | GDCU', adminActive: 'webinars', webinar: {}, isNew: true });
});

router.get('/webinars/:id/edit', async (req, res, next) => {
  try {
    const webinar = await knex('webinars').where({ id: req.params.id }).first();
    if (!webinar) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/content/webinar-form', { pageTitle: 'Edit Webinar | GDCU', adminActive: 'webinars', webinar, isNew: false });
  } catch (err) { next(err); }
});

function webinarData(body) {
  return {
    title: body.title,
    presenter: body.presenter || null,
    description: body.description || null,
    starts_at: body.starts_at ? body.starts_at.replace('T', ' ') + ':00' : null,
    provider: body.provider || 'external',
    join_url: body.join_url || null,
    recording_url: body.recording_url || null,
    stream_embed_url: body.stream_embed_url || null,
    zoom_passcode: body.zoom_passcode || null,
    resources: body.resources || null,
    published: bool(body.published),
  };
}

async function ensureZoomMeeting(data, existingWebinar = null) {
  if (data.provider !== 'zoom' || !zoomConfigured()) return data;
  try {
    if (existingWebinar && existingWebinar.zoom_meeting_id) {
      await updateMeeting(existingWebinar.zoom_meeting_id, {
        topic: data.title,
        startsAt: data.starts_at,
        durationMin: 60,
      });
      data.zoom_meeting_id = existingWebinar.zoom_meeting_id;
      data.zoom_start_url = existingWebinar.zoom_start_url;
      data.zoom_passcode = existingWebinar.zoom_passcode;
      data.join_url = data.join_url || existingWebinar.join_url;
      return data;
    }

    const meeting = await createMeeting({
      topic: data.title,
      startsAt: data.starts_at,
      durationMin: 60,
      agenda: data.description || '',
    });
    if (meeting) {
      data.zoom_meeting_id = meeting.meetingId;
      data.zoom_start_url = meeting.startUrl;
      data.zoom_passcode = meeting.passcode;
      data.join_url = data.join_url || meeting.joinUrl;
    }
  } catch (err) {
    console.error('Zoom meeting creation/update failed:', err.message || err);
  }
  return data;
}

router.post('/webinars', async (req, res, next) => {
  try {
    let data = webinarData(req.body);
    data = await ensureZoomMeeting(data);
    data.created_at = knex.fn.now(); data.updated_at = knex.fn.now();
    await knex('webinars').insert(data);
    req.flash('success', 'Webinar scheduled.');
    res.redirect('/admin/content/webinars');
  } catch (err) { next(err); }
});

router.post('/webinars/:id', async (req, res, next) => {
  try {
    const existingWebinar = await knex('webinars').where({ id: req.params.id }).first();
    if (!existingWebinar) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    let data = webinarData(req.body);
    data = await ensureZoomMeeting(data, existingWebinar);
    data.updated_at = knex.fn.now();
    await knex('webinars').where({ id: req.params.id }).update(data);
    req.flash('success', 'Webinar updated.');
    res.redirect('/admin/content/webinars');
  } catch (err) { next(err); }
});

router.post('/webinars/:id/delete', async (req, res, next) => {
  try {
    await knex('webinars').where({ id: req.params.id }).del();
    req.flash('success', 'Webinar deleted.');
    res.redirect('/admin/content/webinars');
  } catch (err) { next(err); }
});

/* ──────────────────────── KNOWLEDGE BASE ──────────────────── */
router.get('/kb', async (req, res, next) => {
  try {
    const articles = await knex('kb_articles').orderBy(['category', 'sort_order']);
    res.render('admin/content/kb', { pageTitle: 'Knowledge Base | GDCU', adminActive: 'kb', articles });
  } catch (err) { next(err); }
});

router.get('/kb/new', (req, res) => {
  res.render('admin/content/kb-form', { pageTitle: 'New Article | GDCU', adminActive: 'kb', article: {}, isNew: true });
});

router.get('/kb/:id/edit', async (req, res, next) => {
  try {
    const article = await knex('kb_articles').where({ id: req.params.id }).first();
    if (!article) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/content/kb-form', { pageTitle: 'Edit Article | GDCU', adminActive: 'kb', article, isNew: false });
  } catch (err) { next(err); }
});

function kbData(body) {
  return {
    title: body.title,
    category: body.category || 'General',
    excerpt: body.excerpt || null,
    body: body.body || null,
    sort_order: body.sort_order ? Number(body.sort_order) : 0,
    published: bool(body.published),
  };
}

router.post('/kb', async (req, res, next) => {
  try {
    const data = kbData(req.body);
    data.slug = await uniqueSlug('kb_articles', req.body.title);
    data.created_at = knex.fn.now(); data.updated_at = knex.fn.now();
    await knex('kb_articles').insert(data);
    req.flash('success', 'Article published.');
    res.redirect('/admin/content/kb');
  } catch (err) { next(err); }
});

router.post('/kb/:id', async (req, res, next) => {
  try {
    const data = kbData(req.body);
    if (req.body.slug) data.slug = await uniqueSlug('kb_articles', req.body.slug, Number(req.params.id));
    data.updated_at = knex.fn.now();
    await knex('kb_articles').where({ id: req.params.id }).update(data);
    req.flash('success', 'Article updated.');
    res.redirect('/admin/content/kb');
  } catch (err) { next(err); }
});

router.post('/kb/:id/delete', async (req, res, next) => {
  try {
    await knex('kb_articles').where({ id: req.params.id }).del();
    req.flash('success', 'Article deleted.');
    res.redirect('/admin/content/kb');
  } catch (err) { next(err); }
});

module.exports = router;
