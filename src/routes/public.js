/**
 * Public marketing pages.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const knex = require('../config/db');
const { makeReference } = require('../lib/helpers');
const { getStripe } = require('../lib/stripe');
const { notifyRoles, notifyUser, email } = require('../lib/notify');
const googleCalendar = require('../lib/googleCalendar');
const { buildIcs } = require('../lib/ics');
const { formatDateTime } = require('../lib/helpers');

const router = express.Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Home
router.get('/', async (req, res, next) => {
  try {
    const featured = await knex('programs')
      .where({ published: true, featured: true })
      .orderBy('sort_order')
      .limit(4);
    const latestNews = await knex('news_posts')
      .where({ published: true })
      .orderBy('published_at', 'desc')
      .limit(3);
    // Upcoming open days count + programme counts per qualification level.
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const openDaysCount = Number((await knex('open_days').where({ published: true }).where('starts_at', '>=', now).count({ c: '*' }).first()).c);
    const nextOpenDay = await knex('open_days').where({ published: true }).where('starts_at', '>=', now).orderBy('starts_at').first();
    const levelRows = await knex('programs').where({ published: true }).select('level').count({ c: '*' }).groupBy('level');
    const levelCounts = {};
    levelRows.forEach((r) => { levelCounts[r.level] = Number(r.c); });
    // A representative image per qualification level (from a programme of that level).
    const levelImgRows = await knex('programs').where({ published: true }).whereNotNull('image_url').select('level', 'image_url').orderBy('sort_order');
    const levelImage = {};
    levelImgRows.forEach((r) => { if (!levelImage[r.level]) levelImage[r.level] = r.image_url; });
    res.render('public/home', {
      pageTitle: 'Global Diaspora Christian University | Educate. Equip. Empower.',
      featured,
      latestNews,
      openDaysCount,
      nextOpenDay,
      levelCounts,
      levelImage,
      hideFooterCta: true,
    });
  } catch (err) {
    next(err);
  }
});

// About
router.get('/about', (req, res) => {
  res.render('public/about', {
    pageTitle: 'About GDCU | Our Mission & Heritage',
    metaDescription:
      'Discover the mission, heritage and values of Global Diaspora Christian University.',
  });
});

// How online learning works
router.get('/how-it-works', (req, res) => {
  res.render('public/how-it-works', {
    pageTitle: 'How Online Learning Works | GDCU',
  });
});

// Accreditation
router.get('/accreditation', (req, res) => {
  res.render('public/accreditation', {
    pageTitle: 'Accreditation & Quality Assurance | GDCU',
  });
});

// Student life / spiritual community
router.get('/student-life', (req, res) => {
  res.render('public/student-life', {
    pageTitle: 'Student Life & Spiritual Community | GDCU',
  });
});

// Events — public calendar
router.get('/events', async (req, res, next) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const upcoming = await knex('events').where({ published: true }).where('starts_at', '>=', now).orderBy('starts_at');
    const past = await knex('events').where({ published: true }).where('starts_at', '<', now).orderBy('starts_at', 'desc').limit(6);
    res.render('public/events', { pageTitle: 'Events & Campus Hub | GDCU', upcoming, past });
  } catch (err) {
    next(err);
  }
});

router.get('/events/:slug', async (req, res, next) => {
  try {
    const event = await knex('events').where({ slug: req.params.slug, published: true }).first();
    if (!event) return res.status(404).render('errors/404', { pageTitle: 'Event not found' });
    res.render('public/event-detail', { pageTitle: `${event.title} | GDCU Events`, metaDescription: event.description, event });
  } catch (err) {
    next(err);
  }
});

// GDCU Assistant — grounded chatbot endpoint (returns JSON)
router.post('/assistant/ask', formLimiter, async (req, res, next) => {
  try {
    const chatbot = require('../lib/chatbot');
    const result = await chatbot.answer(req.body.question);
    res.json(result);
  } catch (err) { next(err); }
});

// Academic calendar — public-facing (closures, opening dates, key dates)
router.get('/academic-calendar', async (req, res, next) => {
  try {
    const calendar = require('../lib/calendar');
    const events = await calendar.upcomingFor('public', { limit: 100 });
    res.render('public/academic-calendar', {
      pageTitle: 'Academic Calendar & Key Dates | GDCU',
      metaDescription: 'Term dates, closures, opening dates and key deadlines at Global Diaspora Christian University.',
      groups: calendar.groupByMonth(events), cats: calendar.CATEGORIES,
    });
  } catch (err) { next(err); }
});

// Open Days — public list, detail + registration (captures a CRM lead)
router.get('/open-days', async (req, res, next) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const upcoming = await knex('open_days').where({ published: true }).where('starts_at', '>=', now).orderBy('starts_at');
    const past = await knex('open_days').where({ published: true }).where('starts_at', '<', now).orderBy('starts_at', 'desc').limit(4);
    res.render('public/open-days', { pageTitle: 'Open Days | GDCU', metaDescription: 'Join a Global Diaspora Christian University open day — meet our team, explore programmes and ask your questions.', upcoming, past });
  } catch (err) { next(err); }
});

router.get('/open-days/:slug', async (req, res, next) => {
  try {
    const openDay = await knex('open_days').where({ slug: req.params.slug, published: true }).first();
    if (!openDay) return res.status(404).render('errors/404', { pageTitle: 'Open day not found' });
    const registered = Number((await knex('open_day_registrations').where({ open_day_id: openDay.id }).count({ c: '*' }).first()).c);
    const full = openDay.capacity && registered >= openDay.capacity;
    res.render('public/open-day-detail', { pageTitle: `${openDay.title} | GDCU Open Day`, metaDescription: openDay.description, openDay, registered, full, form: {}, errors: {}, done: req.query.done === '1' });
  } catch (err) { next(err); }
});

router.post('/open-days/:slug/register', formLimiter, async (req, res, next) => {
  try {
    const openDay = await knex('open_days').where({ slug: req.params.slug, published: true }).first();
    if (!openDay) return res.status(404).render('errors/404', { pageTitle: 'Open day not found' });
    const registered = Number((await knex('open_day_registrations').where({ open_day_id: openDay.id }).count({ c: '*' }).first()).c);
    const full = openDay.capacity && registered >= openDay.capacity;

    const errors = {};
    const f = {
      first_name: (req.body.first_name || '').trim(),
      last_name: (req.body.last_name || '').trim(),
      email: (req.body.email || '').trim(),
      phone: (req.body.phone || '').trim(),
      country: (req.body.country || '').trim(),
      message: (req.body.message || '').trim(),
    };
    if (!f.first_name) errors.first_name = 'Please enter your first name.';
    if (!f.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errors.email = 'Please enter a valid email address.';
    if (full) errors.email = 'Sorry, this open day is now full.';

    if (Object.keys(errors).length) {
      return res.status(422).render('public/open-day-detail', { pageTitle: `${openDay.title} | GDCU Open Day`, openDay, registered, full, form: f, errors, done: false });
    }

    // Capture as a CRM lead (or reuse an existing lead with the same email).
    let lead = await knex('leads').whereRaw('lower(email) = ?', [f.email.toLowerCase()]).first();
    if (!lead) {
      const [leadIdRaw] = await knex('leads').insert({
        first_name: f.first_name, last_name: f.last_name || null, email: f.email,
        phone: f.phone || null, country: f.country || null,
        interest: `Open day: ${openDay.title}`,
        message: f.message || null, source: 'open_day', status: 'new',
      });
      const leadId = Array.isArray(leadIdRaw) ? leadIdRaw[0] : leadIdRaw;
      lead = { id: leadId };
    } else {
      await knex('leads').where({ id: lead.id }).update({ updated_at: knex.fn.now() });
    }

    await knex('open_day_registrations').insert({
      open_day_id: openDay.id, first_name: f.first_name, last_name: f.last_name || null,
      email: f.email, phone: f.phone || null, country: f.country || null,
      interest: `Open day: ${openDay.title}`, message: f.message || null, lead_id: lead.id,
    });

    notifyRoles(['admin', 'staff'], {
      type: 'lead', title: 'New open day registration',
      body: `${f.first_name} ${f.last_name || ''} — ${openDay.title}`,
      link: `/admin/open-days/${openDay.id}`,
    });
    const whenStr = formatDateTime(openDay.starts_at);
    email({
      to: f.email, toName: `${f.first_name} ${f.last_name || ''}`.trim(),
      subject: `You're registered — ${openDay.title}`,
      heading: `See you at ${openDay.title}`,
      bodyHtml: `<p>Dear ${f.first_name},</p><p>Thank you for registering for <strong>${openDay.title}</strong>.</p><p><strong>When:</strong> ${whenStr}<br/><strong>Where:</strong> ${openDay.is_online ? 'Online' : (openDay.location || 'TBC')}</p>${openDay.is_online && openDay.join_url ? `<p>Join here: <a href="${openDay.join_url}">${openDay.join_url}</a></p>` : ''}<p>We look forward to meeting you. Reply to this email any time with questions.</p>`,
      relatedType: 'open_day', relatedId: openDay.id,
    });

    res.redirect(`/open-days/${openDay.slug}?done=1`);
  } catch (err) { next(err); }
});

// Scholarships
router.get('/scholarships', async (req, res, next) => {
  try {
    const scholarships = await knex('scholarships').where({ published: true }).orderBy('sort_order');
    res.render('public/scholarships', { pageTitle: 'Scholarships & Funding | GDCU', scholarships });
  } catch (err) { next(err); }
});

router.get('/scholarships/:slug', async (req, res, next) => {
  try {
    const scholarship = await knex('scholarships').where({ slug: req.params.slug, published: true }).first();
    if (!scholarship) return res.status(404).render('errors/404', { pageTitle: 'Scholarship not found' });
    res.render('public/scholarship-detail', { pageTitle: `${scholarship.title} | GDCU`, metaDescription: scholarship.summary, scholarship });
  } catch (err) { next(err); }
});

// Careers / Join GDCU
router.get('/careers', async (req, res, next) => {
  try {
    const jobs = await knex('job_openings').where({ published: true }).orderBy('created_at', 'desc');
    res.render('public/careers', { pageTitle: 'Careers — Join GDCU', jobs });
  } catch (err) { next(err); }
});

router.get('/careers/:slug', async (req, res, next) => {
  try {
    const job = await knex('job_openings').where({ slug: req.params.slug, published: true }).first();
    if (!job) return res.status(404).render('errors/404', { pageTitle: 'Position not found' });
    res.render('public/career-detail', { pageTitle: `${job.title} | GDCU Careers`, metaDescription: job.summary, job, form: {}, errors: {} });
  } catch (err) { next(err); }
});

router.post('/careers/:slug/apply', async (req, res, next) => {
  try {
    const job = await knex('job_openings').where({ slug: req.params.slug, published: true }).first();
    if (!job) return res.status(404).render('errors/404', { pageTitle: 'Position not found' });

    const errors = {};
    if (!req.body.first_name || !req.body.first_name.trim()) errors.first_name = 'First name is required.';
    if (!req.body.last_name || !req.body.last_name.trim()) errors.last_name = 'Last name is required.';
    if (!req.body.email || !/^\S+@\S+\.\S+$/.test(req.body.email)) errors.email = 'A valid email is required.';

    if (Object.keys(errors).length) {
      return res.status(422).render('public/career-detail', { pageTitle: `${job.title} | GDCU Careers`, job, form: req.body, errors });
    }
    await knex('job_applications').insert({
      job_id: job.id,
      first_name: req.body.first_name.trim(),
      last_name: req.body.last_name.trim(),
      email: req.body.email.trim(),
      phone: req.body.phone || null,
      cover_note: req.body.cover_note || null,
      cv_url: req.body.cv_url || null,
      status: 'new',
    });
    req.flash('success', `Thank you for applying for ${job.title}. Our team will be in touch.`);
    res.redirect(`/careers/${job.slug}`);
  } catch (err) { next(err); }
});

// Research grants — info + application
router.get('/research-grants', (req, res) => {
  res.render('public/research-grants', { pageTitle: 'Diaspora Research Grants | GDCU', form: {}, errors: {} });
});

router.post('/research-grants', async (req, res, next) => {
  try {
    const errors = {};
    if (!req.body.first_name || !req.body.first_name.trim()) errors.first_name = 'Required.';
    if (!req.body.last_name || !req.body.last_name.trim()) errors.last_name = 'Required.';
    if (!req.body.email || !/^\S+@\S+\.\S+$/.test(req.body.email)) errors.email = 'A valid email is required.';
    if (!req.body.title || !req.body.title.trim()) errors.title = 'Please give your project a title.';
    if (Object.keys(errors).length) {
      return res.status(422).render('public/research-grants', { pageTitle: 'Diaspora Research Grants | GDCU', form: req.body, errors });
    }
    const reference = makeReference('GRANT');
    await knex('grant_applications').insert({
      reference,
      first_name: req.body.first_name.trim(),
      last_name: req.body.last_name.trim(),
      email: req.body.email.trim(),
      institution: req.body.institution || null,
      title: req.body.title.trim(),
      category: req.body.category || null,
      summary: req.body.summary || null,
      amount_requested: req.body.amount_requested ? Number(req.body.amount_requested) : null,
      status: 'submitted',
    });
    req.flash('success', `Your grant application (${reference}) has been submitted. Our research office will be in touch.`);
    res.redirect('/research-grants');
  } catch (err) { next(err); }
});

// Alumni network
router.get('/alumni', async (req, res, next) => {
  try {
    const mentors = await knex('alumni_profiles').where({ published: true, is_mentor: true }).orderBy('sort_order');
    const alumni = await knex('alumni_profiles').where({ published: true, is_mentor: false }).orderBy('sort_order');
    const vacancies = await knex('job_openings').where({ published: true }).orderBy('created_at', 'desc').limit(5);
    res.render('public/alumni', { pageTitle: 'Alumni Network | GDCU', mentors, alumni, vacancies, form: {}, errors: {} });
  } catch (err) { next(err); }
});

router.post('/alumni/join', async (req, res, next) => {
  try {
    const errors = {};
    if (!req.body.name || !req.body.name.trim()) errors.name = 'Your name is required.';
    if (!req.body.email || !/^\S+@\S+\.\S+$/.test(req.body.email)) errors.email = 'A valid email is required.';
    if (Object.keys(errors).length) {
      const mentors = await knex('alumni_profiles').where({ published: true, is_mentor: true }).orderBy('sort_order');
      const alumni = await knex('alumni_profiles').where({ published: true, is_mentor: false }).orderBy('sort_order');
      const vacancies = await knex('job_openings').where({ published: true }).orderBy('created_at', 'desc').limit(5);
      return res.status(422).render('public/alumni', { pageTitle: 'Alumni Network | GDCU', mentors, alumni, vacancies, form: req.body, errors });
    }
    // Submitted for review (unpublished until an admin approves).
    await knex('alumni_profiles').insert({
      name: req.body.name.trim(),
      graduation_year: req.body.graduation_year ? Number(req.body.graduation_year) : null,
      program: req.body.program || null,
      role: req.body.role || null,
      organisation: req.body.organisation || null,
      country: req.body.country || null,
      bio: req.body.bio || null,
      is_mentor: req.body.is_mentor === 'on',
      published: false,
    });
    req.flash('success', 'Thank you! Your alumni profile has been submitted for review.');
    res.redirect('/alumni');
  } catch (err) { next(err); }
});

// Diaspora sponsorship — public sponsor page
router.get('/sponsor/:token', async (req, res, next) => {
  try {
    const sponsorship = await knex('sponsorships')
      .join('users', 'sponsorships.student_id', 'users.id')
      .where({ 'sponsorships.token': req.params.token, 'sponsorships.active': true })
      .select('sponsorships.*', 'users.first_name', 'users.last_name')
      .first();
    if (!sponsorship) return res.status(404).render('errors/404', { pageTitle: 'Sponsorship not found' });
    const raisedRow = await knex('sponsorship_contributions').where({ sponsorship_id: sponsorship.id, status: 'paid' }).sum({ s: 'amount' }).first();
    const raised = Number(raisedRow.s || 0);
    const supporters = await knex('sponsorship_contributions').where({ sponsorship_id: sponsorship.id, status: 'paid' }).orderBy('created_at', 'desc').limit(10);
    res.render('public/sponsor', {
      pageTitle: `Sponsor ${sponsorship.first_name} | GDCU`,
      layout: 'layouts/base', sponsorship, raised, supporters,
    });
  } catch (err) { next(err); }
});

router.post('/sponsor/:token/pledge', async (req, res, next) => {
  try {
    const sponsorship = await knex('sponsorships').where({ token: req.params.token, active: true }).first();
    if (!sponsorship) return res.status(404).render('errors/404', { pageTitle: 'Sponsorship not found' });
    const amount = Number(req.body.amount);
    if (!req.body.sponsor_name || !amount || amount <= 0) {
      req.flash('error', 'Please enter your name and a valid amount.');
      return res.redirect(`/sponsor/${sponsorship.token}`);
    }
    const { stripe, isConfigured } = await getStripe();
    const [idRaw] = await knex('sponsorship_contributions').insert({
      sponsorship_id: sponsorship.id,
      sponsor_name: req.body.sponsor_name,
      sponsor_email: req.body.sponsor_email || null,
      amount,
      message: req.body.message || null,
      status: isConfigured ? 'pledged' : 'paid',
    });
    const contributionId = Array.isArray(idRaw) ? idRaw[0] : idRaw;

    if (isConfigured) {
      const currency = (sponsorship.currency || 'GBP').toLowerCase();
      const checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: req.body.sponsor_email || undefined,
        line_items: [{ price_data: { currency, product_data: { name: 'Tuition sponsorship contribution' }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
        metadata: { kind: 'sponsorship', contribution_id: String(contributionId) },
        success_url: `${process.env.APP_URL}/sponsor/${sponsorship.token}?thanks=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/sponsor/${sponsorship.token}?cancelled=1`,
      });
      await knex('sponsorship_contributions').where({ id: contributionId }).update({ stripe_session_id: checkout.id });
      return res.redirect(303, checkout.url);
    }
    req.flash('success', 'Thank you for your generous contribution!');
    res.redirect(`/sponsor/${sponsorship.token}?thanks=1`);
  } catch (err) { next(err); }
});

// Interview self-scheduling (applicant-facing, tokenised)
router.get('/interview/:token', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ interview_token: req.params.token }).first();
    if (!application) return res.status(404).render('errors/404', { pageTitle: 'Booking link not found' });
    const booked = await knex('interviews')
      .leftJoin('users', 'interviews.interviewer_id', 'users.id')
      .where('interviews.application_id', application.id).whereNotNull('interviews.slot_id')
      .whereNot('interviews.status', 'cancelled')
      .select('interviews.*', 'users.first_name as iv_first', 'users.last_name as iv_last')
      .first();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // Available slots = future slots whose bookings < capacity
    const slots = await knex('interview_slots')
      .leftJoin('users', 'interview_slots.interviewer_id', 'users.id')
      .where('interview_slots.starts_at', '>=', now)
      .select('interview_slots.*', 'users.first_name', 'users.last_name')
      .orderBy('interview_slots.starts_at');
    const available = [];
    for (const s of slots) {
      const cnt = Number((await knex('interviews').where({ slot_id: s.id }).count({ c: '*' }).first()).c);
      if (cnt < s.capacity) available.push(s);
    }
    // group by host — a specific interviewer, or a shared pool ("any available host")
    const mentors = {};
    for (const s of available) {
      const key = s.interviewer_id ? `u${s.interviewer_id}` : `pool:${s.host_label || 'Any available host'}`;
      const name = s.first_name ? `${s.first_name} ${s.last_name}` : (s.host_label || 'Any available host');
      mentors[key] = mentors[key] || { name, isPool: !s.interviewer_id, slots: [] };
      mentors[key].slots.push(s);
    }
    res.render('public/interview', {
      pageTitle: 'Schedule Your Interview | GDCU', layout: 'layouts/base',
      application, mentors: Object.values(mentors), booked,
    });
  } catch (err) { next(err); }
});

router.post('/interview/:token/book', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ interview_token: req.params.token }).first();
    if (!application) return res.status(404).render('errors/404', { pageTitle: 'Booking link not found' });
    const slot = await knex('interview_slots').where({ id: req.body.slot_id }).first();
    if (!slot) { req.flash('error', 'That slot is no longer available.'); return res.redirect(`/interview/${req.params.token}`); }
    const cnt = Number((await knex('interviews').where({ slot_id: slot.id }).count({ c: '*' }).first()).c);
    const already = await knex('interviews').where({ application_id: application.id }).whereNotNull('slot_id').first();
    if (already) { req.flash('info', 'You have already booked an interview.'); return res.redirect(`/interview/${req.params.token}`); }
    if (cnt >= slot.capacity) { req.flash('error', 'Sorry, that slot was just taken.'); return res.redirect(`/interview/${req.params.token}`); }
    const [ivIdRaw] = await knex('interviews').insert({
      application_id: application.id, interviewer_id: slot.interviewer_id, slot_id: slot.id,
      scheduled_at: slot.starts_at, mode: slot.mode, location: slot.location, status: 'scheduled',
    });
    if (['new', 'in_review'].includes(application.status)) {
      await knex('applications').where({ id: application.id }).update({ status: 'interview', updated_at: knex.fn.now() });
    }
    // Pooled slots need a host to claim them; specific slots notify that host.
    if (slot.interviewer_id) {
      notifyUser(slot.interviewer_id, { type: 'application', title: 'Interview booked with you', body: `${application.first_name} ${application.last_name} — ${formatDateTime(slot.starts_at)}`, link: `/admin/applications/${application.id}` });
      // Mirror to the host's calendar (no-op until Google is configured).
      googleCalendar.createInterviewEvent(slot.interviewer_id, {
        summary: `Interview — ${application.first_name} ${application.last_name}`,
        description: `GDCU admissions interview (${application.reference || ''})`,
        startsAt: slot.starts_at, durationMins: 30,
        location: slot.mode === 'online' ? (slot.location || 'Online') : slot.location,
      }).catch(() => {});
    } else {
      notifyRoles(['admin', 'staff', 'faculty'], { type: 'application', title: 'Interview needs a host', body: `${application.first_name} ${application.last_name} booked a pooled slot (${slot.host_label || 'Any available host'}) — please claim it.`, link: `/admin/applications/${application.id}` });
    }
    notifyRoles(['admin', 'staff'], { type: 'application', title: 'Interview booked', body: `${application.first_name} ${application.last_name} booked an interview slot.`, link: `/admin/applications/${application.id}` });
    // Confirmation email to the applicant
    const whereTxt = slot.mode === 'online' ? `Online${slot.location ? ' — ' + slot.location : ''}` : (slot.location || 'In person');
    email({
      to: application.email, toName: `${application.first_name} ${application.last_name}`,
      subject: 'Your GDCU interview is confirmed',
      heading: 'Interview confirmed',
      bodyHtml: `<p>Dear ${application.first_name},</p><p>Your admissions interview is booked for:</p>
        <p style="font-size:16px"><strong>${formatDateTime(slot.starts_at)}</strong><br>${whereTxt}</p>
        <p>You can add it to your calendar or reschedule here: <a href="${process.env.APP_URL || ''}/interview/${req.params.token}" style="color:#b8861b">manage your interview</a>.</p>`,
      relatedType: 'application', relatedId: application.id,
    });
    req.flash('success', 'Your interview is booked. A confirmation has been emailed to you.');
    res.redirect(`/interview/${req.params.token}`);
  } catch (err) { next(err); }
});

// Cancel / reschedule a booked interview (frees the slot; applicant can rebook)
router.post('/interview/:token/cancel', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ interview_token: req.params.token }).first();
    if (!application) return res.status(404).render('errors/404', { pageTitle: 'Booking link not found' });
    await knex('interviews').where({ application_id: application.id }).whereNotNull('slot_id').del();
    notifyRoles(['admin', 'staff'], { type: 'application', title: 'Interview cancelled', body: `${application.first_name} ${application.last_name} cancelled their interview booking.`, link: `/admin/applications/${application.id}` });
    req.flash('info', 'Your booking was cancelled. You can choose a new time below.');
    res.redirect(`/interview/${req.params.token}`);
  } catch (err) { next(err); }
});

// Add-to-calendar (.ics) for the booked interview
router.get('/interview/:token/calendar.ics', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ interview_token: req.params.token }).first();
    if (!application) return res.status(404).send('Not found');
    const iv = await knex('interviews').where({ application_id: application.id }).whereNotNull('slot_id').whereNot('status', 'cancelled').first();
    if (!iv) return res.status(404).send('No interview booked');
    const ics = buildIcs({
      uid: `interview-${iv.id}`, start: iv.scheduled_at,
      summary: 'GDCU Admissions Interview',
      description: `Interview for application ${application.reference}.`,
      location: iv.mode === 'online' ? (iv.location || 'Online') : (iv.location || 'In person'),
    });
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename="gdcu-interview.ics"');
    res.send(ics);
  } catch (err) { next(err); }
});

// Knowledge base
router.get('/knowledge-base', async (req, res, next) => {
  try {
    const articles = await knex('kb_articles').where({ published: true }).orderBy(['category', 'sort_order']);
    const grouped = {};
    for (const a of articles) (grouped[a.category] = grouped[a.category] || []).push(a);
    res.render('public/knowledge-base', { pageTitle: 'Knowledge Base | GDCU Help', grouped });
  } catch (err) { next(err); }
});

router.get('/knowledge-base/:slug', async (req, res, next) => {
  try {
    const article = await knex('kb_articles').where({ slug: req.params.slug, published: true }).first();
    if (!article) return res.status(404).render('errors/404', { pageTitle: 'Article not found' });
    await knex('kb_articles').where({ id: article.id }).update({ views: article.views + 1 });
    const related = await knex('kb_articles').where({ published: true, category: article.category }).whereNot('id', article.id).limit(4);
    res.render('public/kb-article', { pageTitle: `${article.title} | GDCU Help`, metaDescription: article.excerpt, article, related });
  } catch (err) { next(err); }
});

// FAQ / Help hub
router.get('/faq', async (req, res, next) => {
  try {
    const faqs = await knex('faqs').where({ published: true }).orderBy(['category', 'sort_order']);
    const grouped = {};
    for (const f of faqs) {
      (grouped[f.category] = grouped[f.category] || []).push(f);
    }
    res.render('public/faq', { pageTitle: 'Frequently Asked Questions | GDCU', grouped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
