/**
 * Staff CRM / Admin. Requires an authenticated user with role staff or admin.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

const knex = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { makeReference, pageInfo, slugify, formatDateTime } = require('../lib/helpers');
const { notifyUser, notifyRoles, email, logActivity } = require('../lib/notify');
const googleCalendar = require('../lib/googleCalendar');
const attendance = require('../lib/attendance');
const calendar = require('../lib/calendar');
const profiles = require('../lib/profiles');
const { snapshot } = require('../lib/revisions');
const { getCourseStructure } = require('../lib/lms');
const emailit = require('../lib/emailit');
const programmes = require('../lib/programmes');

// Full quiz snapshot (row + nested questions/options) for version history —
// quizzes are always rebuilt wholesale on save, so a snapshot needs the
// entire nested shape to be restorable.
async function snapshotQuiz(quizId) {
  const quiz = await knex('quizzes').where({ id: quizId }).first();
  if (!quiz) return null;
  const questions = await knex('quiz_questions').where({ quiz_id: quizId }).orderBy('sort_order');
  for (const q of questions) {
    q.options = await knex('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
  }
  return { quiz, questions };
}

const router = express.Router();

// ─── Image uploads (media library) ──────────────────────────
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB so lesson videos can be uploaded directly
  fileFilter: (req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});

router.use(requireRole('staff', 'admin'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.adminActive = '';
  next();
});

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost'];
const APP_STATUSES = ['new', 'in_review', 'interview', 'offer', 'accepted', 'declined', 'withdrawn'];

// Build a CSV string from rows + column definitions ({key,label}).
function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

// ─── Global search ───────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    let leads = [], applications = [], students = [];
    if (q) {
      const like = `%${q}%`;
      leads = await knex('leads')
        .where((b) => b.whereILike('first_name', like).orWhereILike('last_name', like).orWhereILike('email', like))
        .limit(20);
      applications = await knex('applications')
        .where((b) => b.whereILike('first_name', like).orWhereILike('last_name', like).orWhereILike('email', like).orWhereILike('reference', like))
        .limit(20);
      students = await knex('users').where({ role: 'student' })
        .where((b) => b.whereILike('first_name', like).orWhereILike('last_name', like).orWhereILike('email', like))
        .limit(20);
    }
    res.render('admin/search', { pageTitle: 'Search | GDCU CRM', adminActive: '', q, leads, applications, students });
  } catch (err) { next(err); }
});

// ─── Application documents ───────────────────────────────────
router.post('/applications/:id/documents', async (req, res, next) => {
  try {
    if (req.body.label && req.body.url) {
      await knex('application_documents').insert({
        application_id: req.params.id,
        label: req.body.label.trim(),
        url: req.body.url.trim(),
        uploaded_by: req.session.user.id,
      });
      req.flash('success', 'Document added.');
    }
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/documents/:id/delete', async (req, res, next) => {
  try {
    const doc = await knex('application_documents').where({ id: req.params.id }).first();
    await knex('application_documents').where({ id: req.params.id }).del();
    req.flash('success', 'Document removed.');
    res.redirect(doc ? `/admin/applications/${doc.application_id}` : '/admin/applications');
  } catch (err) { next(err); }
});

// ─── Dashboard ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const count = async (t, where) => Number((await knex(t).where(where || {}).count({ c: '*' }).first()).c);

    const stats = {
      leadsNew: await count('leads', { status: 'new' }),
      leadsTotal: await count('leads'),
      appsOpen: Number((await knex('applications').whereNotIn('status', ['accepted', 'declined', 'withdrawn']).count({ c: '*' }).first()).c),
      appsTotal: await count('applications'),
      students: await count('users', { role: 'student' }),
      messages: await count('contact_messages', { handled: false }),
    };

    // Revenue collected from paid invoices
    const revRow = await knex('invoices').where({ status: 'paid' }).sum({ s: 'amount' }).first();
    stats.revenue = Number(revRow.s || 0);
    const outstandingRow = await knex('invoices').whereIn('status', ['sent', 'overdue']).sum({ s: 'amount' }).first();
    stats.outstanding = Number(outstandingRow.s || 0);

    // Application pipeline counts
    const pipeline = {};
    for (const s of APP_STATUSES) pipeline[s] = await count('applications', { status: s });

    const recentLeads = await knex('leads').orderBy('created_at', 'desc').limit(5);
    const recentApps = await knex('applications')
      .leftJoin('programs', 'applications.program_id', 'programs.id')
      .select('applications.*', 'programs.title as program_title')
      .orderBy('applications.created_at', 'desc')
      .limit(5);

    // My open follow-up tasks (assigned to me or unassigned), soonest first.
    const myTasks = await knex('crm_tasks')
      .where({ done: false })
      .andWhere((b) => b.where('assigned_to', req.session.user.id).orWhereNull('assigned_to'))
      .orderBy('due_date')
      .limit(8);
    const todayStr = new Date().toISOString().slice(0, 10);
    myTasks.forEach((t) => { t.overdue = t.due_date && String(t.due_date).slice(0, 10) < todayStr; });

    // Today's scheduled interviews
    const todaysInterviews = await knex('interviews')
      .leftJoin('applications', 'interviews.application_id', 'applications.id')
      .leftJoin('users', 'interviews.interviewer_id', 'users.id')
      .whereRaw('date(interviews.scheduled_at) = ?', [todayStr])
      .whereIn('interviews.status', ['scheduled', 'confirmed'])
      .select('interviews.id', 'interviews.scheduled_at', 'interviews.mode', 'interviews.status',
        'applications.id as application_id', 'applications.first_name', 'applications.last_name', 'applications.reference',
        'users.first_name as interviewer_first', 'users.last_name as interviewer_last')
      .orderBy('interviews.scheduled_at');

    // Overdue follow-up tasks across the team
    const overdueTasks = await knex('crm_tasks')
      .where({ done: false })
      .whereNotNull('due_date')
      .whereRaw('date(due_date) < ?', [todayStr])
      .orderBy('due_date')
      .limit(8);

    // Analytics: leads by source + lead conversion funnel
    const leadsBySource = await knex('leads').select('source').count({ c: '*' }).groupBy('source');
    const funnel = {
      leads: stats.leadsTotal,
      qualified: await count('leads', { status: 'qualified' }),
      applications: stats.appsTotal,
      accepted: await count('applications', { status: 'accepted' }),
    };

    res.render('admin/dashboard', {
      pageTitle: 'CRM Dashboard | GDCU',
      adminActive: 'dashboard',
      stats,
      pipeline,
      recentLeads,
      recentApps,
      myTasks,
      todaysInterviews,
      overdueTasks,
      leadsBySource,
      funnel,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Leads ───────────────────────────────────────────────────
router.get('/leads', async (req, res, next) => {
  try {
    const { status, q, owner, archived } = req.query;
    const query = knex('leads')
      .leftJoin('programs', 'leads.program_id', 'programs.id')
      .leftJoin('users', 'leads.assigned_to', 'users.id')
      .select('leads.*', 'programs.title as program_title',
        'users.first_name as owner_first', 'users.last_name as owner_last');
    query.where('leads.archived', archived === '1');
    if (status) query.where('leads.status', status);
    if (owner === 'me') query.where('leads.assigned_to', req.session.user.id);
    else if (owner === 'unassigned') query.whereNull('leads.assigned_to');
    if (q) query.where((b) => b.whereILike('leads.first_name', `%${q}%`).orWhereILike('leads.last_name', `%${q}%`).orWhereILike('leads.email', `%${q}%`));

    const countQ = query.clone().clearSelect().clearOrder().count({ c: '*' }).first();
    const pg = pageInfo((await countQ).c, req.query.page, 25);
    const leads = await query.orderBy('leads.created_at', 'desc').limit(pg.perPage).offset(pg.offset);
    const staff = await knex('users').whereIn('role', ['staff', 'admin']).select('id', 'first_name', 'last_name');

    // Per-status counts for the pipeline chips (respect the archived view)
    const statusRows = await knex('leads').where('archived', archived === '1').select('status').count({ c: '*' }).groupBy('status');
    const statusCounts = {};
    statusRows.forEach((r) => { statusCounts[r.status] = Number(r.c); });

    res.render('admin/leads', {
      pageTitle: 'Leads | GDCU CRM',
      adminActive: 'leads',
      leads,
      pg,
      staff,
      statusCounts,
      statuses: LEAD_STATUSES,
      filters: { status: status || '', q: q || '', owner: owner || '', archived: archived === '1' },
    });
  } catch (err) {
    next(err);
  }
});

// Bulk actions on leads
router.post('/leads/bulk', async (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    const back = req.get('referer') || '/admin/leads';
    if (!ids.length) { req.flash('error', 'Select at least one lead.'); return res.redirect(back); }
    const action = req.body.action;
    if (action === 'status' && LEAD_STATUSES.includes(req.body.status)) {
      await knex('leads').whereIn('id', ids).update({ status: req.body.status, updated_at: knex.fn.now() });
    } else if (action === 'assign') {
      await knex('leads').whereIn('id', ids).update({ assigned_to: req.body.assigned_to || null, updated_at: knex.fn.now() });
    } else if (action === 'archive') {
      await knex('leads').whereIn('id', ids).update({ archived: true, updated_at: knex.fn.now() });
    } else if (action === 'unarchive') {
      await knex('leads').whereIn('id', ids).update({ archived: false, updated_at: knex.fn.now() });
    } else if (action === 'delete') {
      await knex('leads').whereIn('id', ids).del();
    }
    req.flash('success', `Bulk action applied to ${ids.length} lead(s).`);
    res.redirect(back);
  } catch (err) { next(err); }
});

// Export must be registered before the /:id route so "export.csv" isn't read as an id.
router.get('/leads/export.csv', async (req, res, next) => {
  try {
    const { status, q, owner, archived } = req.query;
    const query = knex('leads')
      .leftJoin('programs', 'leads.program_id', 'programs.id')
      .select('leads.*', 'programs.title as program_title')
      .where('leads.archived', archived === '1');
    if (status) query.where('leads.status', status);
    if (owner === 'me') query.where('leads.assigned_to', req.session.user.id);
    else if (owner === 'unassigned') query.whereNull('leads.assigned_to');
    if (q) query.where((b) => b.whereILike('leads.first_name', `%${q}%`).orWhereILike('leads.last_name', `%${q}%`).orWhereILike('leads.email', `%${q}%`));
    const leads = await query.orderBy('leads.created_at', 'desc');
    const csv = toCsv(leads, [
      { key: 'id', label: 'ID' }, { key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' },
      { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'country', label: 'Country' },
      { key: 'program_title', label: 'Program' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Source' },
      { key: 'created_at', label: 'Created' },
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="gdcu-leads.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// Manually add a lead (e.g. a phone/walk-in/event enquiry)
router.get('/leads/new', async (req, res, next) => {
  try {
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    res.render('admin/lead-edit', { pageTitle: 'New Lead | GDCU CRM', adminActive: 'leads', lead: { status: 'new' }, programs, statuses: LEAD_STATUSES, isNew: true });
  } catch (err) { next(err); }
});

router.post('/leads', async (req, res, next) => {
  try {
    if (!req.body.first_name || !req.body.email) {
      req.flash('error', 'Name and email are required.');
      return res.redirect('/admin/leads/new');
    }
    const [idRaw] = await knex('leads').insert({
      first_name: req.body.first_name, last_name: req.body.last_name || null,
      email: req.body.email, phone: req.body.phone || null, country: req.body.country || null,
      program_id: req.body.program_id || null, interest: req.body.interest || null,
      message: req.body.message || null, source: req.body.source || 'manual',
      status: LEAD_STATUSES.includes(req.body.status) ? req.body.status : 'new',
      assigned_to: req.body.assigned_to || req.session.user.id,
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Lead created.');
    res.redirect(`/admin/leads/${id}`);
  } catch (err) { next(err); }
});

router.get('/leads/:id', async (req, res, next) => {
  try {
    const lead = await knex('leads')
      .leftJoin('programs', 'leads.program_id', 'programs.id')
      .select('leads.*', 'programs.title as program_title')
      .where('leads.id', req.params.id)
      .first();
    if (!lead) return res.status(404).render('errors/404', { pageTitle: 'Lead not found', layout: 'layouts/admin' });
    const notes = await knex('crm_notes').where({ entity_type: 'lead', entity_id: lead.id }).orderBy('created_at', 'desc');
    const tasks = await knex('crm_tasks').where({ entity_type: 'lead', entity_id: lead.id }).orderBy('done').orderBy('due_date');
    const staff = await knex('users').whereIn('role', ['staff', 'admin']).select('id', 'first_name', 'last_name');
    const owner = lead.assigned_to ? await knex('users').where({ id: lead.assigned_to }).first() : null;
    const activity = await knex('activity_log').where({ entity_type: 'lead', entity_id: lead.id }).orderBy('created_at', 'desc').limit(50);
    const dupLeads = lead.email ? await knex('leads').whereRaw('lower(email) = ?', [lead.email.toLowerCase()]).whereNot('id', lead.id).select('id', 'first_name', 'last_name', 'status').limit(5) : [];
    const dupApps = lead.email ? await knex('applications').whereRaw('lower(email) = ?', [lead.email.toLowerCase()]).select('id', 'reference', 'status').limit(5) : [];
    res.render('admin/lead-detail', {
      pageTitle: `${lead.first_name} ${lead.last_name || ''} | Lead`,
      adminActive: 'leads',
      lead,
      notes,
      tasks,
      staff,
      owner,
      activity,
      dupLeads,
      dupApps,
      statuses: LEAD_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/leads/:id/status', async (req, res, next) => {
  try {
    const status = LEAD_STATUSES.includes(req.body.status) ? req.body.status : null;
    if (status) {
      const prev = await knex('leads').where({ id: req.params.id }).first();
      await knex('leads').where({ id: req.params.id }).update({ status, updated_at: knex.fn.now() });
      if (prev && prev.status !== status) logActivity('lead', Number(req.params.id), req.session.user, 'Status changed', `${prev.status} → ${status}`);
      req.flash('success', `Lead status updated to "${status}".`);
    }
    res.redirect(`/admin/leads/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// Lead quick-view drawer fragment
router.get('/leads/:id/drawer', async (req, res, next) => {
  try {
    const lead = await knex('leads')
      .leftJoin('programs', 'leads.program_id', 'programs.id')
      .select('leads.*', 'programs.title as program_title')
      .where('leads.id', req.params.id)
      .first();
    if (!lead) return res.status(404).send('<div class="p-8 text-on-surface-variant">Lead not found.</div>');
    const notes = await knex('crm_notes').where({ entity_type: 'lead', entity_id: lead.id }).orderBy('created_at', 'desc');
    res.render('admin/_lead-drawer', { layout: false, lead, notes, statuses: LEAD_STATUSES });
  } catch (err) { next(err); }
});

// Edit lead fields
router.get('/leads/:id/edit', async (req, res, next) => {
  try {
    const lead = await knex('leads').where({ id: req.params.id }).first();
    if (!lead) return res.status(404).render('errors/404', { pageTitle: 'Lead not found', layout: 'layouts/admin' });
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    res.render('admin/lead-edit', { pageTitle: 'Edit Lead | GDCU CRM', adminActive: 'leads', lead, programs, statuses: LEAD_STATUSES });
  } catch (err) { next(err); }
});

router.post('/leads/:id/edit', async (req, res, next) => {
  try {
    await knex('leads').where({ id: req.params.id }).update({
      first_name: req.body.first_name,
      last_name: req.body.last_name || null,
      email: req.body.email,
      phone: req.body.phone || null,
      country: req.body.country || null,
      program_id: req.body.program_id || null,
      interest: req.body.interest || null,
      message: req.body.message || null,
      status: LEAD_STATUSES.includes(req.body.status) ? req.body.status : undefined,
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Lead updated.');
    res.redirect(`/admin/leads/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/leads/:id/archive', async (req, res, next) => {
  try {
    const lead = await knex('leads').where({ id: req.params.id }).first();
    if (lead) {
      await knex('leads').where({ id: lead.id }).update({ archived: !lead.archived, updated_at: knex.fn.now() });
      req.flash('success', lead.archived ? 'Lead restored from archive.' : 'Lead archived.');
    }
    res.redirect(lead && !lead.archived ? '/admin/leads' : `/admin/leads/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/leads/:id/delete', async (req, res, next) => {
  try {
    await knex('leads').where({ id: req.params.id }).del();
    req.flash('success', 'Lead deleted.');
    res.redirect('/admin/leads');
  } catch (err) { next(err); }
});

// Compose & send an email to a lead from the CRM
router.post('/leads/:id/email', async (req, res, next) => {
  try {
    const lead = await knex('leads').where({ id: req.params.id }).first();
    if (!lead) return res.redirect('/admin/leads');
    if (!req.body.subject || !req.body.body) { req.flash('error', 'Subject and message are required.'); return res.redirect(`/admin/leads/${lead.id}`); }
    const r = await email({
      to: lead.email, toName: `${lead.first_name} ${lead.last_name || ''}`.trim(),
      subject: req.body.subject, heading: req.body.subject,
      bodyHtml: `<p>${String(req.body.body).replace(/\n/g, '<br>')}</p>`,
      relatedType: 'lead', relatedId: lead.id,
    });
    await knex('crm_notes').insert({ entity_type: 'lead', entity_id: lead.id, author_id: req.session.user.id, author_name: req.session.user.name, body: `📧 Email sent — "${req.body.subject}"` });
    logActivity('lead', lead.id, req.session.user, 'Email sent', req.body.subject);
    req.flash('success', r.status === 'sent' ? 'Email sent.' : 'Email recorded (delivery pending — configure SMTP to send).');
    res.redirect(`/admin/leads/${lead.id}`);
  } catch (err) { next(err); }
});

router.post('/leads/:id/notes', async (req, res, next) => {
  try {
    if (req.body.body && req.body.body.trim()) {
      await knex('crm_notes').insert({
        entity_type: 'lead',
        entity_id: req.params.id,
        author_id: req.session.user.id,
        author_name: req.session.user.name,
        body: req.body.body.trim(),
      });
    }
    res.redirect(`/admin/leads/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// ─── Applications ────────────────────────────────────────────
router.get('/applications', async (req, res, next) => {
  try {
    const { status, archived, owner, program, q } = req.query;
    const query = knex('applications')
      .leftJoin('programs', 'applications.program_id', 'programs.id')
      .leftJoin('users', 'applications.assigned_to', 'users.id')
      .select('applications.*', 'programs.title as program_title', 'users.first_name as owner_first', 'users.last_name as owner_last');
    query.where('applications.archived', archived === '1');
    if (status) query.where('applications.status', status);
    if (program) query.where('applications.program_id', program);
    if (owner === 'me') query.where('applications.assigned_to', req.session.user.id);
    else if (owner === 'unassigned') query.whereNull('applications.assigned_to');
    if (q) query.where((b) => b.whereILike('applications.first_name', `%${q}%`).orWhereILike('applications.last_name', `%${q}%`).orWhereILike('applications.email', `%${q}%`).orWhereILike('applications.reference', `%${q}%`));

    const pg = pageInfo((await query.clone().clearSelect().clearOrder().count({ c: '*' }).first()).c, req.query.page, 25);
    const applications = await query.orderBy('applications.created_at', 'desc').limit(pg.perPage).offset(pg.offset);
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    const staff = await knex('users').whereIn('role', ['staff', 'admin']).select('id', 'first_name', 'last_name');
    const statusRows = await knex('applications').where('archived', archived === '1').select('status').count({ c: '*' }).groupBy('status');
    const statusCounts = {};
    statusRows.forEach((r) => { statusCounts[r.status] = Number(r.c); });
    res.render('admin/applications', {
      pageTitle: 'Applications | GDCU CRM',
      adminActive: 'applications',
      applications, pg, programs, staff, statusCounts,
      statuses: APP_STATUSES,
      filters: { status: status || '', archived: archived === '1', owner: owner || '', program: program || '', q: q || '' },
    });
  } catch (err) {
    next(err);
  }
});

// Manually log an application (e.g. received offline)
router.get('/applications/new', async (req, res, next) => {
  try {
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    res.render('admin/application-edit', { pageTitle: 'New Application | GDCU CRM', adminActive: 'applications', application: { status: 'new', payment_status: 'unpaid' }, programs, isNew: true });
  } catch (err) { next(err); }
});

router.post('/applications', async (req, res, next) => {
  try {
    if (!req.body.first_name || !req.body.last_name || !req.body.email) {
      req.flash('error', 'First name, last name and email are required.');
      return res.redirect('/admin/applications/new');
    }
    const [idRaw] = await knex('applications').insert({
      reference: makeReference(),
      first_name: req.body.first_name, last_name: req.body.last_name, email: req.body.email,
      phone: req.body.phone || null, country: req.body.country || null, nationality: req.body.nationality || null,
      program_id: req.body.program_id || null, intake: req.body.intake || null,
      prev_qualification: req.body.prev_qualification || null, prior_education: req.body.prev_qualification || null,
      statement: req.body.statement || null, status: 'new', payment_status: 'unpaid',
      assigned_to: req.session.user.id,
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Application created.');
    res.redirect(`/admin/applications/${id}`);
  } catch (err) { next(err); }
});

// Bulk actions on applications
router.post('/applications/bulk', async (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    const back = req.get('referer') || '/admin/applications';
    if (!ids.length) { req.flash('error', 'Select at least one application.'); return res.redirect(back); }
    const action = req.body.action;
    if (action === 'status' && APP_STATUSES.includes(req.body.status)) {
      await knex('applications').whereIn('id', ids).update({ status: req.body.status, updated_at: knex.fn.now() });
    } else if (action === 'assign') {
      await knex('applications').whereIn('id', ids).update({ assigned_to: req.body.assigned_to || null, updated_at: knex.fn.now() });
    } else if (action === 'archive') {
      await knex('applications').whereIn('id', ids).update({ archived: true, updated_at: knex.fn.now() });
    } else if (action === 'unarchive') {
      await knex('applications').whereIn('id', ids).update({ archived: false, updated_at: knex.fn.now() });
    }
    req.flash('success', `Bulk action applied to ${ids.length} application(s).`);
    res.redirect(back);
  } catch (err) { next(err); }
});

router.get('/applications/export.csv', async (req, res, next) => {
  try {
    const { status, program, owner, q, archived } = req.query;
    const query = knex('applications')
      .leftJoin('programs', 'applications.program_id', 'programs.id')
      .select('applications.*', 'programs.title as program_title')
      .where('applications.archived', archived === '1');
    if (status) query.where('applications.status', status);
    if (program) query.where('applications.program_id', program);
    if (owner === 'me') query.where('applications.assigned_to', req.session.user.id);
    else if (owner === 'unassigned') query.whereNull('applications.assigned_to');
    if (q) query.where((b) => b.whereILike('applications.first_name', `%${q}%`).orWhereILike('applications.last_name', `%${q}%`).orWhereILike('applications.email', `%${q}%`).orWhereILike('applications.reference', `%${q}%`));
    const apps = await query.orderBy('applications.created_at', 'desc');
    const csv = toCsv(apps, [
      { key: 'reference', label: 'Reference' }, { key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' },
      { key: 'email', label: 'Email' }, { key: 'country', label: 'Country' }, { key: 'program_title', label: 'Program' },
      { key: 'intake', label: 'Intake' }, { key: 'status', label: 'Status' }, { key: 'payment_status', label: 'Payment' },
      { key: 'created_at', label: 'Created' },
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="gdcu-applications.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

router.get('/applications/:id', async (req, res, next) => {
  try {
    const application = await knex('applications')
      .leftJoin('programs', 'applications.program_id', 'programs.id')
      .select('applications.*', 'programs.title as program_title', 'programs.tuition as program_tuition', 'programs.tuition_currency as program_currency')
      .where('applications.id', req.params.id)
      .first();
    if (!application) return res.status(404).render('errors/404', { pageTitle: 'Application not found', layout: 'layouts/admin' });
    const notes = await knex('crm_notes').where({ entity_type: 'application', entity_id: application.id }).orderBy('created_at', 'desc');
    const tasks = await knex('crm_tasks').where({ entity_type: 'application', entity_id: application.id }).orderBy('done').orderBy('due_date');
    const fees = await knex('application_fees').where({ application_id: application.id });
    const studentUser = application.student_user_id ? await knex('users').where({ id: application.student_user_id }).first() : null;
    const interviews = await knex('interviews').where({ application_id: application.id }).orderBy('scheduled_at', 'desc');
    const interviewers = await knex('users').whereIn('role', ['staff', 'admin', 'faculty']).select('id', 'first_name', 'last_name');
    const assignees = await knex('users').whereIn('role', ['staff', 'admin']).select('id', 'first_name', 'last_name');
    const owner = application.assigned_to ? await knex('users').where({ id: application.assigned_to }).first() : null;
    const documents = await knex('application_documents').where({ application_id: application.id }).orderBy('created_at', 'desc');
    const activity = await knex('activity_log').where({ entity_type: 'application', entity_id: application.id }).orderBy('created_at', 'desc').limit(50);
    const dupApps = application.email ? await knex('applications').whereRaw('lower(email) = ?', [application.email.toLowerCase()]).whereNot('id', application.id).select('id', 'reference', 'status').limit(5) : [];
    res.render('admin/application-detail', {
      pageTitle: `${application.reference} | Application`,
      adminActive: 'applications',
      application,
      notes,
      tasks,
      fees,
      studentUser,
      interviews,
      interviewers,
      assignees,
      owner,
      documents,
      activity,
      dupApps,
      statuses: APP_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

// Application quick-view drawer fragment
router.get('/applications/:id/drawer', async (req, res, next) => {
  try {
    const application = await knex('applications')
      .leftJoin('programs', 'applications.program_id', 'programs.id')
      .select('applications.*', 'programs.title as program_title')
      .where('applications.id', req.params.id)
      .first();
    if (!application) return res.status(404).send('<div class="p-8 text-on-surface-variant">Application not found.</div>');
    const notes = await knex('crm_notes').where({ entity_type: 'application', entity_id: application.id }).orderBy('created_at', 'desc');
    res.render('admin/_application-drawer', { layout: false, application, notes, statuses: APP_STATUSES });
  } catch (err) { next(err); }
});

// Edit application fields
router.get('/applications/:id/edit', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ id: req.params.id }).first();
    if (!application) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    res.render('admin/application-edit', { pageTitle: 'Edit Application | GDCU CRM', adminActive: 'applications', application, programs });
  } catch (err) { next(err); }
});

router.post('/applications/:id/edit', async (req, res, next) => {
  try {
    const update = {
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      phone: req.body.phone || null,
      country: req.body.country || null,
      program_id: req.body.program_id || null,
      intake: req.body.intake || null,
      statement: req.body.statement || null,
      sponsorship_interest: req.body.sponsorship_interest === 'on',
      updated_at: knex.fn.now(),
    };
    // All the extended application fields (text), saved when present.
    const extra = ['title', 'middle_name', 'preferred_name', 'gender', 'nationality',
      'address_line1', 'address_line2', 'city', 'region', 'postal_code',
      'date_of_birth', 'prev_institution', 'prev_qualification', 'prev_grade', 'prev_year', 'english_proficiency',
      'employment_status', 'occupation', 'employer', 'church_involvement',
      'ref1_name', 'ref1_email', 'ref1_relationship', 'ref2_name', 'ref2_email', 'ref2_relationship', 'how_heard'];
    for (const f of extra) update[f] = (req.body[f] || '').trim() || null;
    update.prior_education = update.prev_qualification || req.body.prior_education || null;
    await knex('applications').where({ id: req.params.id }).update(update);
    req.flash('success', 'Application updated.');
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/applications/:id/archive', async (req, res, next) => {
  try {
    const app = await knex('applications').where({ id: req.params.id }).first();
    if (app) {
      await knex('applications').where({ id: app.id }).update({ archived: !app.archived, updated_at: knex.fn.now() });
      req.flash('success', app.archived ? 'Application restored from archive.' : 'Application archived.');
    }
    res.redirect(app && !app.archived ? '/admin/applications' : `/admin/applications/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/applications/:id/delete', async (req, res, next) => {
  try {
    await knex('applications').where({ id: req.params.id }).del();
    req.flash('success', 'Application deleted.');
    res.redirect('/admin/applications');
  } catch (err) { next(err); }
});

router.post('/applications/:id/assign', async (req, res, next) => {
  try {
    await knex('applications').where({ id: req.params.id }).update({ assigned_to: req.body.assigned_to || null, updated_at: knex.fn.now() });
    let ownerName = 'Unassigned';
    if (req.body.assigned_to) { const u = await knex('users').where({ id: req.body.assigned_to }).first(); ownerName = u ? `${u.first_name} ${u.last_name}` : 'a staff member'; }
    logActivity('application', Number(req.params.id), req.session.user, 'Assigned', `to ${ownerName}`);
    req.flash('success', 'Application reassigned.');
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (err) { next(err); }
});

// Compose & send an email to an applicant from the CRM
router.post('/applications/:id/email', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ id: req.params.id }).first();
    if (!application) return res.redirect('/admin/applications');
    if (!req.body.subject || !req.body.body) { req.flash('error', 'Subject and message are required.'); return res.redirect(`/admin/applications/${application.id}`); }
    const r = await email({
      to: application.email, toName: `${application.first_name} ${application.last_name}`,
      subject: req.body.subject, heading: req.body.subject,
      bodyHtml: `<p>${String(req.body.body).replace(/\n/g, '<br>')}</p>`,
      relatedType: 'application', relatedId: application.id,
    });
    await knex('crm_notes').insert({ entity_type: 'application', entity_id: application.id, author_id: req.session.user.id, author_name: req.session.user.name, body: `📧 Email sent — "${req.body.subject}"` });
    logActivity('application', application.id, req.session.user, 'Email sent', req.body.subject);
    req.flash('success', r.status === 'sent' ? 'Email sent.' : 'Email recorded (delivery pending — configure SMTP to send).');
    res.redirect(`/admin/applications/${application.id}`);
  } catch (err) { next(err); }
});

router.post('/applications/:id/notes', async (req, res, next) => {
  try {
    if (req.body.body && req.body.body.trim()) {
      await knex('crm_notes').insert({
        entity_type: 'application',
        entity_id: req.params.id,
        author_id: req.session.user.id,
        author_name: req.session.user.name,
        body: req.body.body.trim(),
      });
    }
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

/**
 * Update application status. When moving to "accepted", create a student
 * account (if one doesn't exist for that email) and link it. A temporary
 * password is generated and shown once to the staff member.
 */
router.post('/applications/:id/status', async (req, res, next) => {
  try {
    const status = APP_STATUSES.includes(req.body.status) ? req.body.status : null;
    if (!status) return res.redirect(`/admin/applications/${req.params.id}`);

    const application = await knex('applications').where({ id: req.params.id }).first();
    if (!application) return res.redirect('/admin/applications');

    const update = { status, updated_at: knex.fn.now() };

    if (status === 'accepted') {
      // The application may already be linked to a student account — e.g.
      // it was submitted from inside the portal by an already-logged-in
      // student applying to a second programme. Only create/find + welcome
      // a NEW account when it isn't linked yet; either way, enrolment +
      // invoicing below always runs on acceptance.
      let user = application.student_user_id ? await knex('users').where({ id: application.student_user_id }).first() : null;
      let tempPassword = null;
      if (!user) {
        user = await knex('users').where({ email: application.email }).first();
        if (!user) {
          tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
          const hash = await bcrypt.hash(tempPassword, 12);
          const [uidRaw] = await knex('users').insert({
            first_name: application.first_name,
            last_name: application.last_name,
            email: application.email,
            password_hash: hash,
            role: 'student',
            status: 'active',
          });
          const uid = Array.isArray(uidRaw) ? uidRaw[0] : uidRaw;
          user = { id: uid };
        }
        update.student_user_id = user.id;
        if (tempPassword) {
          req.flash('success', `Application accepted. Student account created for ${application.email}. Temporary password: ${tempPassword}`);
        } else {
          req.flash('success', `Application accepted and linked to existing account for ${application.email}.`);
        }
        // Welcome the new/linked student in-app and by email.
        notifyUser(user.id, { type: 'success', title: 'Welcome to GDCU!', body: 'Your application was accepted. Explore your student portal.', link: '/portal' });
        email({
          to: application.email, toName: `${application.first_name} ${application.last_name}`,
          subject: 'Congratulations — your GDCU application is accepted',
          heading: 'Welcome to Global Diaspora Christian University',
          bodyHtml: `<p>Dear ${application.first_name},</p><p>We are delighted to offer you a place. Your student account is ready — sign in to your portal to begin.</p>${tempPassword ? `<p>Your temporary password is <strong>${tempPassword}</strong> (please change it after signing in).</p>` : ''}<p><a href="${process.env.APP_URL || ''}/login" style="color:#b8861b">Sign in to your portal</a></p>`,
          relatedType: 'application', relatedId: application.id,
        });
        emailit.upsertContact({ email: application.email, firstName: application.first_name, lastName: application.last_name, tags: ['student'] }).catch(() => {});
      } else {
        req.flash('success', `Application accepted for ${application.email}.`);
        notifyUser(user.id, { type: 'success', title: 'Application accepted!', body: 'Your application was accepted — you now have access to your new course.', link: '/portal/courses' });
      }

      // Acceptance is the admissions decision for this programme — enrol the
      // student into its course(s) now (a programme can have more than one)
      // and raise their tuition invoice, rather than leaving them to
      // self-enrol separately with no record of what they were accepted into.
      if (application.program_id) {
        const programCourses = await knex('courses').where({ program_id: application.program_id, published: true });
        for (const c of programCourses) {
          const already = await knex('enrollments').where({ user_id: user.id, course_id: c.id }).first();
          if (!already) await knex('enrollments').insert({ user_id: user.id, course_id: c.id, status: 'active', progress_pct: 0 });
        }
        await programmes.ensureTuitionInvoice(application.program_id, user.id, req.session.user.id);
      }
    } else {
      req.flash('success', `Application status updated to "${status}".`);
      if (application.student_user_id) {
        notifyUser(application.student_user_id, { type: 'application', title: 'Application update', body: `Your application is now: ${status.replace('_', ' ')}.`, link: '/portal' });
      }
    }

    await knex('applications').where({ id: application.id }).update(update);
    if (application.status !== status) logActivity('application', application.id, req.session.user, 'Status changed', `${application.status} → ${status}`);
    res.redirect(`/admin/applications/${application.id}`);
  } catch (err) {
    next(err);
  }
});

// ─── Students directory ──────────────────────────────────────
router.get('/students', async (req, res, next) => {
  try {
    const { q } = req.query;
    const query = knex('users').where({ role: 'student' });
    if (q) query.where((b) => b.whereILike('first_name', `%${q}%`).orWhereILike('last_name', `%${q}%`).orWhereILike('email', `%${q}%`));
    const pg = pageInfo((await query.clone().count({ c: '*' }).first()).c, req.query.page, 25);
    const students = await query.orderBy('created_at', 'desc').limit(pg.perPage).offset(pg.offset);
    // enrollment + cert counts
    for (const s of students) {
      s.enrollments = Number((await knex('enrollments').where({ user_id: s.id }).count({ c: '*' }).first()).c);
      s.certificates = Number((await knex('certificates').where({ user_id: s.id }).count({ c: '*' }).first()).c);
      s.engagement = attendance.engagementFor(s);
    }
    res.render('admin/students', { pageTitle: 'Students | GDCU CRM', adminActive: 'students', students, pg, filters: { q: q || '' } });
  } catch (err) {
    next(err);
  }
});

// Student quick-view drawer
router.get('/students/:id/drawer', async (req, res, next) => {
  try {
    const student = await knex('users').where({ id: req.params.id, role: 'student' }).first();
    if (!student) return res.status(404).send('<div class="p-8 text-on-surface-variant">Student not found.</div>');
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', student.id)
      .select('courses.title as course_title', 'enrollments.progress_pct', 'enrollments.status');
    const certificates = Number((await knex('certificates').where({ user_id: student.id }).count({ c: '*' }).first()).c);
    const outRow = await knex('invoices').where({ user_id: student.id }).whereIn('status', ['sent', 'overdue']).sum({ s: 'amount' }).first();
    res.render('admin/_student-drawer', { layout: false, student, enrollments, certificates, outstanding: Number(outRow.s || 0) });
  } catch (err) { next(err); }
});

router.get('/students/:id', async (req, res, next) => {
  try {
    const student = await knex('users').where({ id: req.params.id, role: 'student' }).first();
    if (!student) return res.status(404).render('errors/404', { pageTitle: 'Student not found', layout: 'layouts/admin' });
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', student.id)
      .select('enrollments.*', 'courses.title as course_title', 'courses.code as course_code');
    const certificates = await knex('certificates').where({ user_id: student.id }).orderBy('issued_at', 'desc');
    const invoices = await knex('invoices').where({ user_id: student.id }).orderBy('due_date');
    const enrolledIds = enrollments.map((e) => e.course_id);
    const availableCourses = await knex('courses').where({ published: true })
      .whereNotIn('id', enrolledIds.length ? enrolledIds : [0]).orderBy('title').select('id', 'title');
    const sponsorship = await knex('sponsorships').where({ student_id: student.id }).orderBy('created_at', 'desc').first();
    let contributions = [];
    let raised = 0;
    if (sponsorship) {
      contributions = await knex('sponsorship_contributions').where({ sponsorship_id: sponsorship.id }).orderBy('created_at', 'desc');
      raised = contributions.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);
    }
    // Engagement / attendance
    const engagement = attendance.engagementFor(student);
    const recentLogins = await knex('login_events').where({ user_id: student.id }).orderBy('created_at', 'desc').limit(8);
    const warnings = await knex('attendance_warnings').where({ user_id: student.id }).orderBy('sent_at', 'desc').limit(5);
    const formationGroup = await knex('formation_members')
      .join('formation_groups', 'formation_members.group_id', 'formation_groups.id')
      .where('formation_members.student_id', student.id)
      .select('formation_groups.id', 'formation_groups.name').first();
    const studentProfile = await profiles.getProfile('student', student.id);
    const studentProgram = studentProfile.program_id ? await knex('programs').where({ id: studentProfile.program_id }).first() : null;
    res.render('admin/student-detail', {
      pageTitle: `${student.first_name} ${student.last_name} | Student`,
      adminActive: 'students',
      student,
      enrollments,
      availableCourses,
      certificates,
      invoices,
      sponsorship,
      contributions,
      raised,
      engagement,
      recentLogins,
      warnings,
      formationGroup,
      studentProfile,
      studentProgram,
      appUrl: process.env.APP_URL || '',
    });
  } catch (err) {
    next(err);
  }
});

// Enrol / unenrol a student into a course (from the CRM)
router.post('/students/:id/enroll', async (req, res, next) => {
  try {
    const student = await knex('users').where({ id: req.params.id, role: 'student' }).first();
    const course = await knex('courses').where({ id: req.body.course_id }).first();
    if (!student || !course) { req.flash('error', 'Select a valid course.'); return res.redirect(`/admin/students/${req.params.id}`); }
    const existing = await knex('enrollments').where({ user_id: student.id, course_id: course.id }).first();
    if (existing) { req.flash('info', 'Already enrolled in that course.'); return res.redirect(`/admin/students/${student.id}`); }
    await knex('enrollments').insert({ user_id: student.id, course_id: course.id, status: 'active', progress_pct: 0 });
    await programmes.ensureTuitionInvoice(course.program_id, student.id, req.session.user.id);
    notifyUser(student.id, { type: 'success', title: 'Enrolled in a new course', body: course.title, link: `/portal/courses/${course.slug}` });
    req.flash('success', `Enrolled in ${course.title}. A tuition invoice has been raised on their account if one didn't already exist.`);
    res.redirect(`/admin/students/${student.id}`);
  } catch (err) { next(err); }
});

router.post('/students/:id/unenroll', async (req, res, next) => {
  try {
    await knex('enrollments').where({ user_id: req.params.id, course_id: req.body.course_id }).del();
    req.flash('success', 'Enrolment removed.');
    res.redirect(`/admin/students/${req.params.id}`);
  } catch (err) { next(err); }
});

// ─── Faculty ─────────────────────────────────────────────────
router.get('/faculty', async (req, res, next) => {
  try {
    const faculty = await knex('users').whereIn('role', ['faculty']).orderBy('last_name');
    for (const f of faculty) {
      f.courses = await knex('courses').where({ instructor_id: f.id }).select('title', 'code');
    }
    res.render('admin/faculty', { pageTitle: 'Faculty | GDCU CRM', adminActive: 'faculty', faculty });
  } catch (err) {
    next(err);
  }
});

// ─── Finance ─────────────────────────────────────────────────
router.get('/finance', async (req, res, next) => {
  try {
    const invoices = await knex('invoices')
      .join('users', 'invoices.user_id', 'users.id')
      .select('invoices.*', 'users.first_name', 'users.last_name', 'users.email')
      .orderBy('invoices.due_date');

    const sum = async (where) => Number((await knex('invoices').where(where).sum({ s: 'amount' }).first()).s || 0);
    const totals = {
      collected: await sum({ status: 'paid' }),
      outstanding: Number((await knex('invoices').whereIn('status', ['sent', 'overdue']).sum({ s: 'amount' }).first()).s || 0),
      overdue: await sum({ status: 'overdue' }),
    };

    const students = await knex('users').where({ role: 'student' }).orderBy('first_name').select('id', 'first_name', 'last_name');
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title', 'tuition');

    res.render('admin/finance', {
      pageTitle: 'Finance | GDCU CRM',
      adminActive: 'finance',
      invoices,
      totals,
      students,
      programs,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/invoices',
  [
    body('user_id').notEmpty(),
    body('description').trim().notEmpty(),
    body('amount').isFloat({ gt: 0 }),
  ],
  async (req, res, next) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        req.flash('error', 'Please provide a student, description and a valid amount.');
        return res.redirect('/admin/finance');
      }
      const [invId] = await knex('invoices').insert({
        reference: makeReference('INV'),
        user_id: req.body.user_id,
        program_id: req.body.program_id || null,
        description: req.body.description.trim(),
        amount: Number(req.body.amount),
        currency: req.body.currency || 'GBP',
        due_date: req.body.due_date || null,
        status: 'draft',
        created_by: req.session.user.id,
      });
      const invoiceId = Array.isArray(invId) ? invId[0] : invId;
      req.flash('success', 'Invoice created as a draft. Preview it, then send it to the student when ready.');
      res.redirect(`/admin/invoices/${invoiceId}/preview`);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/invoices/:id/pay', async (req, res, next) => {
  try {
    await knex('invoices').where({ id: req.params.id }).update({
      status: 'paid',
      payment_method: req.body.payment_method || 'manual',
      paid_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Invoice marked as paid.');
    res.redirect(req.get('referer') || '/admin/finance');
  } catch (err) {
    next(err);
  }
});

// ─── Messages inbox ──────────────────────────────────────────
router.get('/messages', async (req, res, next) => {
  try {
    const messages = await knex('contact_messages').orderBy('created_at', 'desc');
    res.render('admin/messages', { pageTitle: 'Messages | GDCU CRM', adminActive: 'messages', messages });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/:id/handled', async (req, res, next) => {
  try {
    const msg = await knex('contact_messages').where({ id: req.params.id }).first();
    if (msg) await knex('contact_messages').where({ id: msg.id }).update({ handled: !msg.handled });
    res.redirect('/admin/messages');
  } catch (err) {
    next(err);
  }
});

// ─── Follow-up tasks ─────────────────────────────────────────
async function addTask(req, entityType) {
  if (req.body.title && req.body.title.trim()) {
    await knex('crm_tasks').insert({
      entity_type: entityType,
      entity_id: req.params.id,
      title: req.body.title.trim(),
      due_date: req.body.due_date || null,
      assigned_to: req.body.assigned_to || req.session.user.id,
      created_by: req.session.user.id,
    });
  }
}

router.post('/leads/:id/tasks', async (req, res, next) => {
  try { await addTask(req, 'lead'); req.flash('success', 'Follow-up task added.'); res.redirect(`/admin/leads/${req.params.id}`); }
  catch (err) { next(err); }
});

router.post('/applications/:id/tasks', async (req, res, next) => {
  try { await addTask(req, 'application'); req.flash('success', 'Follow-up task added.'); res.redirect(`/admin/applications/${req.params.id}`); }
  catch (err) { next(err); }
});

router.post('/tasks/:id/toggle', async (req, res, next) => {
  try {
    const task = await knex('crm_tasks').where({ id: req.params.id }).first();
    if (task) {
      await knex('crm_tasks').where({ id: task.id }).update({
        done: !task.done,
        done_at: task.done ? null : knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
    res.redirect(req.get('referer') || '/admin');
  } catch (err) { next(err); }
});

// ─── Lead assignment ─────────────────────────────────────────
router.post('/leads/:id/assign', async (req, res, next) => {
  try {
    await knex('leads').where({ id: req.params.id }).update({
      assigned_to: req.body.assigned_to || null,
      updated_at: knex.fn.now(),
    });
    let ownerName = 'Unassigned';
    if (req.body.assigned_to) { const u = await knex('users').where({ id: req.body.assigned_to }).first(); ownerName = u ? `${u.first_name} ${u.last_name}` : 'a staff member'; }
    logActivity('lead', Number(req.params.id), req.session.user, 'Assigned', `to ${ownerName}`);
    req.flash('success', 'Lead reassigned.');
    res.redirect(`/admin/leads/${req.params.id}`);
  } catch (err) { next(err); }
});

// ─── Lead → Application conversion ───────────────────────────
router.post('/leads/:id/convert', async (req, res, next) => {
  try {
    const lead = await knex('leads').where({ id: req.params.id }).first();
    if (!lead) return res.redirect('/admin/leads');
    if (lead.converted_application_id) {
      req.flash('info', 'This lead has already been converted.');
      return res.redirect(`/admin/applications/${lead.converted_application_id}`);
    }
    const reference = makeReference();
    // Validate FK references so a stale program/owner can't break the insert.
    let programId = null;
    if (lead.program_id) {
      const prog = await knex('programs').where({ id: lead.program_id }).first();
      programId = prog ? prog.id : null;
    }
    let assignedTo = null;
    const ownerId = lead.assigned_to || req.session.user.id;
    if (ownerId) {
      const owner = await knex('users').where({ id: ownerId }).first();
      assignedTo = owner ? owner.id : null;
    }
    const [appIdRaw] = await knex('applications').insert({
      reference,
      program_id: programId,
      first_name: lead.first_name,
      last_name: lead.last_name || '(unknown)',
      email: lead.email,
      phone: lead.phone || null,
      country: lead.country || null,
      statement: lead.message || null,
      status: 'new',
      payment_status: 'unpaid',
      assigned_to: assignedTo,
    });
    const appId = Array.isArray(appIdRaw) ? appIdRaw[0] : appIdRaw;
    await knex('leads').where({ id: lead.id }).update({
      status: 'converted', converted_application_id: appId, updated_at: knex.fn.now(),
    });
    logActivity('lead', lead.id, req.session.user, 'Converted to application', reference);
    logActivity('application', appId, req.session.user, 'Created from lead', `lead #${lead.id}`);
    // Carry over the lead's notes as an application note for continuity.
    await knex('crm_notes').insert({
      entity_type: 'application', entity_id: appId,
      author_id: req.session.user.id, author_name: req.session.user.name,
      body: `Converted from lead #${lead.id}.`,
    });
    req.flash('success', `Lead converted to application ${reference}.`);
    res.redirect(`/admin/applications/${appId}`);
  } catch (err) { next(err); }
});

// ─── Interview scheduler ─────────────────────────────────────
router.get('/interviews', async (req, res, next) => {
  try {
    const interviews = await knex('interviews')
      .join('applications', 'interviews.application_id', 'applications.id')
      .leftJoin('users', 'interviews.interviewer_id', 'users.id')
      .select('interviews.*', 'applications.reference', 'applications.first_name', 'applications.last_name',
        'users.first_name as iv_first', 'users.last_name as iv_last')
      .orderBy('interviews.scheduled_at');
    interviews.forEach((iv) => { iv.unclaimed = !iv.interviewer_id; });
    res.render('admin/interviews', { pageTitle: 'Interviews | GDCU CRM', adminActive: 'interviews', interviews });
  } catch (err) { next(err); }
});

// Claim a pooled (host-less) interview — "whoever is available takes it".
router.post('/interviews/:id/claim', async (req, res, next) => {
  try {
    const iv = await knex('interviews').where({ id: req.params.id }).first();
    if (iv && !iv.interviewer_id) {
      await knex('interviews').where({ id: iv.id }).update({ interviewer_id: req.session.user.id, updated_at: knex.fn.now() });
      logActivity('application', iv.application_id, req.session.user, 'Interview claimed', formatDateTime(iv.scheduled_at));
      googleCalendar.createInterviewEvent(req.session.user.id, {
        summary: 'GDCU admissions interview', description: `Application #${iv.application_id}`,
        startsAt: iv.scheduled_at, durationMins: 30, location: iv.location,
      }).catch(() => {});
      req.flash('success', 'You are now the host for this interview.');
    }
    res.redirect(req.get('referer') || '/admin/interviews');
  } catch (err) { next(err); }
});

router.post('/applications/:id/interview', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ id: req.params.id }).first();
    if (!application) return res.redirect('/admin/applications');
    if (!req.body.scheduled_at) {
      req.flash('error', 'Please choose a date and time.');
      return res.redirect(`/admin/applications/${application.id}`);
    }
    await knex('interviews').insert({
      application_id: application.id,
      interviewer_id: req.body.interviewer_id || req.session.user.id,
      scheduled_at: req.body.scheduled_at.replace('T', ' ') + ':00',
      mode: req.body.mode || 'online',
      location: req.body.location || null,
      status: 'scheduled',
      notes: req.body.notes || null,
    });
    // Advance the application to the interview stage if earlier.
    if (['new', 'in_review'].includes(application.status)) {
      await knex('applications').where({ id: application.id }).update({ status: 'interview', updated_at: knex.fn.now() });
    }
    req.flash('success', 'Interview scheduled.');
    res.redirect(`/admin/applications/${application.id}`);
  } catch (err) { next(err); }
});

// Interview availability slots (staff/admin)
router.get('/interview-slots', async (req, res, next) => {
  try {
    const slots = await knex('interview_slots')
      .leftJoin('users', 'interview_slots.interviewer_id', 'users.id')
      .select('interview_slots.*', 'users.first_name', 'users.last_name')
      .orderBy('interview_slots.starts_at');
    const now = Date.now();
    for (const s of slots) {
      // Host display: a specific person, or a shared pool label ("any available host").
      s.host = s.first_name ? `${s.first_name} ${s.last_name}` : (s.host_label || 'Any available host');
      s.is_pool = !s.interviewer_id;
      // Who has booked this slot (applicants via interviews → applications)
      s.bookings = await knex('interviews')
        .join('applications', 'interviews.application_id', 'applications.id')
        .where('interviews.slot_id', s.id)
        .select('applications.id as application_id', 'applications.first_name', 'applications.last_name', 'applications.reference');
      s.booked = s.bookings.length;
      s.is_past = new Date(s.starts_at).getTime() < now;
      s.is_full = s.booked >= s.capacity;
    }
    const upcoming = slots.filter((s) => !s.is_past);
    const past = slots.filter((s) => s.is_past);
    const stats = {
      total: slots.length,
      open: upcoming.filter((s) => !s.is_full).length,
      booked: slots.reduce((n, s) => n + s.booked, 0),
    };
    const interviewers = await knex('users').whereIn('role', ['staff', 'admin', 'faculty']).select('id', 'first_name', 'last_name');
    const editing = req.query.edit ? await knex('interview_slots').where({ id: req.query.edit }).first() : null;
    res.render('admin/interview-slots', {
      pageTitle: 'Interview Availability | GDCU CRM', adminActive: 'slots',
      upcoming, past, stats, interviewers, editing,
    });
  } catch (err) { next(err); }
});

router.post('/interview-slots', async (req, res, next) => {
  try {
    if (!req.body.starts_at) {
      req.flash('error', 'Choose a time.');
      return res.redirect('/admin/interview-slots');
    }
    const isPool = !req.body.interviewer_id || req.body.interviewer_id === 'pool';
    await knex('interview_slots').insert({
      interviewer_id: isPool ? null : req.body.interviewer_id,
      host_label: isPool ? (req.body.host_label || 'Academic Office') : null,
      starts_at: req.body.starts_at.replace('T', ' ') + ':00',
      mode: req.body.mode || 'online',
      location: req.body.location || null,
      capacity: req.body.capacity ? Number(req.body.capacity) : 1,
      created_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
    req.flash('success', isPool ? 'Pooled slot added — any available host can take it.' : 'Slot added.');
    res.redirect('/admin/interview-slots');
  } catch (err) { next(err); }
});

router.post('/interview-slots/:id', async (req, res, next) => {
  try {
    const slot = await knex('interview_slots').where({ id: req.params.id }).first();
    if (!slot) return res.redirect('/admin/interview-slots');
    const booked = Number((await knex('interviews').where({ slot_id: slot.id }).count({ c: '*' }).first()).c);
    const capacity = req.body.capacity ? Number(req.body.capacity) : 1;
    if (capacity < booked) {
      req.flash('error', `Capacity can't be below the ${booked} already booked.`);
      return res.redirect(`/admin/interview-slots?edit=${slot.id}`);
    }
    const isPool = !req.body.interviewer_id || req.body.interviewer_id === 'pool';
    await knex('interview_slots').where({ id: slot.id }).update({
      interviewer_id: isPool ? null : req.body.interviewer_id,
      host_label: isPool ? (req.body.host_label || 'Academic Office') : null,
      starts_at: req.body.starts_at ? req.body.starts_at.replace('T', ' ') + ':00' : slot.starts_at,
      mode: req.body.mode || 'online',
      location: req.body.location || null,
      capacity,
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Slot updated.');
    res.redirect('/admin/interview-slots');
  } catch (err) { next(err); }
});

router.post('/interview-slots/:id/duplicate', async (req, res, next) => {
  try {
    const slot = await knex('interview_slots').where({ id: req.params.id }).first();
    if (slot) {
      // Duplicate to the next day, same time.
      const d = new Date(slot.starts_at); d.setDate(d.getDate() + 1);
      await knex('interview_slots').insert({
        interviewer_id: slot.interviewer_id, starts_at: d.toISOString().slice(0, 19).replace('T', ' '),
        mode: slot.mode, location: slot.location, capacity: slot.capacity,
        created_at: knex.fn.now(), updated_at: knex.fn.now(),
      });
      req.flash('success', 'Slot duplicated to the next day.');
    }
    res.redirect('/admin/interview-slots');
  } catch (err) { next(err); }
});

router.post('/interview-slots/:id/delete', async (req, res, next) => {
  try {
    await knex('interview_slots').where({ id: req.params.id }).del();
    req.flash('success', 'Slot removed.');
    res.redirect('/admin/interview-slots');
  } catch (err) { next(err); }
});

// Generate a self-scheduling link for an applicant
router.post('/applications/:id/interview-link', async (req, res, next) => {
  try {
    const token = require('crypto').randomBytes(8).toString('hex');
    await knex('applications').where({ id: req.params.id }).update({ interview_token: token, updated_at: knex.fn.now() });
    req.flash('success', 'Interview booking link generated.');
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (err) { next(err); }
});

// Email the applicant their interview self-scheduling link
router.post('/applications/:id/send-interview-invite', async (req, res, next) => {
  try {
    const application = await knex('applications').where({ id: req.params.id }).first();
    if (!application) return res.redirect('/admin/applications');
    let token = application.interview_token;
    if (!token) {
      token = require('crypto').randomBytes(8).toString('hex');
      await knex('applications').where({ id: application.id }).update({ interview_token: token, updated_at: knex.fn.now() });
    }
    await email({
      to: application.email, toName: `${application.first_name} ${application.last_name}`,
      subject: 'Schedule your GDCU admissions interview',
      heading: 'Book your interview',
      bodyHtml: `<p>Dear ${application.first_name},</p><p>We'd like to invite you to an admissions interview. Please choose a time that suits you:</p><p><a href="${process.env.APP_URL || ''}/interview/${token}" style="display:inline-block;background:#071d3a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Choose your interview time</a></p>`,
      relatedType: 'application', relatedId: application.id,
    });
    req.flash('success', `Interview invitation emailed to ${application.email}.`);
    res.redirect(`/admin/applications/${application.id}`);
  } catch (err) { next(err); }
});

// Reschedule an interview (change time / interviewer / mode / location)
router.post('/interviews/:id/reschedule', async (req, res, next) => {
  try {
    const iv = await knex('interviews').where({ id: req.params.id }).first();
    if (!iv) return res.redirect('/admin/interviews');
    await knex('interviews').where({ id: iv.id }).update({
      scheduled_at: req.body.scheduled_at ? req.body.scheduled_at.replace('T', ' ') + ':00' : iv.scheduled_at,
      interviewer_id: req.body.interviewer_id || iv.interviewer_id,
      mode: req.body.mode || iv.mode,
      location: req.body.location || null,
      status: 'scheduled',
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Interview rescheduled.');
    res.redirect(req.get('referer') || `/admin/applications/${iv.application_id}`);
  } catch (err) { next(err); }
});

// Record an interview outcome (recommendation + rating + notes)
router.post('/interviews/:id/outcome', async (req, res, next) => {
  try {
    const iv = await knex('interviews').where({ id: req.params.id }).first();
    if (!iv) return res.redirect('/admin/interviews');
    const outcome = ['pending', 'recommend', 'hold', 'decline'].includes(req.body.outcome) ? req.body.outcome : 'pending';
    await knex('interviews').where({ id: iv.id }).update({
      outcome,
      rating: req.body.rating ? Number(req.body.rating) : null,
      outcome_notes: req.body.outcome_notes || null,
      status: 'completed',
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Interview outcome recorded.');
    res.redirect(req.get('referer') || `/admin/applications/${iv.application_id}`);
  } catch (err) { next(err); }
});

router.post('/interviews/:id/status', async (req, res, next) => {
  try {
    const status = ['scheduled', 'completed', 'cancelled', 'no_show'].includes(req.body.status) ? req.body.status : 'scheduled';
    const iv = await knex('interviews').where({ id: req.params.id }).first();
    if (iv) await knex('interviews').where({ id: iv.id }).update({ status, updated_at: knex.fn.now() });
    res.redirect(req.get('referer') || '/admin/interviews');
  } catch (err) { next(err); }
});

// ─── Executive analytics ─────────────────────────────────────
router.get('/analytics', requireRole('admin'), async (req, res, next) => {
  try {
    const byCountry = await knex('applications').select('country').count({ c: '*' }).whereNotNull('country').groupBy('country').orderBy('c', 'desc').limit(10);
    const studentsByCountry = await knex('applications')
      .join('users', 'applications.student_user_id', 'users.id')
      .select('applications.country').count({ c: '*' }).whereNotNull('applications.country').groupBy('applications.country').orderBy('c', 'desc').limit(8);
    const byProgram = await knex('applications')
      .leftJoin('programs', 'applications.program_id', 'programs.id')
      .select('programs.title').count({ c: '*' }).groupBy('programs.title').orderBy('c', 'desc');
    const enrolmentsByCourse = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .select('courses.title').count({ c: '*' }).groupBy('courses.title').orderBy('c', 'desc');

    const num = (r) => Number(r && r.s ? r.s : 0);
    const revenue = num(await knex('invoices').where({ status: 'paid' }).sum({ s: 'amount' }).first());
    const outstanding = num(await knex('invoices').whereIn('status', ['sent', 'overdue']).sum({ s: 'amount' }).first());
    const cnt = async (t, w) => Number((await knex(t).where(w || {}).count({ c: '*' }).first()).c);
    const totals = {
      students: await cnt('users', { role: 'student' }),
      applications: await cnt('applications'),
      accepted: await cnt('applications', { status: 'accepted' }),
      leads: await cnt('leads'),
      revenue, outstanding,
    };
    totals.acceptanceRate = totals.applications ? Math.round((totals.accepted / totals.applications) * 100) : 0;

    res.render('admin/analytics', {
      pageTitle: 'Executive Analytics | GDCU', adminActive: 'analytics',
      byCountry, studentsByCountry, byProgram, enrolmentsByCourse, totals,
    });
  } catch (err) { next(err); }
});

// ─── Email outbox ────────────────────────────────────────────
router.get('/emails', async (req, res, next) => {
  try {
    const emails = await knex('email_log').orderBy('created_at', 'desc').limit(200);
    const smtpConfigured = Boolean(process.env.SMTP_HOST);
    res.render('admin/emails', { pageTitle: 'Email Outbox | GDCU CRM', adminActive: 'emails', emails, smtpConfigured });
  } catch (err) { next(err); }
});

// ─── Support helpdesk (staff) ────────────────────────────────
router.get('/support', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = knex('support_tickets')
      .leftJoin('users', 'support_tickets.user_id', 'users.id')
      .select('support_tickets.*', 'users.first_name', 'users.last_name', 'users.email');
    if (status) query.where('support_tickets.status', status);
    const tickets = await query.orderBy('support_tickets.updated_at', 'desc');
    res.render('admin/support', { pageTitle: 'Support | GDCU CRM', adminActive: 'support', tickets, filters: { status: status || '' } });
  } catch (err) { next(err); }
});

// Support ticket quick-view drawer
router.get('/support/:id/drawer', async (req, res, next) => {
  try {
    const ticket = await knex('support_tickets')
      .leftJoin('users', 'support_tickets.user_id', 'users.id')
      .select('support_tickets.*', 'users.first_name', 'users.last_name', 'users.email')
      .where('support_tickets.id', req.params.id)
      .first();
    if (!ticket) return res.status(404).send('<div class="p-8 text-on-surface-variant">Ticket not found.</div>');
    const replies = await knex('ticket_replies').where({ ticket_id: ticket.id }).orderBy('created_at');
    res.render('admin/_support-drawer', { layout: false, ticket, replies });
  } catch (err) { next(err); }
});

router.get('/support/:id', async (req, res, next) => {
  try {
    const ticket = await knex('support_tickets')
      .leftJoin('users', 'support_tickets.user_id', 'users.id')
      .select('support_tickets.*', 'users.first_name', 'users.last_name', 'users.email')
      .where('support_tickets.id', req.params.id)
      .first();
    if (!ticket) return res.status(404).render('errors/404', { pageTitle: 'Ticket not found', layout: 'layouts/admin' });
    const replies = await knex('ticket_replies').where({ ticket_id: ticket.id }).orderBy('created_at');
    res.render('admin/support-detail', { pageTitle: `${ticket.reference} | Support`, adminActive: 'support', ticket, replies, editReply: req.query.editReply ? Number(req.query.editReply) : null });
  } catch (err) { next(err); }
});

router.post('/support/:id/reply', async (req, res, next) => {
  try {
    const ticket = await knex('support_tickets').where({ id: req.params.id }).first();
    if (!ticket) return res.redirect('/admin/support');
    if (req.body.body && req.body.body.trim()) {
      await knex('ticket_replies').insert({ ticket_id: ticket.id, author_id: req.session.user.id, author_name: req.session.user.name, is_staff: true, body: req.body.body.trim() });
      if (ticket.user_id) notifyUser(ticket.user_id, { type: 'message', title: 'Reply to your support ticket', body: ticket.subject, link: `/portal/support/${ticket.id}` });
    }
    const status = ['open', 'pending', 'resolved', 'closed'].includes(req.body.status) ? req.body.status : 'pending';
    await knex('support_tickets').where({ id: ticket.id }).update({ status, updated_at: knex.fn.now() });
    req.flash('success', 'Reply sent.');
    res.redirect(`/admin/support/${ticket.id}`);
  } catch (err) { next(err); }
});

router.post('/support/:id/delete', async (req, res, next) => {
  try {
    await knex('support_tickets').where({ id: req.params.id }).del();
    req.flash('success', 'Ticket deleted.');
    res.redirect('/admin/support');
  } catch (err) { next(err); }
});

// Close / reopen a ticket
router.post('/support/:id/close', async (req, res, next) => {
  try {
    await knex('support_tickets').where({ id: req.params.id }).update({ status: 'closed', updated_at: knex.fn.now() });
    req.flash('success', 'Ticket closed.');
    res.redirect(req.get('referer') || `/admin/support/${req.params.id}`);
  } catch (err) { next(err); }
});
router.post('/support/:id/reopen', async (req, res, next) => {
  try {
    await knex('support_tickets').where({ id: req.params.id }).update({ status: 'open', updated_at: knex.fn.now() });
    req.flash('success', 'Ticket reopened.');
    res.redirect(req.get('referer') || `/admin/support/${req.params.id}`);
  } catch (err) { next(err); }
});

// Edit a reply (author only)
router.post('/ticket-replies/:id', async (req, res, next) => {
  try {
    const reply = await knex('ticket_replies').where({ id: req.params.id }).first();
    if (!reply) return res.redirect('/admin/support');
    if (reply.author_id !== req.session.user.id) {
      req.flash('error', 'You can only edit your own messages.');
      return res.redirect(`/admin/support/${reply.ticket_id}`);
    }
    if (req.body.body && req.body.body.trim()) {
      await knex('ticket_replies').where({ id: reply.id }).update({ body: req.body.body.trim(), edited_at: knex.fn.now() });
      req.flash('success', 'Message updated.');
    }
    res.redirect(`/admin/support/${reply.ticket_id}`);
  } catch (err) { next(err); }
});

// ─── Diaspora sponsorship ────────────────────────────────────
router.post('/students/:id/sponsorship', async (req, res, next) => {
  try {
    const student = await knex('users').where({ id: req.params.id, role: 'student' }).first();
    if (!student) return res.redirect('/admin/students');
    const token = require('crypto').randomBytes(8).toString('hex');
    await knex('sponsorships').insert({
      token,
      student_id: student.id,
      target_amount: req.body.target_amount ? Number(req.body.target_amount) : null,
      message: req.body.message || null,
      active: true,
      created_by: req.session.user.id,
    });
    req.flash('success', 'Sponsorship link generated.');
    res.redirect(`/admin/students/${student.id}`);
  } catch (err) { next(err); }
});

router.post('/sponsorships/:id/toggle', async (req, res, next) => {
  try {
    const s = await knex('sponsorships').where({ id: req.params.id }).first();
    if (s) await knex('sponsorships').where({ id: s.id }).update({ active: !s.active, updated_at: knex.fn.now() });
    res.redirect(req.get('referer') || '/admin/students');
  } catch (err) { next(err); }
});

// ─── Research grants manager ─────────────────────────────────
router.get('/grants', async (req, res, next) => {
  try {
    const { status } = req.query;
    const q = knex('grant_applications');
    if (status) q.where('status', status);
    const grants = await q.orderBy('created_at', 'desc');
    res.render('admin/grants', { pageTitle: 'Research Grants | GDCU CRM', adminActive: 'grants', grants, filters: { status: status || '' } });
  } catch (err) { next(err); }
});

// Grant quick-view drawer
router.get('/grants/:id/drawer', async (req, res, next) => {
  try {
    const grant = await knex('grant_applications').where({ id: req.params.id }).first();
    if (!grant) return res.status(404).send('<div class="p-8 text-on-surface-variant">Grant not found.</div>');
    res.render('admin/_grant-drawer', { layout: false, grant });
  } catch (err) { next(err); }
});

router.get('/grants/:id', async (req, res, next) => {
  try {
    const grant = await knex('grant_applications').where({ id: req.params.id }).first();
    if (!grant) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/grant-detail', { pageTitle: `${grant.reference} | Grant`, adminActive: 'grants', grant });
  } catch (err) { next(err); }
});

router.post('/grants/:id/status', async (req, res, next) => {
  try {
    const status = ['submitted', 'under_review', 'awarded', 'declined'].includes(req.body.status) ? req.body.status : 'submitted';
    await knex('grant_applications').where({ id: req.params.id }).update({
      status, review_notes: req.body.review_notes || null, updated_at: knex.fn.now(),
    });
    req.flash('success', 'Grant updated.');
    res.redirect(`/admin/grants/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/grants/:id/delete', async (req, res, next) => {
  try {
    await knex('grant_applications').where({ id: req.params.id }).del();
    req.flash('success', 'Grant application deleted.');
    res.redirect('/admin/grants');
  } catch (err) { next(err); }
});

// ═══ GOVERNANCE & FINANCE BACK-OFFICE (admin only) ═══════════
const adminOnly = requireRole('admin');

// ─── Payroll ─────────────────────────────────────────────────
router.get('/payroll', adminOnly, async (req, res, next) => {
  try {
    const entries = await knex('payroll_entries')
      .join('users', 'payroll_entries.user_id', 'users.id')
      .select('payroll_entries.*', 'users.first_name', 'users.last_name', 'users.role')
      .orderBy('payroll_entries.created_at', 'desc');
    const staff = await knex('users').whereIn('role', ['faculty', 'staff', 'admin']).orderBy('first_name').select('id', 'first_name', 'last_name', 'role');
    const num = (r) => Number(r && r.s ? r.s : 0);
    const totals = {
      paid: num(await knex('payroll_entries').where({ status: 'paid' }).sum({ s: 'net' }).first()),
      pending: num(await knex('payroll_entries').where({ status: 'pending' }).sum({ s: 'net' }).first()),
    };
    const editing = req.query.edit ? await knex('payroll_entries').where({ id: req.query.edit }).first() : null;
    res.render('admin/payroll', { pageTitle: 'Payroll | GDCU CRM', adminActive: 'payroll', entries, staff, totals, editing });
  } catch (err) { next(err); }
});

router.post('/payroll', adminOnly, async (req, res, next) => {
  try {
    const gross = Number(req.body.gross || 0);
    const deductions = Number(req.body.deductions || 0);
    if (!req.body.user_id || !req.body.period || gross <= 0) {
      req.flash('error', 'Select a person, period and a gross amount.');
      return res.redirect('/admin/payroll');
    }
    await knex('payroll_entries').insert({
      user_id: req.body.user_id, period: req.body.period, gross, deductions,
      net: Math.max(0, gross - deductions), notes: req.body.notes || null, status: 'pending',
    });
    req.flash('success', 'Payroll entry created.');
    res.redirect('/admin/payroll');
  } catch (err) { next(err); }
});

router.post('/payroll/:id', adminOnly, async (req, res, next) => {
  try {
    const gross = Number(req.body.gross || 0);
    const deductions = Number(req.body.deductions || 0);
    await knex('payroll_entries').where({ id: req.params.id }).update({
      period: req.body.period, gross, deductions, net: Math.max(0, gross - deductions),
      notes: req.body.notes || null, updated_at: knex.fn.now(),
    });
    req.flash('success', 'Payroll entry updated.');
    res.redirect('/admin/payroll');
  } catch (err) { next(err); }
});

router.post('/payroll/:id/pay', adminOnly, async (req, res, next) => {
  try {
    await knex('payroll_entries').where({ id: req.params.id }).update({ status: 'paid', paid_at: knex.fn.now(), updated_at: knex.fn.now() });
    req.flash('success', 'Marked as paid.');
    res.redirect('/admin/payroll');
  } catch (err) { next(err); }
});

router.post('/payroll/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await knex('payroll_entries').where({ id: req.params.id }).del();
    req.flash('success', 'Payroll entry deleted.');
    res.redirect('/admin/payroll');
  } catch (err) { next(err); }
});

// ─── Budget & asset allocation ───────────────────────────────
router.get('/budget', adminOnly, async (req, res, next) => {
  try {
    const lines = await knex('budget_lines').orderBy('category');
    const totals = lines.reduce((acc, l) => {
      acc.allocated += Number(l.allocated); acc.spent += Number(l.spent); return acc;
    }, { allocated: 0, spent: 0 });
    totals.remaining = totals.allocated - totals.spent;
    res.render('admin/budget', { pageTitle: 'Budget | GDCU CRM', adminActive: 'budget', lines, totals });
  } catch (err) { next(err); }
});

router.post('/budget', adminOnly, async (req, res, next) => {
  try {
    if (!req.body.category) { req.flash('error', 'Category is required.'); return res.redirect('/admin/budget'); }
    await knex('budget_lines').insert({
      fiscal_year: req.body.fiscal_year || '2026',
      category: req.body.category,
      description: req.body.description || null,
      allocated: Number(req.body.allocated || 0),
      spent: Number(req.body.spent || 0),
      created_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
    req.flash('success', 'Budget line added.');
    res.redirect('/admin/budget');
  } catch (err) { next(err); }
});

router.post('/budget/:id', adminOnly, async (req, res, next) => {
  try {
    await knex('budget_lines').where({ id: req.params.id }).update({
      category: req.body.category,
      description: req.body.description || null,
      allocated: Number(req.body.allocated || 0),
      spent: Number(req.body.spent || 0),
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Budget line updated.');
    res.redirect('/admin/budget');
  } catch (err) { next(err); }
});

router.post('/budget/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await knex('budget_lines').where({ id: req.params.id }).del();
    req.flash('success', 'Budget line deleted.');
    res.redirect('/admin/budget');
  } catch (err) { next(err); }
});

// ─── Governance & compliance ─────────────────────────────────
router.get('/governance', adminOnly, async (req, res, next) => {
  try {
    const documents = await knex('governance_documents').orderBy(['category', 'title']);
    const board = await knex('board_members').orderBy('sort_order');
    const editDoc = req.query.editDoc ? await knex('governance_documents').where({ id: req.query.editDoc }).first() : null;
    const editMember = req.query.editMember ? await knex('board_members').where({ id: req.query.editMember }).first() : null;
    res.render('admin/governance', { pageTitle: 'Governance | GDCU CRM', adminActive: 'governance', documents, board, editDoc, editMember });
  } catch (err) { next(err); }
});

router.post('/governance/documents', adminOnly, async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.url) { req.flash('error', 'Title and URL are required.'); return res.redirect('/admin/governance'); }
    await knex('governance_documents').insert({
      title: req.body.title, category: req.body.category || 'Policy', doc_type: req.body.doc_type || 'Link',
      url: req.body.url, review_date: req.body.review_date || null, published: true,
      created_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
    req.flash('success', 'Document added.');
    res.redirect('/admin/governance');
  } catch (err) { next(err); }
});

router.post('/governance/documents/:id', adminOnly, async (req, res, next) => {
  try {
    await knex('governance_documents').where({ id: req.params.id }).update({
      title: req.body.title, category: req.body.category || 'Policy', doc_type: req.body.doc_type || 'Link',
      url: req.body.url, review_date: req.body.review_date || null, updated_at: knex.fn.now(),
    });
    req.flash('success', 'Document updated.');
    res.redirect('/admin/governance');
  } catch (err) { next(err); }
});

router.post('/governance/documents/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await knex('governance_documents').where({ id: req.params.id }).del();
    req.flash('success', 'Document removed.');
    res.redirect('/admin/governance');
  } catch (err) { next(err); }
});

router.post('/governance/board', adminOnly, async (req, res, next) => {
  try {
    if (!req.body.name) { req.flash('error', 'Name is required.'); return res.redirect('/admin/governance'); }
    await knex('board_members').insert({
      name: req.body.name, role: req.body.role || null, bio: req.body.bio || null,
      sort_order: req.body.sort_order ? Number(req.body.sort_order) : 0,
      created_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
    req.flash('success', 'Board member added.');
    res.redirect('/admin/governance');
  } catch (err) { next(err); }
});

router.post('/governance/board/:id', adminOnly, async (req, res, next) => {
  try {
    await knex('board_members').where({ id: req.params.id }).update({
      name: req.body.name, role: req.body.role || null, bio: req.body.bio || null,
      sort_order: req.body.sort_order ? Number(req.body.sort_order) : 0, updated_at: knex.fn.now(),
    });
    req.flash('success', 'Board member updated.');
    res.redirect('/admin/governance');
  } catch (err) { next(err); }
});

router.post('/governance/board/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await knex('board_members').where({ id: req.params.id }).del();
    req.flash('success', 'Board member removed.');
    res.redirect('/admin/governance');
  } catch (err) { next(err); }
});

// ─── Generic deletes for CRM sub-records ─────────────────────
router.post('/notes/:id/edit', async (req, res, next) => {
  try {
    if (req.body.body && req.body.body.trim()) {
      await knex('crm_notes').where({ id: req.params.id }).update({ body: req.body.body.trim() });
      req.flash('success', 'Note updated.');
    }
    res.redirect(req.get('referer') || '/admin');
  } catch (err) { next(err); }
});

router.post('/notes/:id/delete', async (req, res, next) => {
  try {
    await knex('crm_notes').where({ id: req.params.id }).del();
    req.flash('success', 'Note deleted.');
    res.redirect(req.get('referer') || '/admin');
  } catch (err) { next(err); }
});

router.post('/tasks/:id/delete', async (req, res, next) => {
  try {
    await knex('crm_tasks').where({ id: req.params.id }).del();
    req.flash('success', 'Task deleted.');
    res.redirect(req.get('referer') || '/admin');
  } catch (err) { next(err); }
});

router.post('/interviews/:id/delete', async (req, res, next) => {
  try {
    const iv = await knex('interviews').where({ id: req.params.id }).first();
    await knex('interviews').where({ id: req.params.id }).del();
    req.flash('success', 'Interview removed.');
    res.redirect(req.get('referer') || (iv ? `/admin/applications/${iv.application_id}` : '/admin/interviews'));
  } catch (err) { next(err); }
});

router.post('/messages/:id/delete', async (req, res, next) => {
  try {
    await knex('contact_messages').where({ id: req.params.id }).del();
    req.flash('success', 'Message deleted.');
    res.redirect('/admin/messages');
  } catch (err) { next(err); }
});

// ─── Invoice preview / send / edit / void / delete ───────────
router.get('/invoices/:id/preview', async (req, res, next) => {
  try {
    const invoice = await knex('invoices').where({ id: req.params.id }).first();
    if (!invoice) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const student = await knex('users').where({ id: invoice.user_id }).first();
    const program = invoice.program_id ? await knex('programs').where({ id: invoice.program_id }).first() : null;
    res.render('admin/invoice-preview', {
      pageTitle: `Invoice ${invoice.reference} | GDCU CRM`,
      adminActive: 'finance',
      invoice, student, program,
    });
  } catch (err) { next(err); }
});

router.post('/invoices/:id/send', async (req, res, next) => {
  try {
    const invoice = await knex('invoices').where({ id: req.params.id }).first();
    if (!invoice) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const student = await knex('users').where({ id: invoice.user_id }).first();
    if (!student) {
      req.flash('error', 'This invoice has no student on file.');
      return res.redirect(`/admin/invoices/${invoice.id}/preview`);
    }

    if (invoice.status === 'draft') {
      await knex('invoices').where({ id: invoice.id }).update({ status: 'sent', updated_at: knex.fn.now() });
    }

    notifyUser(student.id, { type: 'payment', title: 'New invoice', body: `${invoice.description} — please review your billing.`, link: '/portal/billing' });
    email({
      to: student.email, toName: `${student.first_name} ${student.last_name}`,
      subject: `Invoice ${invoice.reference} from GDCU`,
      heading: 'You have a new invoice',
      bodyHtml: `<p>Dear ${student.first_name},</p><p>An invoice has been raised on your GDCU account:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 0;color:#74777e">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace">${invoice.reference}</td></tr>
          <tr><td style="padding:6px 0;color:#74777e">Description</td><td style="padding:6px 0;text-align:right">${invoice.description}</td></tr>
          ${invoice.due_date ? `<tr><td style="padding:6px 0;color:#74777e">Due date</td><td style="padding:6px 0;text-align:right">${formatDateTime(invoice.due_date)}</td></tr>` : ''}
          <tr><td style="padding:10px 0;font-weight:bold;border-top:1px solid #e5e2dc">Amount due</td><td style="padding:10px 0;text-align:right;font-weight:bold;border-top:1px solid #e5e2dc">${invoice.currency} ${Number(invoice.amount).toFixed(2)}</td></tr>
        </table>
        <p><a href="${process.env.APP_URL || ''}/portal/billing" style="background:#071d3a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Pay Now</a></p>`,
      relatedType: 'invoice', relatedId: invoice.id,
    });
    logActivity('student', student.id, req.session.user, 'Invoice sent', invoice.reference);

    req.flash('success', `Invoice ${invoice.reference} sent to ${student.email}.`);
    res.redirect(req.get('referer') && req.get('referer').includes('/preview') ? `/admin/invoices/${invoice.id}/preview` : '/admin/finance');
  } catch (err) { next(err); }
});

router.get('/invoices/:id/edit', async (req, res, next) => {
  try {
    const invoice = await knex('invoices').where({ id: req.params.id }).first();
    if (!invoice) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const student = await knex('users').where({ id: invoice.user_id }).first();
    res.render('admin/invoice-edit', { pageTitle: 'Edit Invoice | GDCU CRM', adminActive: 'finance', invoice, student });
  } catch (err) { next(err); }
});

router.post('/invoices/:id', async (req, res, next) => {
  try {
    await knex('invoices').where({ id: req.params.id }).update({
      description: req.body.description,
      amount: Number(req.body.amount),
      due_date: req.body.due_date || null,
      status: ['draft', 'sent', 'paid', 'overdue', 'void'].includes(req.body.status) ? req.body.status : 'sent',
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Invoice updated.');
    res.redirect('/admin/finance');
  } catch (err) { next(err); }
});

router.post('/invoices/:id/void', async (req, res, next) => {
  try {
    await knex('invoices').where({ id: req.params.id }).update({ status: 'void', updated_at: knex.fn.now() });
    req.flash('success', 'Invoice voided.');
    res.redirect(req.get('referer') || '/admin/finance');
  } catch (err) { next(err); }
});

router.post('/invoices/:id/delete', async (req, res, next) => {
  try {
    await knex('invoices').where({ id: req.params.id }).del();
    req.flash('success', 'Invoice deleted.');
    res.redirect(req.get('referer') || '/admin/finance');
  } catch (err) { next(err); }
});

// Upload a file (image or video) and return a public URL for use in LMS content.
router.post('/upload', (req, res) => {
  upload.any()(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    const uploadedFile = req.files && req.files[0];
    if (!uploadedFile) return res.status(400).json({ error: 'Please choose a file to upload.' });
    const isVideo = /^video\//.test(uploadedFile.mimetype);
    res.json({ url: `/uploads/${uploadedFile.filename}`, type: isVideo ? 'video' : 'image' });
  });
});

// ─── Open Days ───────────────────────────────────────────────
router.get('/open-days', async (req, res, next) => {
  try {
    const openDays = await knex('open_days').orderBy('starts_at', 'desc');
    const counts = await knex('open_day_registrations').select('open_day_id').count({ c: '*' }).groupBy('open_day_id');
    const countMap = {};
    counts.forEach((r) => { countMap[r.open_day_id] = Number(r.c); });
    openDays.forEach((o) => { o.registrations = countMap[o.id] || 0; });
    res.render('admin/open-days', { pageTitle: 'Open Days | GDCU CRM', adminActive: 'opendays', openDays });
  } catch (err) { next(err); }
});

router.get('/open-days/new', (req, res) => {
  res.render('admin/open-day-edit', { pageTitle: 'New Open Day | GDCU CRM', adminActive: 'opendays', openDay: { is_online: true, published: false }, isNew: true });
});

router.post('/open-days', async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.starts_at) { req.flash('error', 'Title and date/time are required.'); return res.redirect('/admin/open-days/new'); }
    let slug = slugify(req.body.title);
    const exists = await knex('open_days').where({ slug }).first();
    if (exists) slug = `${slug}-${Date.now().toString().slice(-5)}`;
    const [idRaw] = await knex('open_days').insert({
      slug, title: req.body.title, description: req.body.description || null,
      starts_at: req.body.starts_at, ends_at: req.body.ends_at || null,
      location: req.body.location || null, is_online: req.body.is_online === 'on',
      join_url: req.body.join_url || null, capacity: req.body.capacity ? Number(req.body.capacity) : null,
      image_url: req.body.image_url || null,
      published: req.body.published === 'on',
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Open day created.');
    res.redirect(`/admin/open-days/${id}`);
  } catch (err) { next(err); }
});

router.get('/open-days/:id/edit', async (req, res, next) => {
  try {
    const openDay = await knex('open_days').where({ id: req.params.id }).first();
    if (!openDay) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/open-day-edit', { pageTitle: 'Edit Open Day | GDCU CRM', adminActive: 'opendays', openDay, isNew: false });
  } catch (err) { next(err); }
});

router.post('/open-days/:id/edit', async (req, res, next) => {
  try {
    await knex('open_days').where({ id: req.params.id }).update({
      title: req.body.title, description: req.body.description || null,
      starts_at: req.body.starts_at, ends_at: req.body.ends_at || null,
      location: req.body.location || null, is_online: req.body.is_online === 'on',
      join_url: req.body.join_url || null, capacity: req.body.capacity ? Number(req.body.capacity) : null,
      image_url: req.body.image_url || null,
      published: req.body.published === 'on', updated_at: knex.fn.now(),
    });
    req.flash('success', 'Open day updated.');
    res.redirect(`/admin/open-days/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/open-days/:id/delete', async (req, res, next) => {
  try {
    await knex('open_days').where({ id: req.params.id }).del();
    req.flash('success', 'Open day deleted.');
    res.redirect('/admin/open-days');
  } catch (err) { next(err); }
});

router.get('/open-days/:id', async (req, res, next) => {
  try {
    const openDay = await knex('open_days').where({ id: req.params.id }).first();
    if (!openDay) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const registrations = await knex('open_day_registrations')
      .leftJoin('leads', 'open_day_registrations.lead_id', 'leads.id')
      .where('open_day_registrations.open_day_id', openDay.id)
      .select('open_day_registrations.*', 'leads.status as lead_status', 'leads.converted_application_id')
      .orderBy('open_day_registrations.created_at', 'desc');
    res.render('admin/open-day-detail', { pageTitle: `${openDay.title} | Open Day`, adminActive: 'opendays', openDay, registrations });
  } catch (err) { next(err); }
});

// Mark a registrant as attended / not attended
router.post('/open-days/:id/registrations/:rid/attended', async (req, res, next) => {
  try {
    const reg = await knex('open_day_registrations').where({ id: req.params.rid }).first();
    if (reg) await knex('open_day_registrations').where({ id: reg.id }).update({ attended: !reg.attended });
    res.redirect(`/admin/open-days/${req.params.id}`);
  } catch (err) { next(err); }
});

// Email all registrants (e.g. a reminder)
router.post('/open-days/:id/email', async (req, res, next) => {
  try {
    const openDay = await knex('open_days').where({ id: req.params.id }).first();
    if (!openDay) return res.redirect('/admin/open-days');
    if (!req.body.subject || !req.body.body) { req.flash('error', 'Subject and message are required.'); return res.redirect(`/admin/open-days/${openDay.id}`); }
    const regs = await knex('open_day_registrations').where({ open_day_id: openDay.id });
    for (const r of regs) {
      email({
        to: r.email, toName: `${r.first_name} ${r.last_name || ''}`.trim(),
        subject: req.body.subject, heading: openDay.title,
        bodyHtml: `<p>Dear ${r.first_name},</p>${String(req.body.body).split('\n').map((l) => `<p>${l}</p>`).join('')}`,
        relatedType: 'open_day', relatedId: openDay.id,
      });
    }
    req.flash('success', `Email queued to ${regs.length} registrant(s).`);
    res.redirect(`/admin/open-days/${openDay.id}`);
  } catch (err) { next(err); }
});

// ─── Academic calendar / schedule ────────────────────────────
router.get('/schedule', async (req, res, next) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const upcoming = await knex('calendar_events').where('starts_at', '>=', now).orderBy('starts_at');
    const past = await knex('calendar_events').where('starts_at', '<', now).orderBy('starts_at', 'desc').limit(20);
    res.render('admin/schedule', {
      pageTitle: 'Academic Calendar | GDCU CRM', adminActive: 'schedule',
      upcoming, past, cats: calendar.CATEGORIES,
    });
  } catch (err) { next(err); }
});

router.get('/schedule/new', (req, res) => {
  res.render('admin/schedule-edit', { pageTitle: 'New Calendar Entry | GDCU', adminActive: 'schedule', ev: { all_day: true, published: true, category: 'event', audience: 'all' }, cats: calendar.CATEGORIES, audiences: calendar.AUDIENCES, isNew: true });
});

router.post('/schedule', async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.starts_at) { req.flash('error', 'Title and start date are required.'); return res.redirect('/admin/schedule/new'); }
    const [idRaw] = await knex('calendar_events').insert({
      title: req.body.title, description: req.body.description || null,
      category: req.body.category || 'event', audience: req.body.audience || 'all',
      starts_at: req.body.starts_at.replace('T', ' '), ends_at: req.body.ends_at ? req.body.ends_at.replace('T', ' ') : null,
      all_day: req.body.all_day === 'on', location: req.body.location || null,
      published: req.body.published === 'on',
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Calendar entry created.');
    res.redirect('/admin/schedule');
  } catch (err) { next(err); }
});

router.get('/schedule/:id/edit', async (req, res, next) => {
  try {
    const ev = await knex('calendar_events').where({ id: req.params.id }).first();
    if (!ev) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    res.render('admin/schedule-edit', { pageTitle: 'Edit Calendar Entry | GDCU', adminActive: 'schedule', ev, cats: calendar.CATEGORIES, audiences: calendar.AUDIENCES, isNew: false });
  } catch (err) { next(err); }
});

router.post('/schedule/:id/edit', async (req, res, next) => {
  try {
    await knex('calendar_events').where({ id: req.params.id }).update({
      title: req.body.title, description: req.body.description || null,
      category: req.body.category || 'event', audience: req.body.audience || 'all',
      starts_at: req.body.starts_at.replace('T', ' '), ends_at: req.body.ends_at ? req.body.ends_at.replace('T', ' ') : null,
      all_day: req.body.all_day === 'on', location: req.body.location || null,
      published: req.body.published === 'on', updated_at: knex.fn.now(),
    });
    req.flash('success', 'Calendar entry updated.');
    res.redirect('/admin/schedule');
  } catch (err) { next(err); }
});

router.post('/schedule/:id/delete', async (req, res, next) => {
  try {
    await knex('calendar_events').where({ id: req.params.id }).del();
    req.flash('success', 'Calendar entry deleted.');
    res.redirect('/admin/schedule');
  } catch (err) { next(err); }
});

// ─── Attendance / engagement ─────────────────────────────────
router.get('/attendance', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = req.query.stage || ''; // '', '0','1','2','3'
    const students = await knex('users').where({ role: 'student', status: 'active' }).orderBy('first_name');
    const now = Date.now();
    // Most recent login per student for "last seen" (login_events is richer than last_login_at alone).
    let rows = students.map((s) => {
      const eng = attendance.engagementFor(s, now);
      return { id: s.id, name: `${s.first_name} ${s.last_name || ''}`.trim(), email: s.email, last_login_at: s.last_login_at, ...eng };
    });
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || (r.email || '').toLowerCase().includes(q.toLowerCase()));
    if (filter !== '') rows = rows.filter((r) => String(r.stage) === String(filter));
    rows.sort((a, b) => b.stage - a.stage || b.days - a.days);

    const counts = { total: students.length, active: 0, 1: 0, 2: 0, 3: 0 };
    students.forEach((s) => { const e = attendance.engagementFor(s, now); if (!e.stage) counts.active += 1; else counts[e.stage] += 1; });
    // recent warnings sent
    const recentWarnings = await knex('attendance_warnings')
      .join('users', 'attendance_warnings.user_id', 'users.id')
      .select('attendance_warnings.*', 'users.first_name', 'users.last_name')
      .orderBy('attendance_warnings.sent_at', 'desc').limit(10);

    res.render('admin/attendance', {
      pageTitle: 'Attendance & Engagement | GDCU CRM', adminActive: 'attendance',
      rows, counts, recentWarnings, filters: { q, stage: filter }, stages: attendance.STAGES,
    });
  } catch (err) { next(err); }
});

router.post('/attendance/run', async (req, res, next) => {
  try {
    const summary = await attendance.runSweep();
    req.flash('success', `Attendance sweep complete — ${summary.sent} warning email(s) sent (week1: ${summary.byStage[1]}, week2: ${summary.byStage[2]}, final: ${summary.byStage[3]}).`);
    res.redirect('/admin/attendance');
  } catch (err) { next(err); }
});

// ─── Calendar connection (Google scaffold) ───────────────────
router.get('/calendar', async (req, res, next) => {
  try {
    const connection = await googleCalendar.getConnection(req.session.user.id);
    res.render('admin/calendar', {
      pageTitle: 'Calendar Sync | GDCU CRM', adminActive: 'calendar',
      configured: googleCalendar.isConfigured, connection,
    });
  } catch (err) { next(err); }
});

router.get('/calendar/connect', (req, res) => {
  if (!googleCalendar.isConfigured) {
    req.flash('error', 'Google Calendar is not configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to enable it.');
    return res.redirect('/admin/calendar');
  }
  const url = googleCalendar.getAuthUrl(String(req.session.user.id));
  res.redirect(url);
});

router.get('/calendar/callback', async (req, res) => {
  try {
    await googleCalendar.handleCallback(req.session.user.id, req.query.code);
    req.flash('success', 'Calendar connected.');
  } catch (err) {
    req.flash('error', err.message || 'Could not connect calendar.');
  }
  res.redirect('/admin/calendar');
});

router.post('/calendar/disconnect', async (req, res, next) => {
  try {
    await googleCalendar.disconnect(req.session.user.id);
    req.flash('success', 'Calendar disconnected.');
    res.redirect('/admin/calendar');
  } catch (err) { next(err); }
});

// ─── Spiritual Formation: groups ─────────────────────────────
router.get('/formation', async (req, res, next) => {
  try {
    const groups = await knex('formation_groups')
      .leftJoin('users', 'formation_groups.facilitator_id', 'users.id')
      .select('formation_groups.*', 'users.first_name as fac_first', 'users.last_name as fac_last')
      .orderBy('formation_groups.active', 'desc').orderBy('formation_groups.name');
    const memberCounts = await knex('formation_members').select('group_id').count({ c: '*' }).groupBy('group_id');
    const cmap = {};
    memberCounts.forEach((r) => { cmap[r.group_id] = Number(r.c); });
    groups.forEach((g) => { g.members = cmap[g.id] || 0; });
    const totalStudents = Number((await knex('users').where({ role: 'student' }).count({ c: '*' }).first()).c);
    const assigned = Number((await knex('formation_members').countDistinct({ c: 'student_id' }).first()).c);
    res.render('admin/formation', { pageTitle: 'Formation Groups | GDCU', adminActive: 'formation', groups, totalStudents, assigned, unassigned: totalStudents - assigned });
  } catch (err) { next(err); }
});

router.get('/formation/new', async (req, res, next) => {
  try {
    const facilitators = await knex('users').whereIn('role', ['faculty', 'staff', 'admin']).select('id', 'first_name', 'last_name');
    res.render('admin/formation-edit', { pageTitle: 'New Formation Group | GDCU', adminActive: 'formation', group: { meeting_day: 'Tuesday', active: true }, facilitators, isNew: true });
  } catch (err) { next(err); }
});

router.post('/formation', async (req, res, next) => {
  try {
    if (!req.body.name) { req.flash('error', 'Group name is required.'); return res.redirect('/admin/formation/new'); }
    const [idRaw] = await knex('formation_groups').insert({
      name: req.body.name, description: req.body.description || null,
      facilitator_id: req.body.facilitator_id || null,
      meeting_day: req.body.meeting_day || 'Tuesday', meeting_time: req.body.meeting_time || null,
      capacity: req.body.capacity ? Number(req.body.capacity) : null,
      active: req.body.active === 'on',
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Formation group created.');
    res.redirect(`/admin/formation/${id}`);
  } catch (err) { next(err); }
});

router.get('/formation/:id/edit', async (req, res, next) => {
  try {
    const group = await knex('formation_groups').where({ id: req.params.id }).first();
    if (!group) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const facilitators = await knex('users').whereIn('role', ['faculty', 'staff', 'admin']).select('id', 'first_name', 'last_name');
    res.render('admin/formation-edit', { pageTitle: 'Edit Formation Group | GDCU', adminActive: 'formation', group, facilitators, isNew: false });
  } catch (err) { next(err); }
});

router.post('/formation/:id/edit', async (req, res, next) => {
  try {
    await knex('formation_groups').where({ id: req.params.id }).update({
      name: req.body.name, description: req.body.description || null,
      facilitator_id: req.body.facilitator_id || null,
      meeting_day: req.body.meeting_day || 'Tuesday', meeting_time: req.body.meeting_time || null,
      capacity: req.body.capacity ? Number(req.body.capacity) : null,
      active: req.body.active === 'on', updated_at: knex.fn.now(),
    });
    req.flash('success', 'Formation group updated.');
    res.redirect(`/admin/formation/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/formation/:id/delete', async (req, res, next) => {
  try {
    await knex('formation_groups').where({ id: req.params.id }).del();
    req.flash('success', 'Formation group deleted.');
    res.redirect('/admin/formation');
  } catch (err) { next(err); }
});

// Auto-assign: evenly distribute unassigned students across active groups (balancing sizes).
router.post('/formation/auto-assign', async (req, res, next) => {
  try {
    const groups = await knex('formation_groups').where({ active: true });
    if (!groups.length) { req.flash('error', 'Create at least one active group first.'); return res.redirect('/admin/formation'); }
    const assignedIds = await knex('formation_members').pluck('student_id');
    const students = await knex('users').where({ role: 'student' }).whereNotIn('id', assignedIds.length ? assignedIds : [0]).select('id');
    if (!students.length) { req.flash('info', 'Every student is already in a group.'); return res.redirect('/admin/formation'); }

    // Track current sizes so we always fill the smallest group next.
    const sizes = {};
    const counts = await knex('formation_members').select('group_id').count({ c: '*' }).groupBy('group_id');
    groups.forEach((g) => { sizes[g.id] = 0; });
    counts.forEach((r) => { if (sizes[r.group_id] !== undefined) sizes[r.group_id] = Number(r.c); });

    let placed = 0;
    for (const s of students) {
      // pick the active group with the fewest members that still has capacity
      const candidates = groups
        .filter((g) => !g.capacity || sizes[g.id] < g.capacity)
        .sort((a, b) => sizes[a.id] - sizes[b.id]);
      if (!candidates.length) break; // all full
      const target = candidates[0];
      await knex('formation_members').insert({ group_id: target.id, student_id: s.id });
      sizes[target.id] += 1;
      placed += 1;
    }
    req.flash('success', `Auto-assigned ${placed} student(s) into groups.`);
    res.redirect('/admin/formation');
  } catch (err) { next(err); }
});

router.get('/formation/:id', async (req, res, next) => {
  try {
    const group = await knex('formation_groups')
      .leftJoin('users', 'formation_groups.facilitator_id', 'users.id')
      .select('formation_groups.*', 'users.first_name as fac_first', 'users.last_name as fac_last')
      .where('formation_groups.id', req.params.id).first();
    if (!group) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    const members = await knex('formation_members')
      .join('users', 'formation_members.student_id', 'users.id')
      .where('formation_members.group_id', group.id)
      .select('formation_members.id as member_id', 'users.id as student_id', 'users.first_name', 'users.last_name', 'users.email')
      .orderBy('users.first_name');
    const inGroup = members.map((m) => m.student_id);
    const available = await knex('users').where({ role: 'student' }).whereNotIn('id', inGroup.length ? inGroup : [0]).select('id', 'first_name', 'last_name').orderBy('first_name');
    res.render('admin/formation-detail', { pageTitle: `${group.name} | Formation`, adminActive: 'formation', group, members, available });
  } catch (err) { next(err); }
});

router.post('/formation/:id/add', async (req, res, next) => {
  try {
    if (req.body.student_id) {
      await knex('formation_members').insert({ group_id: req.params.id, student_id: req.body.student_id }).onConflict(['group_id', 'student_id']).ignore();
    }
    res.redirect(`/admin/formation/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/formation/members/:memberId/remove', async (req, res, next) => {
  try {
    const m = await knex('formation_members').where({ id: req.params.memberId }).first();
    await knex('formation_members').where({ id: req.params.memberId }).del();
    req.flash('success', 'Student removed from group.');
    res.redirect(m ? `/admin/formation/${m.group_id}` : '/admin/formation');
  } catch (err) { next(err); }
});

// ─── Spiritual Formation: chapel sessions ────────────────────
router.get('/chapel', async (req, res, next) => {
  try {
    const sessions = await knex('chapel_sessions').orderBy('starts_at', 'desc');
    const attCounts = await knex('chapel_attendance').where({ status: 'present' }).select('session_id').count({ c: '*' }).groupBy('session_id');
    const amap = {};
    attCounts.forEach((r) => { amap[r.session_id] = Number(r.c); });
    sessions.forEach((s) => { s.present = amap[s.id] || 0; });
    // Suggest the next Tuesday for convenience
    const d = new Date();
    d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
    const nextTuesday = d.toISOString().slice(0, 10);
    res.render('admin/chapel', { pageTitle: 'Chapel | GDCU', adminActive: 'chapel', sessions, nextTuesday });
  } catch (err) { next(err); }
});

router.post('/chapel', async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.starts_at) { req.flash('error', 'Title and date/time are required.'); return res.redirect('/admin/chapel'); }
    const [idRaw] = await knex('chapel_sessions').insert({
      title: req.body.title, theme: req.body.theme || null, speaker: req.body.speaker || null,
      scripture: req.body.scripture || null, starts_at: req.body.starts_at,
      join_url: req.body.join_url || null, location: req.body.location || null,
      status: 'scheduled',
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Chapel session scheduled.');
    res.redirect(`/admin/chapel/${id}`);
  } catch (err) { next(err); }
});

router.post('/chapel/:id/delete', async (req, res, next) => {
  try {
    await knex('chapel_sessions').where({ id: req.params.id }).del();
    req.flash('success', 'Chapel session deleted.');
    res.redirect('/admin/chapel');
  } catch (err) { next(err); }
});

router.post('/chapel/:id/status', async (req, res, next) => {
  try {
    const status = ['scheduled', 'completed', 'cancelled'].includes(req.body.status) ? req.body.status : 'scheduled';
    await knex('chapel_sessions').where({ id: req.params.id }).update({ status, updated_at: knex.fn.now() });
    res.redirect(`/admin/chapel/${req.params.id}`);
  } catch (err) { next(err); }
});

router.get('/chapel/:id', async (req, res, next) => {
  try {
    const session = await knex('chapel_sessions').where({ id: req.params.id }).first();
    if (!session) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    // Students grouped by formation group, with attendance status for this session.
    const students = await knex('users').where({ role: 'student' }).select('id', 'first_name', 'last_name').orderBy('first_name');
    const memberRows = await knex('formation_members')
      .join('formation_groups', 'formation_members.group_id', 'formation_groups.id')
      .select('formation_members.student_id', 'formation_groups.name as group_name');
    const groupOf = {};
    memberRows.forEach((r) => { groupOf[r.student_id] = r.group_name; });
    const attRows = await knex('chapel_attendance').where({ session_id: session.id });
    const attOf = {};
    attRows.forEach((r) => { attOf[r.student_id] = r.status; });
    students.forEach((s) => { s.group_name = groupOf[s.id] || 'Unassigned'; s.attendance = attOf[s.id] || null; });
    const presentCount = attRows.filter((r) => r.status === 'present').length;
    res.render('admin/chapel-detail', { pageTitle: `${session.title} | Chapel`, adminActive: 'chapel', session, students, presentCount });
  } catch (err) { next(err); }
});

router.post('/chapel/:id/attendance', async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const status = ['present', 'excused', 'absent'].includes(req.body.status) ? req.body.status : 'present';
    const studentId = Number(req.body.student_id);
    if (studentId) {
      const existing = await knex('chapel_attendance').where({ session_id: sessionId, student_id: studentId }).first();
      if (existing) {
        // Toggle off if the same status is clicked again, otherwise update.
        if (existing.status === status) await knex('chapel_attendance').where({ id: existing.id }).del();
        else await knex('chapel_attendance').where({ id: existing.id }).update({ status });
      } else {
        await knex('chapel_attendance').insert({ session_id: sessionId, student_id: studentId, status });
      }
    }
    res.redirect(`/admin/chapel/${sessionId}`);
  } catch (err) { next(err); }
});

// ─── Quizzes ─────────────────────────────────────────────────
router.get('/quizzes', async (req, res, next) => {
  try {
    // Final exams live on their own page; this overview is module/course quizzes.
    const quizzes = await knex('quizzes')
      .where('is_final_exam', false)
      .leftJoin('courses', 'quizzes.course_id', 'courses.id')
      .select('quizzes.*', 'courses.title as course_title')
      .orderBy('quizzes.sort_order');
    const courses = await knex('courses').where({ published: true }).orderBy('title');
    res.render('admin/quizzes', {
      pageTitle: 'Manage Quizzes | GDCU',
      adminActive: 'quizzes',
      quizzes,
      courses,
    });
  } catch (err) { next(err); }
});

router.get('/quizzes/create', async (req, res, next) => {
  try {
    const courses = await knex('courses').orderBy('title');
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    // Allow the course builder to prefill course + module and return afterwards.
    const lockedCourseId = req.query.course_id ? Number(req.query.course_id) : null;
    const moduleId = req.query.module_id ? Number(req.query.module_id) : null;
    const isFinal = req.query.final === '1';
    const examScope = isFinal ? (['course', 'year', 'programme'].includes(req.query.scope) ? req.query.scope : 'course') : 'course';
    const returnTo = req.query.return || '';
    // When launched from a specific Lesson (block), scope the quiz to that lesson.
    const afterBlock = req.query.after_block ? Number(req.query.after_block) : null;
    const blockTitle = req.query.block_title || '';
    res.render('admin/quiz-form', {
      pageTitle: isFinal ? 'Create Final Exam | GDCU' : 'Create Quiz | GDCU',
      adminActive: 'quizzes',
      quiz: { pass_mark: isFinal ? 70 : 60, time_limit_min: isFinal ? 60 : null, sort_order: afterBlock || 0, course_id: lockedCourseId, module_id: isFinal ? null : moduleId, is_final_exam: isFinal, exam_scope: examScope, program_id: req.query.program_id || null, after_block: afterBlock, covers_blocks: afterBlock ? `${afterBlock}-${afterBlock}` : null, title: blockTitle ? `Quiz: ${blockTitle}` : '' },
      courses,
      programs,
      questions: [],
      isNew: true,
      lockedCourseId,
      moduleId: isFinal ? null : moduleId,
      isFinal,
      examScope,
      returnTo,
      afterBlock,
      blockTitle,
    });
  } catch (err) { next(err); }
});

// Resolve scope-dependent fields for a final exam / quiz from the form body.
function examScopeFields(body) {
  const isFinal = body.is_final_exam === '1';
  const scope = isFinal ? (body.exam_scope || 'course') : 'course';
  return {
    is_final_exam: isFinal,
    exam_scope: scope,
    // course exams (and module quizzes) keep a course; programme/year exams don't.
    course_id: scope === 'course' ? (body.course_id || null) : null,
    module_id: isFinal ? null : (body.module_id || null),
    program_id: (scope === 'year' || scope === 'programme') ? (body.program_id || null) : null,
    exam_year: scope === 'year' ? (body.exam_year || null) : null,
  };
}

router.post('/quizzes', async (req, res, next) => {
  try {
    const scoped = examScopeFields(req.body);
    const [quizId] = await knex('quizzes').insert({
      ...scoped,
      title: req.body.title,
      description: req.body.description || null,
      pass_mark: req.body.pass_mark || 60,
      time_limit_min: req.body.time_limit_min || null,
      sort_order: req.body.sort_order || 0,
      after_block: req.body.after_block || null,
      covers_blocks: req.body.covers_blocks || null,
      published: req.body.published === '1',
      available_from: req.body.available_from || null,
    });
    
    // Create questions if provided
    if (req.body.questions) {
      const questions = JSON.parse(req.body.questions);
      const newQuizId = Array.isArray(quizId) ? quizId[0] : quizId;
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const inserted = await knex('quiz_questions').insert({
          quiz_id: newQuizId,
          prompt: q.prompt,
          type: q.type || 'single',
          explanation: q.explanation || null,
          sort_order: qi + 1,
        });
        const questionId = Array.isArray(inserted) ? inserted[0] : inserted;

        if (q.options) {
          for (let oi = 0; oi < q.options.length; oi++) {
            const o = q.options[oi];
            await knex('quiz_options').insert({
              question_id: questionId,
              text: o.text,
              is_correct: o.is_correct || false,
              sort_order: oi + 1,
            });
          }
        }
      }
    }
    
    req.flash('success', 'Quiz created successfully');
    // Return to the course builder when launched from there.
    if (req.body.return_to && req.body.return_to.startsWith('/admin/')) return res.redirect(req.body.return_to);
    res.redirect('/admin/quizzes');
  } catch (err) { next(err); }
});

router.get('/quizzes/:id/edit', async (req, res, next) => {
  try {
    const quiz = await knex('quizzes').where({ id: req.params.id }).first();
    if (!quiz) return res.status(404).render('errors/404', { pageTitle: 'Quiz not found', layout: 'layouts/admin' });
    
    const questions = await knex('quiz_questions')
      .where({ quiz_id: quiz.id })
      .orderBy('sort_order');
    
    for (const q of questions) {
      q.options = await knex('quiz_options')
        .where({ question_id: q.id })
        .orderBy('sort_order');
    }
    
    const courses = await knex('courses').orderBy('title');
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    const returnTo = req.query.return || '';
    res.render('admin/quiz-form', {
      pageTitle: quiz.is_final_exam ? 'Edit Final Exam | GDCU' : 'Edit Quiz | GDCU',
      adminActive: 'quizzes',
      quiz,
      courses,
      programs,
      questions,
      isNew: false,
      lockedCourseId: (returnTo && returnTo.includes('/courses/')) ? quiz.course_id : null,
      moduleId: quiz.module_id,
      isFinal: !!quiz.is_final_exam,
      examScope: quiz.exam_scope || 'course',
      returnTo,
    });
  } catch (err) { next(err); }
});

router.post('/quizzes/:id', async (req, res, next) => {
  try {
    const before = await snapshotQuiz(req.params.id);
    if (before) {
      await snapshot({ entityType: 'quiz', entityId: Number(req.params.id), courseId: before.quiz.course_id, action: 'update', actorId: req.session.user.id, data: before });
    }
    await knex('quizzes').where({ id: req.params.id }).update({
      ...examScopeFields(req.body),
      title: req.body.title,
      description: req.body.description || null,
      pass_mark: req.body.pass_mark || 60,
      time_limit_min: req.body.time_limit_min || null,
      sort_order: req.body.sort_order || 0,
      published: req.body.published === '1',
      available_from: req.body.available_from || null,
    });

    // Rebuild questions + options from the submitted JSON (full edit support).
    if (req.body.questions) {
      const questions = JSON.parse(req.body.questions);
      const oldQ = await knex('quiz_questions').where({ quiz_id: req.params.id }).pluck('id');
      if (oldQ.length) await knex('quiz_options').whereIn('question_id', oldQ).del();
      await knex('quiz_questions').where({ quiz_id: req.params.id }).del();
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const [questionId] = await knex('quiz_questions').insert({
          quiz_id: req.params.id, prompt: q.prompt, type: q.type || 'single',
          explanation: q.explanation || null, sort_order: qi + 1,
        });
        const qid = Array.isArray(questionId) ? questionId[0] : questionId;
        if (q.options) {
          for (let oi = 0; oi < q.options.length; oi++) {
            await knex('quiz_options').insert({ question_id: qid, text: q.options[oi].text, is_correct: q.options[oi].is_correct || false, sort_order: oi + 1 });
          }
        }
      }
    }

    req.flash('success', 'Quiz updated successfully');
    if (req.body.return_to && req.body.return_to.startsWith('/admin/')) return res.redirect(req.body.return_to);
    res.redirect('/admin/quizzes');
  } catch (err) { next(err); }
});

router.post('/quizzes/:id/delete', async (req, res, next) => {
  try {
    const before = await snapshotQuiz(req.params.id);
    if (before) {
      await snapshot({ entityType: 'quiz', entityId: Number(req.params.id), courseId: before.quiz.course_id, action: 'delete', actorId: req.session.user.id, data: before });
    }
    await knex('quiz_answers').del().whereIn('attempt_id', knex('quiz_attempts').where({ quiz_id: req.params.id }).pluck('id'));
    await knex('quiz_answers').del().whereIn('attempt_id', knex('quiz_attempts').where({ quiz_id: req.params.id }).pluck('id'));
    await knex('quiz_attempts').del().where({ quiz_id: req.params.id });
    await knex('quiz_options').del().whereIn('question_id', knex('quiz_questions').where({ quiz_id: req.params.id }).pluck('id'));
    await knex('quiz_questions').del().where({ quiz_id: req.params.id });
    await knex('quizzes').where({ id: req.params.id }).del();

    req.flash('success', 'Quiz deleted successfully');
    res.redirect(req.get('referer') || '/admin/quizzes');
  } catch (err) { next(err); }
});

router.post('/quizzes/:id/duplicate', async (req, res, next) => {
  try {
    const source = await snapshotQuiz(req.params.id);
    if (!source) return res.status(404).render('errors/404', { pageTitle: 'Quiz not found', layout: 'layouts/admin' });
    const { quiz, questions } = source;
    let newId;
    await knex.transaction(async (trx) => {
      const { id: _oldId, ...quizFields } = quiz;
      [newId] = await trx('quizzes').insert({ ...quizFields, title: `${quiz.title} (Copy)`, published: false });
      for (const q of questions) {
        const { id: _oldQid, options, ...qFields } = q;
        const [newQid] = await trx('quiz_questions').insert({ ...qFields, quiz_id: newId });
        for (const o of options) {
          const { id: _oldOid, question_id: _oldQuestionId, ...oFields } = o;
          await trx('quiz_options').insert({ ...oFields, question_id: newQid });
        }
      }
    });
    await snapshot({ entityType: 'quiz', entityId: newId, courseId: quiz.course_id, action: 'create', actorId: req.session.user.id, data: { quiz: { ...quiz, id: newId }, questions } });
    req.flash('success', 'Quiz duplicated as a draft.');
    res.redirect(req.body.return_to && req.body.return_to.startsWith('/admin/') ? req.body.return_to : (req.get('referer') || '/admin/quizzes'));
  } catch (err) { next(err); }
});

// ─── Final Exams (course / year / programme) ────────────────
router.get('/exams', async (req, res, next) => {
  try {
    const exams = await knex('quizzes')
      .where('quizzes.is_final_exam', true)
      .leftJoin('courses', 'quizzes.course_id', 'courses.id')
      .leftJoin('programs', 'quizzes.program_id', 'programs.id')
      .select('quizzes.*', 'courses.title as course_title', 'programs.title as program_title')
      .orderBy('quizzes.exam_scope');
    for (const e of exams) {
      e.questionCount = Number((await knex('quiz_questions').where({ quiz_id: e.id }).count({ c: '*' }).first()).c);
    }
    res.render('admin/exams', { pageTitle: 'Final Exams | GDCU', adminActive: 'exams', exams });
  } catch (err) { next(err); }
});

// ─── LMS Course & Module Management ─────────────────────────
// Study-level metadata: label + banner colour shown on the Manage Courses page.
const COURSE_LEVELS = {
  certificate: { label: 'Certificate', color: '#0f766e' }, // teal
  diploma: { label: 'Diploma', color: '#1d4ed8' }, // blue
  bachelor: { label: 'Bachelor', color: '#6d28d9' }, // violet
  master: { label: "Master's", color: '#b45309' }, // amber
  doctor: { label: 'Doctorate (PhD)', color: '#be123c' }, // rose
};

router.get('/courses', async (req, res, next) => {
  try {
    const courses = await knex('courses').orderBy('sort_order');
    for (const c of courses) {
      // Modules can be attached directly (legacy course_id) AND via the shared-
      // module system (course_shared_modules) at the same time — e.g. a shared
      // foundational library plus the course's own specialised modules. Count
      // both (excluding shared-template rows from the legacy count so a course
      // that owns a shared template isn't double-counted).
      const shared = Number((await knex('course_shared_modules').where({ course_id: c.id }).count({ c: '*' }).first()).c);
      const legacy = Number((await knex('modules').where({ course_id: c.id }).whereNull('shared_module_id').count({ c: '*' }).first()).c);
      c.moduleCount = shared + legacy;
      c.enrollmentCount = (await knex('enrollments').where({ course_id: c.id }).count({ c: '*' }).first()).c;
      const lvl = COURSE_LEVELS[String(c.category || '').toLowerCase()];
      c.levelKey = lvl ? String(c.category).toLowerCase() : 'other';
      c.levelLabel = lvl ? lvl.label : null;
      c.levelColor = lvl ? lvl.color : '#071d3a';
    }
    // Filter buttons, in study order, for the levels actually present.
    const levels = Object.entries(COURSE_LEVELS)
      .filter(([key]) => courses.some((c) => c.levelKey === key))
      .map(([key, v]) => ({ key, ...v }));
    if (req.query.view === 'grid' || req.query.view === 'list') req.session.adminCourseView = req.query.view;
    const view = req.session.adminCourseView || 'grid';
    res.render('admin/courses', {
      pageTitle: 'Manage Courses | GDCU',
      adminActive: 'lms-courses',
      courses,
      levels,
      view,
    });
  } catch (err) { next(err); }
});

router.get('/courses/create', async (req, res, next) => {
  try {
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    const instructors = await knex('users').whereIn('role', ['faculty', 'staff', 'admin']).select('id', 'first_name', 'last_name');
    res.render('admin/course-form', {
      pageTitle: 'Create Course | GDCU',
      adminActive: 'lms-courses',
      course: { drip_feed_enabled: true, drip_feed_interval_hours: 4, published: true, credits: 15, sort_order: 0 },
      programs,
      instructors,
      isNew: true,
    });
  } catch (err) { next(err); }
});

router.post('/courses', async (req, res, next) => {
  try {
    const slug = slugify(req.body.title);
    const [id] = await knex('courses').insert({
      slug,
      program_id: req.body.program_id || null,
      instructor_id: req.body.instructor_id || null,
      code: req.body.code || null,
      title: req.body.title,
      summary: req.body.summary || null,
      description: req.body.description || null,
      credits: req.body.credits || 15,
      icon: req.body.icon || null,
      featured_image: req.body.featured_image || null,
      published: req.body.published === '1',
      sort_order: req.body.sort_order || 0,
      drip_feed_enabled: req.body.drip_feed_enabled === '1',
      drip_feed_interval_hours: req.body.drip_feed_interval_hours || 4,
    });
    req.flash('success', 'Course created.');
    res.redirect(`/admin/courses/${id}/modules`);
  } catch (err) { next(err); }
});

router.get('/courses/:id/edit', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    const instructors = await knex('users').whereIn('role', ['faculty', 'staff', 'admin']).select('id', 'first_name', 'last_name');
    res.render('admin/course-form', {
      pageTitle: 'Edit Course | GDCU',
      adminActive: 'lms-courses',
      course,
      programs,
      instructors,
      isNew: false,
    });
  } catch (err) { next(err); }
});

router.post('/courses/:id', async (req, res, next) => {
  try {
    await knex('courses').where({ id: req.params.id }).update({
      program_id: req.body.program_id || null,
      instructor_id: req.body.instructor_id || null,
      code: req.body.code || null,
      title: req.body.title,
      summary: req.body.summary || null,
      description: req.body.description || null,
      credits: req.body.credits || 15,
      icon: req.body.icon || null,
      featured_image: req.body.featured_image || null,
      published: req.body.published === '1',
      sort_order: req.body.sort_order || 0,
      drip_feed_enabled: req.body.drip_feed_enabled === '1',
      drip_feed_interval_hours: req.body.drip_feed_interval_hours || 4,
    });
    req.flash('success', 'Course updated.');
    res.redirect('/admin/courses');
  } catch (err) { next(err); }
});

// ─── Module & Lesson management for a course ────────────────
router.get('/courses/:id/modules', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });

    // Modules reach a course one of two ways: legacy dedicated (modules.course_id)
    // or the shared-module system (course_shared_modules junction, pointing at a
    // template row in `modules` that many courses reuse) — AND a course can use
    // BOTH at once (e.g. a shared foundational library plus its own specialised
    // modules). Show both, shared first in the course's assigned order, then
    // dedicated ones, so neither is silently hidden.
    const sharedLinks = await knex('course_shared_modules').where({ course_id: course.id }).orderBy('sort_order');
    const sharedModuleIds = sharedLinks.map((l) => l.shared_module_id);
    let sharedModules = [];
    if (sharedModuleIds.length) {
      const tmplModules = await knex('modules').whereIn('shared_module_id', sharedModuleIds);
      const bySmId = {};
      tmplModules.forEach((m) => { bySmId[m.shared_module_id] = m; });
      sharedModules = sharedLinks.map((l) => bySmId[l.shared_module_id]).filter(Boolean).map((m) => ({ ...m, isShared: true }));
    }
    const dedicatedModules = (await knex('modules').where({ course_id: course.id }).whereNull('shared_module_id').orderBy('sort_order')).map((m) => ({ ...m, isShared: false }));
    const modules = [...sharedModules, ...dedicatedModules];

    for (const m of modules) {
      m.lessons = await knex('lessons').where({ module_id: m.id }).orderBy('sort_order');
      // A shared module has one quiz copy per course that uses it — scope to
      // this course, or every course's copy would show up mixed together.
      m.quizzes = await knex('quizzes').where({ module_id: m.id, course_id: course.id }).orderBy('sort_order');
      for (const qz of m.quizzes) {
        qz.questionCount = Number((await knex('quiz_questions').where({ quiz_id: qz.id }).count({ c: '*' }).first()).c);
      }
      m.essayCount = (await knex('essay_submissions').where({ module_id: m.id }).count({ c: '*' }).first()).c;
      if (m.isShared) {
        m.sharedCourseCount = Number((await knex('course_shared_modules').where({ shared_module_id: m.shared_module_id }).count({ c: '*' }).first()).c);
      }
      for (const l of m.lessons) {
        l.materials = await knex('lesson_materials').where({ lesson_id: l.id }).orderBy('sort_order');
      }
      // Assignments belonging to this specific module, shown inside its card
      // rather than lumped into one flat course-wide list.
      m.assignments = await knex('assignments').where({ course_id: course.id, module_id: m.id }).orderBy('sort_order');
      for (const a of m.assignments) {
        a.submissionCount = Number((await knex('assignment_submissions').where({ assignment_id: a.id }).count({ c: '*' }).first()).c);
      }
    }

    const allQuizzes = await knex('quizzes').where({ course_id: course.id }).orderBy('sort_order');
    const finalExam = await knex('quizzes').where({ course_id: course.id, is_final_exam: true }).first();
    if (finalExam) {
      finalExam.questionCount = Number((await knex('quiz_questions').where({ quiz_id: finalExam.id }).count({ c: '*' }).first()).c);
    }
    // Course-wide assignments (not tied to any module) still show in the panel
    // at the top of the page.
    const assignments = await knex('assignments').where({ course_id: course.id }).whereNull('module_id').orderBy('created_at', 'desc');
    for (const a of assignments) {
      a.submissionCount = Number((await knex('assignment_submissions').where({ assignment_id: a.id }).count({ c: '*' }).first()).c);
    }

    // All courses, for the "shared across courses" module-creation mode.
    const allCourses = await knex('courses').orderBy('title').select('id', 'title', 'code');
    res.render('admin/course-modules', {
      pageTitle: `Modules — ${course.title} | GDCU`,
      adminActive: 'lms-courses',
      course,
      modules,
      allQuizzes,
      finalExam,
      assignments,
      allCourses,
    });
  } catch (err) { next(err); }
});

// Read-only preview of how the course appears to a student.
router.get('/courses/:id/preview', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });
    const instructor = course.instructor_id ? await knex('users').where({ id: course.instructor_id }).first() : null;
    const program = course.program_id ? await knex('programs').where({ id: course.program_id }).first() : null;
    // Same shared+dedicated merge as the builder page — a course can have
    // both a shared module library and its own specialised modules.
    const sharedModuleIds = await knex('course_shared_modules').where({ course_id: course.id }).orderBy('sort_order').pluck('shared_module_id');
    let sharedModules = [];
    if (sharedModuleIds.length > 0) {
      sharedModules = await knex('modules')
        .whereIn('shared_module_id', sharedModuleIds)
        .orderByRaw('(SELECT sort_order FROM course_shared_modules WHERE course_shared_modules.shared_module_id = modules.shared_module_id AND course_shared_modules.course_id = ?) ASC', [course.id]);
    }
    const dedicatedModules = await knex('modules').where({ course_id: course.id }).whereNull('shared_module_id').orderBy('sort_order');
    const modules = [...sharedModules, ...dedicatedModules];
    let lessonCount = 0;
    let totalMinutes = 0;
    for (const m of modules) {
      m.lessons = await knex('lessons').where({ module_id: m.id }).orderBy('sort_order');
      m.quizzes = await knex('quizzes').where({ module_id: m.id }).orderBy('sort_order');
      lessonCount += m.lessons.length;
      m.lessons.forEach((l) => { totalMinutes += Number(l.duration_min || 0); });
    }
    const finalExam = await knex('quizzes').where({ course_id: course.id, is_final_exam: true }).first();
    if (finalExam) finalExam.questionCount = Number((await knex('quiz_questions').where({ quiz_id: finalExam.id }).count({ c: '*' }).first()).c);
    res.render('admin/course-preview', {
      pageTitle: `Preview — ${course.title} | GDCU`,
      adminActive: 'lms-courses',
      course, instructor, program, modules, lessonCount, totalMinutes, finalExam,
    });
  } catch (err) { next(err); }
});

// Preview a single lesson exactly as a student would see it (read-only check).
router.get('/lessons/:id/preview', async (req, res, next) => {
  try {
    const lesson = await knex('lessons').where({ id: req.params.id }).first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/admin' });
    const mod = await knex('modules').where({ id: lesson.module_id }).first();
    const course = mod ? await knex('courses').where({ id: mod.course_id }).first() : null;
    const materials = await knex('lesson_materials').where({ lesson_id: lesson.id }).orderBy('sort_order');
    res.render('admin/lesson-preview', {
      pageTitle: `Preview — ${lesson.title}`, adminActive: 'lms-courses',
      lesson, mod, course, materials,
    });
  } catch (err) { next(err); }
});

router.post('/courses/:id/modules', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });

    // ── Shared module mode ──────────────────────────────────
    // Creates a shared_modules entry + template module row, then attaches
    // it to every selected course (including this one) via the
    // course_shared_modules junction — so one module can be assigned to
    // multiple courses in a single step.
    if (req.body.shared === '1') {
      const code = (req.body.code || '').trim();
      if (!code) {
        req.flash('error', 'A module code is required for a shared module.');
        return res.redirect(`/admin/courses/${course.id}/modules`);
      }
      const existingCode = await knex('shared_modules').where({ code }).first();
      if (existingCode) {
        req.flash('error', `Code "${code}" is already used in the library. Choose a different code.`);
        return res.redirect(`/admin/courses/${course.id}/modules`);
      }

      // Resolve the selected course IDs (always include the current course).
      let courseIds = req.body.course_ids || [];
      if (!Array.isArray(courseIds)) courseIds = [courseIds];
      courseIds = courseIds.map(Number).filter(Boolean);
      if (!courseIds.includes(course.id)) courseIds.push(course.id);

      // 1. Create the shared_modules library entry.
      const [smId] = await knex('shared_modules').insert({
        code,
        title: req.body.title,
        description: req.body.summary || req.body.title,
        summary: req.body.summary || null,
        year_level: req.body.year_level ? Number(req.body.year_level) : 1,
        category: req.body.category || null,
        published: true,
      });
      // 2. Create the template module row (lessons hang off this).
      await knex('modules').insert({
        course_id: null,
        shared_module_id: smId,
        title: req.body.title,
        summary: req.body.summary || null,
        sort_order: 0,
        published: true,
      });
      // 3. Attach to every selected course.
      for (const cid of courseIds) {
        const maxSort = await knex('course_shared_modules').where({ course_id: cid }).max('sort_order as m').first();
        await knex('course_shared_modules').insert({
          course_id: cid,
          shared_module_id: smId,
          sort_order: (maxSort.m || 0) + 1,
        });
      }

      req.flash('success', `Shared module "${req.body.title}" created and attached to ${courseIds.length} course(s).`);
      return res.redirect(`/admin/courses/${course.id}/modules`);
    }

    // ── Dedicated module mode (default — just this course) ──
    const maxSort = await knex('modules').where({ course_id: course.id }).max({ m: 'sort_order' }).first();
    await knex('modules').insert({
      course_id: course.id,
      title: req.body.title,
      summary: req.body.summary || null,
      featured_image: req.body.featured_image || null,
      sort_order: (maxSort.m || 0) + 1,
      release_date: req.body.release_date || null,
      prerequisite_module_id: req.body.prerequisite_module_id || null,
      essay_required: req.body.essay_required === '1',
      essay_prompt: req.body.essay_prompt || null,
    });

    req.flash('success', 'Module added.');
    res.redirect(`/admin/courses/${course.id}/modules`);
  } catch (err) { next(err); }
});

router.post('/modules/:id', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });

    await snapshot({ entityType: 'module', entityId: mod.id, courseId: mod.course_id, action: 'update', actorId: req.session.user.id, data: mod });

    await knex('modules').where({ id: mod.id }).update({
      title: req.body.title,
      summary: req.body.summary || null,
      featured_image: req.body.featured_image !== undefined ? (req.body.featured_image || null) : mod.featured_image,
      sort_order: req.body.sort_order || 0,
      release_date: req.body.release_date || null,
      prerequisite_module_id: req.body.prerequisite_module_id || null,
      essay_required: req.body.essay_required === '1',
      essay_prompt: req.body.essay_prompt || null,
      published: req.body.published === '1' || req.body.published === 'on',
    });

    req.flash('success', 'Module updated.');
    res.redirect(`/admin/courses/${mod.course_id}/modules`);
  } catch (err) { next(err); }
});

router.post('/modules/:id/delete', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    const courseId = mod.course_id;
    await snapshot({ entityType: 'module', entityId: mod.id, courseId: mod.course_id, action: 'delete', actorId: req.session.user.id, data: mod });
    await knex('modules').where({ id: mod.id }).del();
    req.flash('success', 'Module deleted.');
    res.redirect(`/admin/courses/${courseId}/modules`);
  } catch (err) { next(err); }
});

// Promote a course-specific module to the shared module library so other
// courses/programmes can attach it. This:
//  1. Creates a shared_modules row (the library entry).
//  2. Links the existing module row via shared_module_id (so its lessons
//     become the shared content — no duplication).
//  3. Creates a course_shared_modules junction for the current course so
//     it keeps using the module.
//  4. Sets the module's course_id to NULL (it now belongs to the library,
//     not one specific course).
// The module's lessons, quizzes, and assignments are untouched — they
// hang off the module row and are now shared by every course that attaches
// this shared module.
router.post('/modules/:id/promote', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    if (mod.shared_module_id) {
      req.flash('error', 'This module is already in the library.');
      return res.redirect(`/admin/courses/${mod.course_id}/modules`);
    }
    const courseId = mod.course_id;
    if (!courseId) {
      req.flash('error', 'This module has no course to promote from.');
      return res.redirect('/admin/courses');
    }

    // 1. Create the shared_modules library entry
    const code = req.body.code || ('MOD-' + mod.id);
    const existingCode = await knex('shared_modules').where({ code }).first();
    if (existingCode) {
      req.flash('error', `Code "${code}" is already used in the library. Choose a different code.`);
      return res.redirect(`/admin/courses/${courseId}/modules`);
    }
    const [smId] = await knex('shared_modules').insert({
      code,
      title: mod.title,
      description: mod.summary || mod.title,
      summary: mod.summary || null,
      year_level: mod.year_level || 1,
      published: mod.published !== false,
    });

    // 2. Link the module to the shared_modules entry and detach from its course
    await knex('modules').where({ id: mod.id }).update({
      shared_module_id: smId,
      course_id: null,
    });

    // 3. Create the junction so this course keeps using it
    const maxSort = await knex('course_shared_modules').where({ course_id: courseId }).max('sort_order as m').first();
    await knex('course_shared_modules').insert({
      course_id: courseId,
      shared_module_id: smId,
      sort_order: (maxSort.m || 0) + 1,
    });

    req.flash('success', `"${mod.title}" promoted to the Module Library. Other courses and programmes can now attach it.`);
    res.redirect(`/admin/courses/${courseId}/modules`);
  } catch (err) { next(err); }
});

// Duplicate a module for the course whose builder page the request came
// from (req.body.course_id — a module can be reached from any of several
// courses if it's shared, so the URL alone doesn't say which one).
//
// A shared module needs an explicit choice, since "duplicate" is ambiguous
// for something already reused by other courses:
//   mode=fork       (default) — an independent copy for THIS course only;
//                     the original shared module and every other course
//                     using it are untouched.
//   mode=new_shared — a brand new reusable module (its own shared_modules
//                     row), attached only to this course for now, but
//                     discoverable for other courses like any other one.
// A plain dedicated module has no such ambiguity — it's always forked.
router.post('/modules/:id/duplicate', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    const courseId = Number(req.body.course_id) || mod.course_id;
    const mode = mod.shared_module_id && req.body.mode === 'new_shared' ? 'new_shared' : 'fork';

    let newModuleId;
    await knex.transaction(async (trx) => {
      if (mode === 'new_shared') {
        const sm = await trx('shared_modules').where({ id: mod.shared_module_id }).first();
        const { id: _smId, created_at: _c, updated_at: _u, ...smFields } = sm;
        const [newSmId] = await trx('shared_modules').insert({ ...smFields, code: `${sm.code}-COPY-${Date.now()}`, title: `${sm.title} (Copy)`, published: false });
        const { id: _modId, ...modFields } = mod;
        [newModuleId] = await trx('modules').insert({ ...modFields, course_id: courseId, shared_module_id: newSmId, title: `${mod.title} (Copy)`, published: false });
        const maxSort = await trx('course_shared_modules').where({ course_id: courseId }).max('sort_order as m').first();
        await trx('course_shared_modules').insert({ course_id: courseId, shared_module_id: newSmId, sort_order: (maxSort.m || 0) + 1 });
      } else {
        const { id: _modId, ...modFields } = mod;
        [newModuleId] = await trx('modules').insert({ ...modFields, course_id: courseId, shared_module_id: null, title: `${mod.title} (Copy)`, published: false });
      }

      const lessons = await trx('lessons').where({ module_id: mod.id }).orderBy('sort_order');
      for (const l of lessons) {
        const { id: oldLid, ...lFields } = l;
        const [newLid] = await trx('lessons').insert({ ...lFields, module_id: newModuleId });
        const materials = await trx('lesson_materials').where({ lesson_id: oldLid });
        for (const m of materials) {
          const { id: _mid, ...mFields } = m;
          await trx('lesson_materials').insert({ ...mFields, lesson_id: newLid });
        }
      }

      // This course's own quiz copy for the module, if any, plus its
      // questions/options — quizzes are per-course, never shared.
      const quizzes = await trx('quizzes').where({ module_id: mod.id, course_id: courseId });
      for (const q of quizzes) {
        const { id: oldQid, ...qFields } = q;
        const [newQid] = await trx('quizzes').insert({ ...qFields, module_id: newModuleId, title: `${q.title} (Copy)`, published: false });
        const questions = await trx('quiz_questions').where({ quiz_id: oldQid }).orderBy('sort_order');
        for (const qq of questions) {
          const { id: oldQqId, ...qqFields } = qq;
          const [newQqId] = await trx('quiz_questions').insert({ ...qqFields, quiz_id: newQid });
          const opts = await trx('quiz_options').where({ question_id: oldQqId }).orderBy('sort_order');
          for (const o of opts) {
            const { id: _oid, ...oFields } = o;
            await trx('quiz_options').insert({ ...oFields, question_id: newQqId });
          }
        }
      }

      // This course's own assignments tied to the module.
      const asgs = await trx('assignments').where({ module_id: mod.id, course_id: courseId });
      for (const a of asgs) {
        const { id: _aid, created_at: _ac, updated_at: _au, ...aFields } = a;
        await trx('assignments').insert({ ...aFields, module_id: newModuleId, title: `${a.title} (Copy)`, published: false });
      }
    });

    await snapshot({ entityType: 'module', entityId: newModuleId, courseId, action: 'create', actorId: req.session.user.id, data: { ...mod, id: newModuleId } });
    req.flash('success', mode === 'new_shared' ? 'Module duplicated as a new reusable module (draft).' : 'Module duplicated for this course (draft).');
    res.redirect(`/admin/courses/${courseId}/modules`);
  } catch (err) { next(err); }
});

// ─── Import / export (admin-UI JSON content portability) ──────
// Distinct from scripts/export-lms.js, a dev-only CLI script that dumps the
// whole local DB to a MySQL-import file for provisioning production — this
// is a browser-facing feature for moving one module or course's content
// between courses (or environments) as a plain JSON file.
async function exportLessonsForModule(moduleId) {
  const lessons = await knex('lessons').where({ module_id: moduleId }).orderBy('sort_order');
  const out = [];
  for (const l of lessons) {
    const materials = await knex('lesson_materials').where({ lesson_id: l.id }).orderBy('sort_order');
    out.push({
      title: l.title, type: l.type, content: l.content, video_url: l.video_url,
      duration_min: l.duration_min, sort_order: l.sort_order, block_no: l.block_no, block_title: l.block_title,
      materials: materials.map((m) => ({ label: m.label, url: m.url, type: m.type })),
    });
  }
  return out;
}

async function exportQuizzesForModule(moduleId, courseId) {
  const quizzes = await knex('quizzes').where({ module_id: moduleId, course_id: courseId });
  const out = [];
  for (const q of quizzes) {
    const questions = await knex('quiz_questions').where({ quiz_id: q.id }).orderBy('sort_order');
    const questionsOut = [];
    for (const qq of questions) {
      const options = await knex('quiz_options').where({ question_id: qq.id }).orderBy('sort_order');
      questionsOut.push({ prompt: qq.prompt, type: qq.type, explanation: qq.explanation, options: options.map((o) => ({ text: o.text, is_correct: !!o.is_correct })) });
    }
    out.push({ title: q.title, description: q.description, pass_mark: q.pass_mark, time_limit_min: q.time_limit_min, after_block: q.after_block, covers_blocks: q.covers_blocks, questions: questionsOut });
  }
  return out;
}

router.get('/modules/:id/export.json', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).send('Module not found');
    const doc = {
      type: 'module',
      exportedAt: new Date().toISOString(),
      module: { title: mod.title, summary: mod.summary, year_level: mod.year_level, essay_required: !!mod.essay_required, essay_prompt: mod.essay_prompt },
      lessons: await exportLessonsForModule(mod.id),
    };
    res.setHeader('Content-Disposition', `attachment; filename="module-${mod.id}.json"`);
    res.json(doc);
  } catch (err) { next(err); }
});

router.get('/courses/:id/export.json', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).send('Course not found');
    const sharedLinks = await knex('course_shared_modules').where({ course_id: course.id }).orderBy('sort_order');
    const sharedIds = sharedLinks.map((l) => l.shared_module_id);
    let mods;
    if (sharedIds.length) {
      const tmplMods = await knex('modules').whereIn('shared_module_id', sharedIds);
      const bySm = {};
      tmplMods.forEach((m) => { bySm[m.shared_module_id] = m; });
      mods = sharedLinks.map((l) => bySm[l.shared_module_id]).filter(Boolean);
    } else {
      mods = await knex('modules').where({ course_id: course.id }).orderBy('sort_order');
    }

    const modulesOut = [];
    for (const mod of mods) {
      const assignments = await knex('assignments').where({ module_id: mod.id, course_id: course.id });
      modulesOut.push({
        title: mod.title, summary: mod.summary, year_level: mod.year_level, essay_required: !!mod.essay_required, essay_prompt: mod.essay_prompt,
        lessons: await exportLessonsForModule(mod.id),
        quizzes: await exportQuizzesForModule(mod.id, course.id),
        assignments: assignments.map((a) => ({ title: a.title, instructions: a.instructions, max_points: a.max_points, assignment_type: a.assignment_type })),
      });
    }

    const doc = {
      type: 'course',
      exportedAt: new Date().toISOString(),
      course: { title: course.title, summary: course.summary, credits: course.credits, category: course.category, year_level: course.year_level },
      modules: modulesOut,
    };
    res.setHeader('Content-Disposition', `attachment; filename="course-${course.id}.json"`);
    res.json(doc);
  } catch (err) { next(err); }
});

// Import always creates NEW dedicated (never shared) content on the
// importing course, published as drafts pending review — it never
// auto-links to shared_modules, so an import can't silently graft content
// onto other courses that happen to reuse the same shared module.
router.post('/courses/:id/import', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.redirect('/admin/courses');
    const back = `/admin/courses/${course.id}/modules`;
    let doc;
    try { doc = JSON.parse(req.body.json || ''); } catch (e) { req.flash('error', 'That file is not valid JSON.'); return res.redirect(back); }

    const modulesToImport = doc.type === 'course' ? (doc.modules || [])
      : (Array.isArray(doc.lessons) ? [{ ...doc.module, lessons: doc.lessons }] : []);
    if (!modulesToImport.length) { req.flash('error', 'No importable modules found in that file.'); return res.redirect(back); }

    let importedCount = 0;
    const newModuleIds = [];
    await knex.transaction(async (trx) => {
      const maxModSort = await trx('modules').where({ course_id: course.id }).max('sort_order as m').first();
      let so = maxModSort.m || 0;
      for (const modDoc of modulesToImport) {
        so++;
        const [newModId] = await trx('modules').insert({
          course_id: course.id, shared_module_id: null, title: (modDoc.title || 'Imported module') + ' (Imported)',
          summary: modDoc.summary || null, year_level: modDoc.year_level || 1,
          essay_required: !!modDoc.essay_required, essay_prompt: modDoc.essay_prompt || null,
          sort_order: so, published: false,
        });
        newModuleIds.push(newModId);
        for (const l of (modDoc.lessons || [])) {
          const [newLid] = await trx('lessons').insert({
            module_id: newModId, title: l.title || 'Untitled lesson', type: l.type || 'reading', content: l.content || null,
            video_url: l.video_url || null, duration_min: l.duration_min || 15, sort_order: l.sort_order || 0,
            block_no: l.block_no || null, block_title: l.block_title || null, published: false,
          });
          for (const m of (l.materials || [])) {
            await trx('lesson_materials').insert({ lesson_id: newLid, label: m.label || 'Material', url: m.url || '#', type: m.type || 'link' });
          }
        }
        for (const q of (modDoc.quizzes || [])) {
          const [newQid] = await trx('quizzes').insert({
            course_id: course.id, module_id: newModId, title: q.title || 'Imported quiz', description: q.description || null,
            pass_mark: q.pass_mark || 60, time_limit_min: q.time_limit_min || null, after_block: q.after_block || null,
            covers_blocks: q.covers_blocks || null, published: false,
          });
          for (const qq of (q.questions || [])) {
            const [newQqId] = await trx('quiz_questions').insert({ quiz_id: newQid, prompt: qq.prompt || '', type: qq.type || 'single', explanation: qq.explanation || null });
            for (const o of (qq.options || [])) {
              await trx('quiz_options').insert({ question_id: newQqId, text: o.text || '', is_correct: !!o.is_correct });
            }
          }
        }
        for (const a of (modDoc.assignments || [])) {
          await trx('assignments').insert({
            course_id: course.id, module_id: newModId, title: a.title || 'Imported assignment', instructions: a.instructions || null,
            max_points: a.max_points || 100, assignment_type: a.assignment_type || 'essay', published: false,
          });
        }
        importedCount++;
      }
    });

    for (const newModId of newModuleIds) {
      const created = await knex('modules').where({ id: newModId }).first();
      await snapshot({ entityType: 'module', entityId: newModId, courseId: course.id, action: 'create', actorId: req.session.user.id, data: created });
    }
    req.flash('success', `Imported ${importedCount} module(s) as drafts — review and publish when ready.`);
    res.redirect(back);
  } catch (err) { next(err); }
});

// ─── Reusable module library ──────────────────────────────────
// Browse/search every shared module, and (when opened with ?for_course=)
// attach one to a course without re-authoring it from scratch.
router.get('/course-library', async (req, res, next) => {
  try {
    const { q, category, year_level, for_course } = req.query;
    const query = knex('shared_modules').orderBy('code');
    if (q) query.where((b) => b.whereILike('title', `%${q}%`).orWhereILike('code', `%${q}%`));
    if (category) query.where({ category });
    if (year_level) query.where({ year_level: Number(year_level) });
    const sharedModules = await query;

    const categories = await knex('shared_modules').distinct('category').whereNotNull('category').pluck('category');
    const forCourse = for_course ? await knex('courses').where({ id: for_course }).first() : null;
    const attachedIds = forCourse
      ? new Set(await knex('course_shared_modules').where({ course_id: forCourse.id }).pluck('shared_module_id'))
      : new Set();
    for (const sm of sharedModules) {
      sm.courseCount = Number((await knex('course_shared_modules').where({ shared_module_id: sm.id }).count({ c: '*' }).first()).c);
      sm.lessonCount = Number((await knex('lessons').whereIn('module_id', knex('modules').where({ shared_module_id: sm.id }).select('id')).count({ c: '*' }).first()).c);
      sm.alreadyAttached = attachedIds.has(sm.id);
    }

    res.render('admin/course-library', {
      pageTitle: 'Module Library | GDCU',
      adminActive: 'lms-courses',
      sharedModules,
      categories,
      forCourse,
      filters: { q: q || '', category: category || '', year_level: year_level || '' },
    });
  } catch (err) { next(err); }
});

// ─── Shared module library: create / edit / delete ──────────
// A shared module is a reusable template (e.g. CORE-101) that many courses
// can attach without re-authoring it. This makes it easy to share common
// modules across courses and programmes, saving time.

router.get('/course-library/new', async (req, res, next) => {
  try {
    const categories = await knex('shared_modules').distinct('category').whereNotNull('category').pluck('category');
    res.render('admin/shared-module-form', {
      pageTitle: 'New Shared Module | GDCU',
      adminActive: 'course-library',
      sm: { year_level: 1, published: true },
      categories,
      isNew: true,
    });
  } catch (err) { next(err); }
});

router.post('/course-library', async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.code) {
      req.flash('error', 'Module code and title are required.');
      return res.redirect('/admin/course-library/new');
    }
    // Ensure the code is unique.
    const existing = await knex('shared_modules').where({ code: req.body.code }).first();
    if (existing) {
      req.flash('error', `A module with code "${req.body.code}" already exists. Choose a different code.`);
      return res.redirect('/admin/course-library/new');
    }
    const [smIdRaw] = await knex('shared_modules').insert({
      code: req.body.code,
      title: req.body.title,
      description: req.body.description || null,
      summary: req.body.summary || null,
      year_level: req.body.year_level ? Number(req.body.year_level) : 1,
      category: req.body.category || null,
      featured_image: req.body.featured_image || null,
      published: req.body.published === '1' || req.body.published === 'on',
    });
    const smId = Array.isArray(smIdRaw) ? smIdRaw[0] : smIdRaw;
    // Create the template module row that lessons will hang off.
    await knex('modules').insert({
      course_id: null, // shared modules don't belong to one course
      shared_module_id: smId,
      title: req.body.title,
      summary: req.body.summary || null,
      sort_order: 0,
      published: req.body.published === '1' || req.body.published === 'on',
    });
    req.flash('success', `Shared module "${req.body.title}" created. Add lessons to it, then attach it to any course.`);
    res.redirect(`/admin/course-library/${smId}`);
  } catch (err) { next(err); }
});

router.get('/course-library/:id', async (req, res, next) => {
  try {
    const sm = await knex('shared_modules').where({ id: req.params.id }).first();
    if (!sm) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    const mod = await knex('modules').where({ shared_module_id: sm.id }).first();
    const lessons = mod ? await knex('lessons').where({ module_id: mod.id }).orderBy('sort_order') : [];
    for (const l of lessons) {
      l.materials = await knex('lesson_materials').where({ lesson_id: l.id }).orderBy('sort_order');
    }
    const quizzes = mod ? await knex('quizzes').where({ module_id: mod.id }).orderBy('sort_order') : [];
    for (const q of quizzes) {
      q.questionCount = Number((await knex('quiz_questions').where({ quiz_id: q.id }).count({ c: '*' }).first()).c);
    }
    // Which courses use this module?
    const courses = await knex('course_shared_modules')
      .join('courses', 'course_shared_modules.course_id', 'courses.id')
      .where('course_shared_modules.shared_module_id', sm.id)
      .orderBy('courses.title')
      .select('courses.id', 'courses.title', 'courses.code');
    // Courses this module is NOT yet attached to (for the attach form).
    const attachedIds = new Set(courses.map((c) => c.id));
    const allCourses = await knex('courses').orderBy('title').select('id', 'title', 'code');
    const availableCourses = allCourses.filter((c) => !attachedIds.has(c.id));
    res.render('admin/shared-module-detail', {
      pageTitle: `${sm.title} | Module Library`,
      adminActive: 'course-library',
      sm, mod, lessons, quizzes, courses, availableCourses,
    });
  } catch (err) { next(err); }
});

router.get('/course-library/:id/edit', async (req, res, next) => {
  try {
    const sm = await knex('shared_modules').where({ id: req.params.id }).first();
    if (!sm) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    const categories = await knex('shared_modules').distinct('category').whereNotNull('category').pluck('category');
    res.render('admin/shared-module-form', {
      pageTitle: 'Edit Shared Module | GDCU',
      adminActive: 'course-library',
      sm,
      categories,
      isNew: false,
    });
  } catch (err) { next(err); }
});

router.post('/course-library/:id', async (req, res, next) => {
  try {
    const sm = await knex('shared_modules').where({ id: req.params.id }).first();
    if (!sm) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    // If the code changed, ensure it stays unique.
    if (req.body.code && req.body.code !== sm.code) {
      const clash = await knex('shared_modules').where({ code: req.body.code }).whereNot('id', sm.id).first();
      if (clash) {
        req.flash('error', `Code "${req.body.code}" is already used by another module.`);
        return res.redirect(`/admin/course-library/${sm.id}/edit`);
      }
    }
    await knex('shared_modules').where({ id: sm.id }).update({
      code: req.body.code || sm.code,
      title: req.body.title || sm.title,
      description: req.body.description || null,
      summary: req.body.summary || null,
      year_level: req.body.year_level ? Number(req.body.year_level) : sm.year_level,
      category: req.body.category || null,
      featured_image: req.body.featured_image || null,
      published: req.body.published === '1' || req.body.published === 'on',
      updated_at: knex.fn.now(),
    });
    // Keep the template module row's title in sync.
    const mod = await knex('modules').where({ shared_module_id: sm.id }).first();
    if (mod) {
      await knex('modules').where({ id: mod.id }).update({
        title: req.body.title || sm.title,
        summary: req.body.summary || null,
        published: req.body.published === '1' || req.body.published === 'on',
      });
    }
    req.flash('success', 'Shared module updated.');
    res.redirect(`/admin/course-library/${sm.id}`);
  } catch (err) { next(err); }
});

router.post('/course-library/:id/delete', async (req, res, next) => {
  try {
    const sm = await knex('shared_modules').where({ id: req.params.id }).first();
    if (!sm) return res.redirect('/admin/course-library');
    const courseCount = Number((await knex('course_shared_modules').where({ shared_module_id: sm.id }).count({ c: '*' }).first()).c);
    if (courseCount > 0) {
      req.flash('error', `This module is attached to ${courseCount} course(s). Detach it from all courses before deleting.`);
      return res.redirect(`/admin/course-library/${sm.id}`);
    }
    // Delete the template module + its lessons/materials.
    const mod = await knex('modules').where({ shared_module_id: sm.id }).first();
    if (mod) {
      const lessons = await knex('lessons').where({ module_id: mod.id }).pluck('id');
      if (lessons.length) await knex('lesson_materials').whereIn('lesson_id', lessons).del();
      await knex('lessons').where({ module_id: mod.id }).del();
      await knex('modules').where({ id: mod.id }).del();
    }
    await knex('shared_modules').where({ id: sm.id }).del();
    req.flash('success', 'Shared module deleted.');
    res.redirect('/admin/course-library');
  } catch (err) { next(err); }
});

// Add a lesson to a shared module (from the library detail page).
router.post('/course-library/:id/lessons', async (req, res, next) => {
  try {
    const sm = await knex('shared_modules').where({ id: req.params.id }).first();
    if (!sm) return res.redirect('/admin/course-library');
    const mod = await knex('modules').where({ shared_module_id: sm.id }).first();
    if (!mod) return res.redirect(`/admin/course-library/${sm.id}`);
    const maxSort = await knex('lessons').where({ module_id: mod.id }).max({ m: 'sort_order' }).first();
    await knex('lessons').insert({
      module_id: mod.id,
      title: req.body.title,
      type: req.body.type || 'reading',
      content: req.body.content || null,
      video_url: req.body.video_url || null,
      duration_min: req.body.duration_min || 15,
      sort_order: (maxSort.m || 0) + 1,
      block_no: req.body.block_no ? Number(req.body.block_no) : null,
      block_title: req.body.block_title || null,
    });
    req.flash('success', 'Lesson added to shared module.');
    res.redirect(`/admin/course-library/${sm.id}`);
  } catch (err) { next(err); }
});

router.post('/course-library/:id/lessons/:lessonId', async (req, res, next) => {
  try {
    const lesson = await knex('lessons').where({ id: req.params.lessonId }).first();
    if (!lesson) return res.redirect(`/admin/course-library/${req.params.id}`);
    await knex('lessons').where({ id: lesson.id }).update({
      title: req.body.title,
      type: req.body.type || 'reading',
      content: req.body.content || null,
      video_url: req.body.video_url || null,
      image_url: req.body.image_url || null,
      live_provider: req.body.live_provider || null,
      live_join_url: req.body.live_join_url || null,
      live_embed_url: req.body.live_embed_url || null,
      live_passcode: req.body.live_passcode || null,
      duration_min: req.body.duration_min || 15,
      block_no: req.body.block_no ? Number(req.body.block_no) : (lesson.block_no || null),
      block_title: req.body.block_title !== undefined && req.body.block_title !== '' ? req.body.block_title : lesson.block_title,
      published: req.body.published === '1' || req.body.published === 'on',
    });
    req.flash('success', 'Lesson updated.');
    res.redirect(`/admin/course-library/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/course-library/:id/lessons/:lessonId/delete', async (req, res, next) => {
  try {
    await knex('lesson_materials').where({ lesson_id: req.params.lessonId }).del();
    await knex('lessons').where({ id: req.params.lessonId }).del();
    req.flash('success', 'Lesson deleted.');
    res.redirect(`/admin/course-library/${req.params.id}`);
  } catch (err) { next(err); }
});

// Add a material to a shared module's lesson (from the library detail page).
router.post('/course-library/:id/lessons/:lessonId/materials', async (req, res, next) => {
  try {
    if (req.body.label && req.body.url) {
      const lesson = await knex('lessons').where({ id: req.params.lessonId }).first();
      if (!lesson) return res.redirect(`/admin/course-library/${req.params.id}`);
      const max = await knex('lesson_materials').where({ lesson_id: lesson.id }).max({ m: 'sort_order' }).first();
      await knex('lesson_materials').insert({
        lesson_id: lesson.id, label: req.body.label, url: req.body.url,
        type: req.body.type || 'link', sort_order: (Number(max.m) || 0) + 1,
      });
      req.flash('success', 'Material added.');
    }
    res.redirect(`/admin/course-library/${req.params.id}`);
  } catch (err) { next(err); }
});

// Remove a material from a shared module's lesson.
router.post('/course-library/:id/materials/:materialId/delete', async (req, res, next) => {
  try {
    await knex('lesson_materials').where({ id: req.params.materialId }).del();
    req.flash('success', 'Material removed.');
    res.redirect(`/admin/course-library/${req.params.id}`);
  } catch (err) { next(err); }
});

// Drag-and-drop module reordering (AJAX). A shared-module course orders via
// course_shared_modules.sort_order (per-course position — modules.sort_order
// itself is shared across every course using that template and must not be
// touched here); a dedicated-module course orders via modules.sort_order
// directly, matching how getCourseStructure resolves a course's modules.
router.post('/courses/:id/modules/reorder', async (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ ok: false, error: 'No ids supplied.' });
    const courseId = req.params.id;
    const sharedCount = Number((await knex('course_shared_modules').where({ course_id: courseId }).count({ c: '*' }).first()).c);
    if (sharedCount > 0) {
      const mods = await knex('modules').whereIn('id', ids).select('id', 'shared_module_id');
      const smById = {};
      mods.forEach((m) => { smById[m.id] = m.shared_module_id; });
      for (let i = 0; i < ids.length; i++) {
        const smId = smById[ids[i]];
        if (smId) await knex('course_shared_modules').where({ course_id: courseId, shared_module_id: smId }).update({ sort_order: i + 1 });
      }
    } else {
      for (let i = 0; i < ids.length; i++) {
        await knex('modules').where({ id: ids[i], course_id: courseId }).update({ sort_order: i + 1 });
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Bulk publish/unpublish modules on a course. No bulk delete here — a
// module can be a shared template used by many other courses (see the
// single-module delete route's confirm text), so deleting several at once
// is left to the individually-confirmed single-item flow.
router.post('/courses/:id/modules/bulk', async (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    const back = `/admin/courses/${req.params.id}/modules`;
    if (!ids.length) { req.flash('error', 'Select at least one module.'); return res.redirect(back); }
    const action = req.body.action;
    if (action !== 'publish' && action !== 'unpublish') { req.flash('error', 'Choose an action.'); return res.redirect(back); }
    const mods = await knex('modules').whereIn('id', ids);
    for (const mod of mods) {
      await snapshot({ entityType: 'module', entityId: mod.id, courseId: mod.course_id, action: 'update', actorId: req.session.user.id, data: mod });
    }
    await knex('modules').whereIn('id', ids).update({ published: action === 'publish' });
    req.flash('success', `${mods.length} module(s) ${action === 'publish' ? 'published' : 'set to draft'}.`);
    res.redirect(back);
  } catch (err) { next(err); }
});

// Streamlined: create a whole Lesson (block) — its readings + video — in one step,
// auto-placed as the next Lesson in the module. Optionally launches the quiz builder
// for that lesson afterwards.
router.post('/modules/:id/block', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    const title = (req.body.block_title || '').trim();
    if (!title) { req.flash('error', 'Give the lesson a title.'); return res.redirect(`/admin/courses/${mod.course_id}/modules`); }

    const maxBlock = Number((await knex('lessons').where({ module_id: mod.id }).max({ m: 'block_no' }).first()).m) || 0;
    const blockNo = maxBlock + 1;
    let sort = Number((await knex('lessons').where({ module_id: mod.id }).max({ m: 'sort_order' }).first()).m) || 0;

    // Build the parts the user chose (defaults: main reading + study reading + video).
    const parts = [];
    if (req.body.part_read !== 'off') parts.push({ type: 'reading', title: `Read: ${title}`, dur: 9 });
    if (req.body.part_study === 'on') parts.push({ type: 'reading', title: `Study: ${title}`, dur: 6 });
    if (req.body.part_video === 'on' || req.body.video_url) parts.push({ type: 'video', title: `Watch: ${title}`, video: req.body.video_url || null, dur: 15 });
    if (req.body.part_audio === 'on') parts.push({ type: 'audio', title: `Listen: ${title}`, dur: 10 });
    if (!parts.length) parts.push({ type: 'reading', title: `Read: ${title}`, dur: 9 });

    for (const p of parts) {
      sort += 1;
      await knex('lessons').insert({
        module_id: mod.id,
        title: p.title,
        type: p.type,
        video_url: p.video || null,
        live_provider: req.body.live_provider || null,
        live_join_url: req.body.live_join_url || null,
        live_embed_url: req.body.live_embed_url || null,
        live_passcode: req.body.live_passcode || null,
        duration_min: p.dur,
        sort_order: sort,
        block_no: blockNo,
        block_title: title,
      });
    }

    // If they asked for a quiz, send them to the quiz builder pre-scoped to THIS lesson.
    if (req.body.add_quiz === 'on') {
      req.flash('success', `Lesson ${blockNo} “${title}” created. Now add the quiz questions for it.`);
      return res.redirect(`/admin/quizzes/create?course_id=${mod.course_id}&module_id=${mod.id}&after_block=${blockNo}&block_title=${encodeURIComponent(title)}&return=/admin/courses/${mod.course_id}/modules`);
    }
    req.flash('success', `Lesson ${blockNo} “${title}” created with ${parts.length} part(s).`);
    res.redirect(`/admin/courses/${mod.course_id}/modules`);
  } catch (err) { next(err); }
});

// ─── Lesson management ──────────────────────────────────────
router.post('/modules/:id/lessons', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });

    const maxSort = await knex('lessons').where({ module_id: mod.id }).max({ m: 'sort_order' }).first();
    await knex('lessons').insert({
      module_id: mod.id,
      title: req.body.title,
      type: req.body.type || 'reading',
      content: req.body.content || null,
      video_url: req.body.video_url || null,
      image_url: req.body.image_url || null,
      live_provider: req.body.live_provider || null,
      live_join_url: req.body.live_join_url || null,
      live_embed_url: req.body.live_embed_url || null,
      live_passcode: req.body.live_passcode || null,
      duration_min: req.body.duration_min || 15,
      sort_order: req.body.sort_order ? Number(req.body.sort_order) : (maxSort.m || 0) + 1,
      block_no: req.body.block_no ? Number(req.body.block_no) : null,
      block_title: req.body.block_title || null,
    });

    req.flash('success', 'Lesson added.');
    res.redirect(`/admin/courses/${mod.course_id}/modules`);
  } catch (err) { next(err); }
});

router.post('/lessons/:id', async (req, res, next) => {
  try {
    const lesson = await knex('lessons').where({ id: req.params.id }).first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/admin' });
    const mod = await knex('modules').where({ id: lesson.module_id }).first();

    await snapshot({ entityType: 'lesson', entityId: lesson.id, courseId: mod && mod.course_id, action: 'update', actorId: req.session.user.id, data: lesson });

    await knex('lessons').where({ id: lesson.id }).update({
      title: req.body.title,
      type: req.body.type || 'reading',
      content: req.body.content || null,
      video_url: req.body.video_url || null,
      image_url: req.body.image_url || null,
      live_provider: req.body.live_provider || null,
      live_join_url: req.body.live_join_url || null,
      live_embed_url: req.body.live_embed_url || null,
      live_passcode: req.body.live_passcode || null,
      duration_min: req.body.duration_min || 15,
      sort_order: req.body.sort_order || 0,
      block_no: req.body.block_no ? Number(req.body.block_no) : (lesson.block_no || null),
      block_title: req.body.block_title !== undefined && req.body.block_title !== '' ? req.body.block_title : lesson.block_title,
      published: req.body.published === '1' || req.body.published === 'on',
      available_from: req.body.available_from || null,
    });

    req.flash('success', 'Lesson updated.');
    res.redirect(`/admin/courses/${mod.course_id}/modules`);
  } catch (err) { next(err); }
});

router.post('/lessons/:id/delete', async (req, res, next) => {
  try {
    const lesson = await knex('lessons').where({ id: req.params.id }).first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/admin' });
    const mod = await knex('modules').where({ id: lesson.module_id }).first();
    await snapshot({ entityType: 'lesson', entityId: lesson.id, courseId: mod && mod.course_id, action: 'delete', actorId: req.session.user.id, data: lesson });
    await knex('lessons').where({ id: lesson.id }).del();
    req.flash('success', 'Lesson deleted.');
    res.redirect(`/admin/courses/${mod.course_id}/modules`);
  } catch (err) { next(err); }
});

router.post('/lessons/:id/duplicate', async (req, res, next) => {
  try {
    const lesson = await knex('lessons').where({ id: req.params.id }).first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/admin' });
    const mod = await knex('modules').where({ id: lesson.module_id }).first();
    const maxSort = await knex('lessons').where({ module_id: lesson.module_id }).max('sort_order as m').first();
    const { id: _oldId, ...fields } = lesson;
    const [newId] = await knex('lessons').insert({
      ...fields,
      title: `${lesson.title} (Copy)`,
      sort_order: (maxSort.m || 0) + 1,
      published: false, // review before it goes live, same as any new content
    });
    const materials = await knex('lesson_materials').where({ lesson_id: lesson.id });
    for (const m of materials) {
      const { id: _mOldId, ...mFields } = m;
      await knex('lesson_materials').insert({ ...mFields, lesson_id: newId });
    }
    await snapshot({ entityType: 'lesson', entityId: newId, courseId: mod && mod.course_id, action: 'create', actorId: req.session.user.id, data: { ...fields, id: newId } });
    req.flash('success', 'Lesson duplicated as a draft.');
    res.redirect(`/admin/courses/${mod.course_id}/modules`);
  } catch (err) { next(err); }
});

// Bulk publish/unpublish/delete lessons within one module. Scoped to
// module_id so a tampered request can't touch lessons elsewhere.
router.post('/modules/:id/lessons/bulk', async (req, res, next) => {
  try {
    const mod = await knex('modules').where({ id: req.params.id }).first();
    if (!mod) return res.status(404).render('errors/404', { pageTitle: 'Module not found', layout: 'layouts/admin' });
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    const back = `/admin/courses/${mod.course_id}/modules`;
    if (!ids.length) { req.flash('error', 'Select at least one lesson.'); return res.redirect(back); }
    const action = req.body.action;
    const lessons = await knex('lessons').where({ module_id: mod.id }).whereIn('id', ids);
    if (!lessons.length) { req.flash('error', 'No matching lessons found.'); return res.redirect(back); }
    const lessonIds = lessons.map((l) => l.id);
    for (const lesson of lessons) {
      await snapshot({ entityType: 'lesson', entityId: lesson.id, courseId: mod.course_id, action: action === 'delete' ? 'delete' : 'update', actorId: req.session.user.id, data: lesson });
    }
    if (action === 'delete') {
      await knex('lessons').whereIn('id', lessonIds).del();
      req.flash('success', `${lessons.length} lesson(s) deleted.`);
    } else if (action === 'publish' || action === 'unpublish') {
      await knex('lessons').whereIn('id', lessonIds).update({ published: action === 'publish' });
      req.flash('success', `${lessons.length} lesson(s) ${action === 'publish' ? 'published' : 'set to draft'}.`);
    } else {
      req.flash('error', 'Choose an action.');
    }
    res.redirect(back);
  } catch (err) { next(err); }
});

// Drag-and-drop lesson reordering within one module (AJAX).
router.post('/modules/:id/lessons/reorder', async (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ ok: false, error: 'No ids supplied.' });
    for (let i = 0; i < ids.length; i++) {
      await knex('lessons').where({ id: ids[i], module_id: req.params.id }).update({ sort_order: i + 1 });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Assignments (course-level) ──────────────────────────────
router.post('/courses/:id/assignments', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.redirect('/admin/courses');
    if (!req.body.title) { req.flash('error', 'Assignment title is required.'); return res.redirect(`/admin/courses/${course.id}/modules`); }
    await knex('assignments').insert({
      course_id: course.id,
      module_id: req.body.module_id || null,
      title: req.body.title,
      instructions: req.body.instructions || null,
      due_date: req.body.due_date || null,
      available_from: req.body.available_from || null,
      max_points: req.body.max_points ? Number(req.body.max_points) : 100,
      published: req.body.published === '1' || req.body.published === 'on',
    });
    req.flash('success', 'Assignment created.');
    res.redirect(`/admin/courses/${course.id}/modules`);
  } catch (err) { next(err); }
});

router.post('/assignments/:id', async (req, res, next) => {
  try {
    const a = await knex('assignments').where({ id: req.params.id }).first();
    if (!a) return res.status(404).render('errors/404', { pageTitle: 'Assignment not found', layout: 'layouts/admin' });

    await snapshot({ entityType: 'assignment', entityId: a.id, courseId: a.course_id, action: 'update', actorId: req.session.user.id, data: a });

    await knex('assignments').where({ id: a.id }).update({
      title: req.body.title,
      instructions: req.body.instructions || null,
      due_date: req.body.due_date || null,
      available_from: req.body.available_from || null,
      max_points: req.body.max_points ? Number(req.body.max_points) : 100,
      published: req.body.published === '1' || req.body.published === 'on',
    });
    req.flash('success', 'Assignment updated.');
    res.redirect(req.body.return_to && req.body.return_to.startsWith('/admin/') ? req.body.return_to : `/admin/courses/${a.course_id}/modules`);
  } catch (err) { next(err); }
});

router.post('/assignments/:id/delete', async (req, res, next) => {
  try {
    const a = await knex('assignments').where({ id: req.params.id }).first();
    if (a) {
      await snapshot({ entityType: 'assignment', entityId: a.id, courseId: a.course_id, action: 'delete', actorId: req.session.user.id, data: a });
      await knex('assignment_submissions').where({ assignment_id: a.id }).del();
      await knex('assignments').where({ id: a.id }).del();
      req.flash('success', 'Assignment deleted.');
    }
    res.redirect(req.get('referer') || '/admin/courses');
  } catch (err) { next(err); }
});

router.post('/assignments/:id/duplicate', async (req, res, next) => {
  try {
    const a = await knex('assignments').where({ id: req.params.id }).first();
    if (!a) return res.status(404).render('errors/404', { pageTitle: 'Assignment not found', layout: 'layouts/admin' });
    const maxSort = await knex('assignments').where({ course_id: a.course_id }).max('sort_order as m').first();
    const { id: _oldId, created_at: _c, updated_at: _u, ...fields } = a;
    const [newId] = await knex('assignments').insert({
      ...fields,
      title: `${a.title} (Copy)`,
      sort_order: (maxSort.m || 0) + 1,
      published: false,
    });
    await snapshot({ entityType: 'assignment', entityId: newId, courseId: a.course_id, action: 'create', actorId: req.session.user.id, data: { ...fields, id: newId } });
    req.flash('success', 'Assignment duplicated as a draft.');
    res.redirect(`/admin/courses/${a.course_id}/modules`);
  } catch (err) { next(err); }
});

// Bulk publish/unpublish/delete assignments on a course — covers both the
// course-wide list and each module's own list, since both are scoped by
// course_id and submit ids from whichever rows were checked.
router.post('/courses/:id/assignments/bulk', async (req, res, next) => {
  try {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map(Number).filter(Boolean);
    const back = `/admin/courses/${req.params.id}/modules`;
    if (!ids.length) { req.flash('error', 'Select at least one assignment.'); return res.redirect(back); }
    const action = req.body.action;
    const assignments = await knex('assignments').where({ course_id: req.params.id }).whereIn('id', ids);
    if (!assignments.length) { req.flash('error', 'No matching assignments found.'); return res.redirect(back); }
    const asgIds = assignments.map((a) => a.id);
    for (const a of assignments) {
      await snapshot({ entityType: 'assignment', entityId: a.id, courseId: a.course_id, action: action === 'delete' ? 'delete' : 'update', actorId: req.session.user.id, data: a });
    }
    if (action === 'delete') {
      await knex('assignment_submissions').whereIn('assignment_id', asgIds).del();
      await knex('assignments').whereIn('id', asgIds).del();
      req.flash('success', `${assignments.length} assignment(s) deleted.`);
    } else if (action === 'publish' || action === 'unpublish') {
      await knex('assignments').whereIn('id', asgIds).update({ published: action === 'publish' });
      req.flash('success', `${assignments.length} assignment(s) ${action === 'publish' ? 'published' : 'set to draft'}.`);
    } else {
      req.flash('error', 'Choose an action.');
    }
    res.redirect(back);
  } catch (err) { next(err); }
});

// ─── Version history ─────────────────────────────────────────
const REVISION_TABLES = { module: 'modules', lesson: 'lessons', assignment: 'assignments' };

router.get('/revisions', async (req, res, next) => {
  try {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || !entity_id || !['module', 'lesson', 'quiz', 'assignment'].includes(entity_type)) {
      return res.status(400).render('errors/404', { pageTitle: 'Invalid request', layout: 'layouts/admin' });
    }
    const revisions = await knex('content_revisions')
      .where({ entity_type, entity_id: Number(entity_id) })
      .orderBy('created_at', 'desc');
    const actorIds = [...new Set(revisions.map((r) => r.actor_user_id).filter(Boolean))];
    const actors = actorIds.length ? await knex('users').whereIn('id', actorIds).select('id', 'first_name', 'last_name') : [];
    const actorById = {};
    actors.forEach((a) => { actorById[a.id] = `${a.first_name} ${a.last_name}`; });
    revisions.forEach((r) => {
      r.actorName = actorById[r.actor_user_id] || 'Unknown';
      r.parsed = JSON.parse(r.snapshot_json);
    });
    const returnTo = req.query.return && req.query.return.startsWith('/admin/') ? req.query.return : '/admin/courses';
    res.render('admin/revisions', {
      pageTitle: 'Version History | GDCU',
      adminActive: 'lms-courses',
      entityType: entity_type,
      entityId: Number(entity_id),
      revisions,
      returnTo,
    });
  } catch (err) { next(err); }
});

router.post('/revisions/:id/restore', async (req, res, next) => {
  try {
    const rev = await knex('content_revisions').where({ id: req.params.id }).first();
    const back = (req.body.return_to && req.body.return_to.startsWith('/admin/')) ? req.body.return_to : (req.get('referer') || '/admin/courses');
    if (!rev) { req.flash('error', 'Revision not found.'); return res.redirect(back); }
    const data = JSON.parse(rev.snapshot_json);

    if (rev.entity_type === 'quiz') {
      const existing = await knex('quizzes').where({ id: rev.entity_id }).first();
      const { id: _oldQuizId, ...quizFields } = data.quiz;
      let quizId;
      if (existing) {
        await knex('quizzes').where({ id: existing.id }).update(quizFields);
        quizId = existing.id;
        const oldQ = await knex('quiz_questions').where({ quiz_id: quizId }).pluck('id');
        if (oldQ.length) await knex('quiz_options').whereIn('question_id', oldQ).del();
        await knex('quiz_questions').where({ quiz_id: quizId }).del();
      } else {
        const [insertedId] = await knex('quizzes').insert(quizFields);
        quizId = insertedId;
      }
      for (const q of data.questions || []) {
        const { id: _oldQid, options, ...qFields } = q;
        const [newQid] = await knex('quiz_questions').insert({ ...qFields, quiz_id: quizId });
        for (const o of options || []) {
          const { id: _oldOid, question_id: _oldQuestionId, ...oFields } = o;
          await knex('quiz_options').insert({ ...oFields, question_id: newQid });
        }
      }
    } else {
      const table = REVISION_TABLES[rev.entity_type];
      if (!table) { req.flash('error', 'Unknown entity type.'); return res.redirect(back); }
      const { id: _oldId, ...fields } = data;
      const existing = await knex(table).where({ id: rev.entity_id }).first();
      if (existing) {
        await knex(table).where({ id: rev.entity_id }).update(fields);
      } else {
        await knex(table).insert(fields);
      }
    }

    await snapshot({ entityType: rev.entity_type, entityId: rev.entity_id, courseId: rev.course_id, action: 'restore', actorId: req.session.user.id, data });
    req.flash('success', 'Restored the selected version.');
    res.redirect(back);
  } catch (err) { next(err); }
});

// ─── Lesson materials ────────────────────────────────────────
router.post('/lessons/:lid/materials', async (req, res, next) => {
  try {
    if (req.body.label && req.body.url) {
      const lesson = await knex('lessons').where({ id: req.params.lid }).first();
      if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/admin' });
      const mod = await knex('modules').where({ id: lesson.module_id }).first();
      const max = await knex('lesson_materials').where({ lesson_id: lesson.id }).max({ m: 'sort_order' }).first();
      await knex('lesson_materials').insert({
        lesson_id: lesson.id, label: req.body.label, url: req.body.url,
        type: req.body.type || 'link', sort_order: (Number(max.m) || 0) + 1,
      });
      req.flash('success', 'Material added.');
      res.redirect(`/admin/courses/${mod.course_id}/modules#lesson-${lesson.id}`);
    }
    res.redirect('/admin/courses');
  } catch (err) { next(err); }
});

router.post('/materials/:id/delete', async (req, res, next) => {
  try {
    const mat = await knex('lesson_materials').where({ id: req.params.id }).first();
    if (!mat) return res.redirect('/admin/courses');
    const lesson = await knex('lessons').where({ id: mat.lesson_id }).first();
    const mod = lesson ? await knex('modules').where({ id: lesson.module_id }).first() : null;
    await knex('lesson_materials').where({ id: req.params.id }).del();
    req.flash('success', 'Material removed.');
    res.redirect(mod ? `/admin/courses/${mod.course_id}/modules#lesson-${lesson.id}` : '/admin/courses');
  } catch (err) { next(err); }
});

// ─── Essay grading ──────────────────────────────────────────
router.get('/essays', async (req, res, next) => {
  try {
    const essays = await knex('essay_submissions')
      .join('modules', 'essay_submissions.module_id', 'modules.id')
      .join('users', 'essay_submissions.user_id', 'users.id')
      .select('essay_submissions.*', 'modules.title as module_title', 'users.first_name', 'users.last_name', 'users.email')
      .orderBy('essay_submissions.submitted_at', 'desc');
    res.render('admin/essays', {
      pageTitle: 'Essay Submissions | GDCU',
      adminActive: 'essays',
      essays,
    });
  } catch (err) { next(err); }
});

router.post('/essays/:id/grade', async (req, res, next) => {
  try {
    await knex('essay_submissions').where({ id: req.params.id }).update({
      score: req.body.score || null,
      feedback: req.body.feedback || null,
      status: 'graded',
      graded_at: knex.fn.now(),
    });
    req.flash('success', 'Essay graded.');
    res.redirect('/admin/essays');
  } catch (err) { next(err); }
});

// ─── Shared Module Attach / Detach ──────────────────────

/** POST /admin/courses/:id/modules/attach — Attach shared module to a course */
router.post('/courses/:id/modules/attach', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });

    const sharedModuleId = parseInt(req.body.shared_module_id, 10);
    const sm = await knex('shared_modules').where({ id: sharedModuleId }).first();
    if (!sm) {
      req.flash('error', 'Module not found.');
      return res.redirect(`/admin/courses/${req.params.id}/modules`);
    }

    // Check if already attached
    const existing = await knex('course_shared_modules')
      .where({ course_id: course.id, shared_module_id: sharedModuleId })
      .first();
    if (existing) {
      req.flash('info', `"${sm.title}" is already attached to this course.`);
    } else {
      // Do NOT clone the module/lessons/materials — the entire point of a
      // shared module is that every course reads the same template `modules`
      // row (via shared_module_id), so editing it once updates it everywhere.
      // Cloning here used to create a second `modules` row with the same
      // shared_module_id, breaking that single-source model and making the
      // course-modules queries elsewhere (which key template rows by
      // shared_module_id) pick whichever row happened to come back last.
      const templateModule = await knex('modules').where({ shared_module_id: sm.id }).first();

      // Quizzes ARE meant to be one copy per course (each course's students
      // need their own quiz_attempts scope), matching how shared-module
      // quizzes are queried everywhere else — `where({ module_id, course_id })`.
      // Clone the existing quiz set (from any course already using this
      // module) onto the new course, still pointing at the one template module.
      if (templateModule) {
        const templateQuizzes = await knex('quizzes').where({ module_id: templateModule.id });
        for (const q of templateQuizzes) {
          const { id: _qid, course_id: _cid, ...quizData } = q;
          const [newQuizId] = await knex('quizzes').insert({
            ...quizData,
            course_id: course.id,
            module_id: templateModule.id,
          });

          const questions = await knex('quiz_questions').where({ quiz_id: q.id }).orderBy('sort_order');
          for (const qq of questions) {
            const { id: _qqid, ...qqData } = qq;
            const [newQqId] = await knex('quiz_questions').insert({
              ...qqData,
              quiz_id: newQuizId,
            });
            const options = await knex('quiz_options').where({ question_id: qq.id }).orderBy('sort_order');
            for (const opt of options) {
              const { id: _oid, ...optData } = opt;
              await knex('quiz_options').insert({
                ...optData,
                question_id: newQqId,
              });
            }
          }
        }
      }

      // Create junction
      const maxSort = await knex('course_shared_modules').where({ course_id: course.id }).max('sort_order as m').first();
      await knex('course_shared_modules').insert({
        course_id: course.id,
        shared_module_id: sharedModuleId,
        sort_order: (maxSort.m || 0) + 1,
      });

      req.flash('success', `"${sm.title}" has been attached to this course. Its lessons stay shared with every other course using it — edit them once from the Module Library and every course sees the update.`);
    }

    if (req.body.stay === '1') {
      res.redirect(`/admin/course-library?for_course=${course.id}`);
    } else {
      res.redirect(`/admin/courses/${course.id}/modules`);
    }
  } catch (err) { next(err); }
});

/** POST /admin/courses/:id/modules/detach/:smId — Detach shared module from a course */
router.post('/courses/:id/modules/detach/:smId', async (req, res, next) => {
  try {
    await knex('course_shared_modules')
      .where({ course_id: req.params.id, shared_module_id: req.params.smId })
      .del();

    // Clean up this course's own quiz copies for the shared module (lessons/
    // materials are never per-course for a shared module — nothing to delete
    // there; the template `modules` row and its content stay untouched for
    // every other course still using it).
    const templateModule = await knex('modules')
      .where({ shared_module_id: req.params.smId })
      .first();
    if (templateModule) {
      const courseQuizzes = await knex('quizzes')
        .where({ module_id: templateModule.id, course_id: req.params.id })
        .pluck('id');
      if (courseQuizzes.length) {
        const questionIds = await knex('quiz_questions').whereIn('quiz_id', courseQuizzes).pluck('id');
        if (questionIds.length) await knex('quiz_options').whereIn('question_id', questionIds).del();
        await knex('quiz_questions').whereIn('quiz_id', courseQuizzes).del();
        await knex('quizzes').whereIn('id', courseQuizzes).del();
      }
    }

    // Legacy cleanup: older attach clones (pre-fix) left behind a per-course
    // `modules` row sharing this shared_module_id — remove it if present.
    const clonedModule = await knex('modules')
      .where({ course_id: req.params.id, shared_module_id: req.params.smId })
      .first();
    if (clonedModule) {
      const lessons = await knex('lessons').where({ module_id: clonedModule.id }).pluck('id');
      if (lessons.length) {
        await knex('lesson_materials').whereIn('lesson_id', lessons).del();
        await knex('lessons').whereIn('id', lessons).del();
      }
      await knex('quizzes').where({ module_id: clonedModule.id }).del();
      await knex('modules').where({ id: clonedModule.id }).del();
    }

    req.flash('success', 'Module detached from this course.');
    res.redirect(`/admin/courses/${req.params.id}/modules`);
  } catch (err) { next(err); }
});

// ─── Course discussion forum management ─────────────────────

// List forums for a course
router.get('/courses/:id/forums', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });
    const forums = await knex('course_forums').where({ course_id: course.id }).orderBy('sort_order');
    for (const f of forums) {
      f.topicCount = Number((await knex('forum_topics').where({ forum_id: f.id }).count({ c: '*' }).first()).c);
    }
    res.render('admin/course-forums', {
      pageTitle: `Forums — ${course.title} | GDCU`,
      adminActive: 'lms-courses',
      course,
      forums,
    });
  } catch (err) { next(err); }
});

// Create a forum
router.post('/courses/:id/forums', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.redirect('/admin/courses');
    const title = (req.body.title || '').trim();
    if (!title) { req.flash('error', 'Forum title is required.'); return res.redirect(`/admin/courses/${course.id}/forums`); }
    const maxSort = await knex('course_forums').where({ course_id: course.id }).max('sort_order as m').first();
    await knex('course_forums').insert({
      course_id: course.id,
      title,
      description: (req.body.description || '').trim() || null,
      sort_order: (maxSort.m || 0) + 1,
      published: req.body.published === 'on',
    });
    req.flash('success', 'Forum created.');
    res.redirect(`/admin/courses/${course.id}/forums`);
  } catch (err) { next(err); }
});

// Update a forum
router.post('/courses/:id/forums/:forumId', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.redirect('/admin/courses');
    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id }).first();
    if (!forum) return res.redirect(`/admin/courses/${course.id}/forums`);
    const title = (req.body.title || '').trim();
    if (!title) { req.flash('error', 'Forum title is required.'); return res.redirect(`/admin/courses/${course.id}/forums`); }
    await knex('course_forums').where({ id: forum.id }).update({
      title,
      description: (req.body.description || '').trim() || null,
      sort_order: Number(req.body.sort_order) || forum.sort_order,
      published: req.body.published === 'on',
      updated_at: knex.fn.now(),
    });
    req.flash('success', 'Forum updated.');
    res.redirect(`/admin/courses/${course.id}/forums`);
  } catch (err) { next(err); }
});

// Delete a forum (and all its topics/replies via CASCADE)
router.post('/courses/:id/forums/:forumId/delete', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!course) return res.redirect('/admin/courses');
    await knex('course_forums').where({ id: req.params.forumId, course_id: course.id }).del();
    req.flash('success', 'Forum deleted.');
    res.redirect(`/admin/courses/${course.id}/forums`);
  } catch (err) { next(err); }
});

module.exports = router;

