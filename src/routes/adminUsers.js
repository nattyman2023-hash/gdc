/**
 * User & Staff administration — admin only.
 * Create/edit faculty, staff and admin accounts, reset passwords,
 * and activate/deactivate users. Mounted at /admin/users.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const knex = require('../config/db');
const { requireRole } = require('../middleware/auth');
const attendance = require('../lib/attendance');
const profiles = require('../lib/profiles');
const { email: sendEmail } = require('../lib/notify');
const emailit = require('../lib/emailit');
const programmes = require('../lib/programmes');

const router = express.Router();

router.use(requireRole('staff', 'admin'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.adminActive = 'users';
  next();
});

const ROLES = ['student', 'faculty', 'staff', 'admin'];

// Which roles the current actor may assign/manage.
// Admins manage everyone; staff may manage students and faculty only.
function assignableRoles(actor) {
  return actor.role === 'admin' ? ROLES : ['student', 'faculty'];
}
function canManageRole(actor, role) {
  return assignableRoles(actor).includes(role);
}

// List
router.get('/', async (req, res, next) => {
  try {
    const { role, q, status } = req.query;
    const query = knex('users');
    if (role) query.where('role', role);
    if (status) query.where('status', status);
    if (q) query.where((b) => b.whereILike('first_name', `%${q}%`).orWhereILike('last_name', `%${q}%`).orWhereILike('email', `%${q}%`));
    const users = await query.orderBy('role').orderBy('last_name');

    // Enrich each row with light, useful data.
    const enrollCounts = {};
    (await knex('enrollments').select('user_id').count({ c: '*' }).groupBy('user_id')).forEach((r) => { enrollCounts[r.user_id] = Number(r.c); });
    users.forEach((u) => {
      u.enrollments = enrollCounts[u.id] || 0;
      if (u.role === 'student') u.engagement = attendance.engagementFor(u);
    });

    // Counts for the filter chips.
    const roleRows = await knex('users').select('role').count({ c: '*' }).groupBy('role');
    const roleCounts = {}; roleRows.forEach((r) => { roleCounts[r.role] = Number(r.c); });
    const total = users.length;

    res.render('admin/users/list', {
      pageTitle: 'Staff & Users | GDCU CRM',
      adminActive: 'users',
      users,
      roles: ROLES,
      roleCounts,
      total,
      filters: { role: role || '', q: q || '', status: status || '' },
    });
  } catch (err) { next(err); }
});

// Quick-view drawer (role-aware, rich)
router.get('/:id/drawer', async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).send('<div class="p-8 text-on-surface-variant">User not found.</div>');
    const data = { canManage: canManageRole(req.session.user, user.role), isSelf: user.id === req.session.user.id };
    data.profile = await profiles.getProfile(user.role, user.id);

    if (user.role === 'student') {
      data.engagement = attendance.engagementFor(user);
      data.enrollments = await knex('enrollments')
        .join('courses', 'enrollments.course_id', 'courses.id')
        .where('enrollments.user_id', user.id)
        .select('courses.title as course_title', 'enrollments.progress_pct', 'enrollments.status');
      data.certificates = Number((await knex('certificates').where({ user_id: user.id }).count({ c: '*' }).first()).c);
      const outRow = await knex('invoices').where({ user_id: user.id }).whereIn('status', ['sent', 'overdue']).sum({ s: 'amount' }).first();
      data.outstanding = Number(outRow.s || 0);
      data.formationGroup = await knex('formation_members')
        .join('formation_groups', 'formation_members.group_id', 'formation_groups.id')
        .where('formation_members.student_id', user.id)
        .select('formation_groups.id', 'formation_groups.name').first();
    } else if (user.role === 'faculty') {
      data.courses = await knex('courses').where({ instructor_id: user.id }).select('id', 'title');
      data.interviewsHosted = Number((await knex('interviews').where({ interviewer_id: user.id }).count({ c: '*' }).first()).c);
      data.officeSlots = (await knex.schema.hasTable('interview_slots')) ? Number((await knex('interview_slots').where({ interviewer_id: user.id }).count({ c: '*' }).first()).c) : 0;
    }
    res.render('admin/users/_drawer', { layout: false, user, ...data });
  } catch (err) { next(err); }
});

// New form (optionally pre-select a role via ?role=faculty)
router.get('/new', async (req, res, next) => {
  try {
    const allowed = assignableRoles(req.session.user);
    const role = allowed.includes(req.query.role) ? req.query.role : 'faculty';
    const courses = await knex('courses').where({ published: true }).orderBy('title').select('id', 'title');
    res.render('admin/users/form', {
      pageTitle: 'New User | GDCU CRM',
      adminActive: 'users',
      user: { role, status: 'active' },
      roles: allowed,
      courses,
      isNew: true,
      errors: {},
    });
  } catch (err) { next(err); }
});

// Create
router.post(
  '/',
  [
    body('first_name').trim().notEmpty(),
    body('last_name').trim().notEmpty(),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('role').isIn(ROLES),
  ],
  async (req, res, next) => {
    try {
      const allowed = assignableRoles(req.session.user);
      const result = validationResult(req);
      const renderForm = (errors) =>
        res.status(422).render('admin/users/form', {
          pageTitle: 'New User | GDCU CRM', adminActive: 'users',
          user: req.body, roles: allowed, isNew: true, errors,
        });

      if (!result.isEmpty()) {
        const errors = {};
        for (const e of result.array()) errors[e.path] = e.msg;
        return renderForm(errors);
      }
      if (!canManageRole(req.session.user, req.body.role)) {
        return renderForm({ role: 'You are not permitted to create a user with that role.' });
      }
      const existing = await knex('users').where({ email: req.body.email }).first();
      if (existing) return renderForm({ email: 'A user with that email already exists.' });

      const hash = await bcrypt.hash(req.body.password, 12);
      const [newIdRaw] = await knex('users').insert({
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email: req.body.email,
        password_hash: hash,
        role: req.body.role,
        status: req.body.status === 'inactive' ? 'inactive' : 'active',
      });
      const newId = Array.isArray(newIdRaw) ? newIdRaw[0] : newIdRaw;
      sendEmail({
        to: req.body.email,
        toName: `${req.body.first_name} ${req.body.last_name}`,
        subject: 'Your GDCU account is ready',
        heading: 'Welcome to GDCU',
        bodyHtml: `<p>Dear ${req.body.first_name},</p><p>An account has been created for you at Global Diaspora Christian University as <strong>${req.body.role}</strong>.</p><p>Your temporary password is <strong>${req.body.password}</strong> (please change it after signing in).</p><p><a href="${process.env.APP_URL || ''}/login" style="color:#b8861b">Sign in to your account</a></p>`,
      });
      let flashMsg = `${req.body.role} account created for ${req.body.email}.`;
      if (req.body.role === 'student') {
        emailit.upsertContact({ email: req.body.email, firstName: req.body.first_name, lastName: req.body.last_name, tags: ['student'] }).catch(() => {});
        // Optional one-step enrolment — an admin's informed decision, so this
        // bypasses the application requirement students self-enrolling would
        // otherwise hit for Bachelor/Master/Doctorate courses.
        if (req.body.enroll_course_id) {
          const course = await knex('courses').where({ id: req.body.enroll_course_id, published: true }).first();
          if (course) {
            await knex('enrollments').insert({ user_id: newId, course_id: course.id, status: 'active', progress_pct: 0 });
            await programmes.ensureTuitionInvoice(course.program_id, newId, req.session.user.id);
            flashMsg += ` Enrolled in ${course.title}, with a tuition invoice raised.`;
          }
        }
      }
      req.flash('success', flashMsg);
      res.redirect('/admin/users');
    } catch (err) { next(err); }
  }
);

// Edit form
router.get('/:id/edit', async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/admin' });
    if (!canManageRole(req.session.user, user.role)) {
      req.flash('error', 'You do not have permission to edit that account.');
      return res.redirect('/admin/users');
    }
    const profile = await profiles.getProfile(user.role, user.id);
    const programs = await knex('programs').orderBy('sort_order').select('id', 'title');
    res.render('admin/users/form', {
      pageTitle: 'Edit User | GDCU CRM', adminActive: 'users',
      user, roles: assignableRoles(req.session.user), isNew: false, errors: {},
      profile, programs,
    });
  } catch (err) { next(err); }
});

// Save the role-specific profile for a user.
router.post('/:id/profile', async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user) return res.redirect('/admin/users');
    if (!canManageRole(req.session.user, user.role)) {
      req.flash('error', 'You do not have permission to edit that account.');
      return res.redirect('/admin/users');
    }
    await profiles.upsertProfile(user.role, user.id, req.body);
    req.flash('success', 'Profile updated.');
    res.redirect(`/admin/users/${user.id}/edit`);
  } catch (err) { next(err); }
});

// Update (name, role, status) — guards against self role/status change lockout
router.post('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await knex('users').where({ id }).first();
    if (!user) return res.redirect('/admin/users');
    if (!canManageRole(req.session.user, user.role)) {
      req.flash('error', 'You do not have permission to edit that account.');
      return res.redirect('/admin/users');
    }

    const update = {
      first_name: req.body.first_name || user.first_name,
      last_name: req.body.last_name || user.last_name,
      updated_at: knex.fn.now(),
    };
    // Don't let a user demote or deactivate their own account by accident.
    if (id === req.session.user.id) {
      req.flash('info', 'Your name was updated. Role and status changes to your own account are disabled here.');
    } else {
      if (canManageRole(req.session.user, req.body.role)) update.role = req.body.role;
      update.status = req.body.status === 'inactive' ? 'inactive' : 'active';
    }
    await knex('users').where({ id }).update(update);
    req.flash('success', 'User updated.');
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

// Reset password
router.post('/:id/password', async (req, res, next) => {
  try {
    const target = await knex('users').where({ id: req.params.id }).first();
    if (!target || !canManageRole(req.session.user, target.role)) {
      req.flash('error', 'You do not have permission to manage that account.');
      return res.redirect('/admin/users');
    }
    const password = req.body.password || '';
    if (password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters.');
      return res.redirect(`/admin/users/${req.params.id}/edit`);
    }
    const hash = await bcrypt.hash(password, 12);
    await knex('users').where({ id: req.params.id }).update({ password_hash: hash, updated_at: knex.fn.now() });
    sendEmail({
      to: target.email,
      toName: `${target.first_name} ${target.last_name}`,
      subject: 'Your GDCU password was changed',
      heading: 'Password changed',
      bodyHtml: `<p>Dear ${target.first_name},</p><p>Your GDCU account password was just changed by an administrator. If you did not expect this, please contact us immediately.</p>`,
      relatedType: 'user',
      relatedId: target.id,
    });
    req.flash('success', 'Password reset.');
    res.redirect(`/admin/users/${req.params.id}/edit`);
  } catch (err) { next(err); }
});

// Toggle active/inactive (cannot deactivate self)
router.post('/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.session.user.id) {
      req.flash('error', 'You cannot change the status of your own account.');
      return res.redirect('/admin/users');
    }
    const user = await knex('users').where({ id }).first();
    if (user && !canManageRole(req.session.user, user.role)) {
      req.flash('error', 'You do not have permission to manage that account.');
      return res.redirect('/admin/users');
    }
    if (user) {
      const next = user.status === 'active' ? 'inactive' : 'active';
      await knex('users').where({ id }).update({ status: next, updated_at: knex.fn.now() });
      req.flash('success', `User ${next === 'active' ? 'reactivated' : 'deactivated'}.`);
    }
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

// Hard delete a user (guards: not self; actor may manage the role)
router.post('/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.session.user.id) {
      req.flash('error', 'You cannot delete your own account.');
      return res.redirect('/admin/users');
    }
    const user = await knex('users').where({ id }).first();
    if (!user) return res.redirect('/admin/users');
    if (!canManageRole(req.session.user, user.role)) {
      req.flash('error', 'You do not have permission to delete that account.');
      return res.redirect('/admin/users');
    }
    await knex('users').where({ id }).del();
    req.flash('success', 'User deleted.');
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

module.exports = router;
