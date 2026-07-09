/**
 * Admin Faculty & Staff management.
 * Superadmin/admin/faculty_manager can manage faculty profiles.
 * Once added here, active profiles appear on the public About page.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

const knex = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { pageInfo, slugify } = require('../lib/helpers');

const router = express.Router();

// Image upload config
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'faculty');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// All routes require faculty management permission
router.use(requirePermission('manage_faculty'));

/**
 * GET /admin/faculty — list all faculty/staff
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const { perPage } = pageInfo(req);
    const offset = (page - 1) * perPage;

    const [{ count }] = await knex('faculty_staff').count('* as count');
    const faculty = await knex('faculty_staff')
      .orderBy('display_order')
      .orderBy('last_name')
      .limit(perPage)
      .offset(offset);

    res.render('admin/faculty', {
      pageTitle: 'Faculty & Staff | GDCU Admin',
      layout: 'layouts/admin',
      faculty,
      page,
      totalPages: Math.ceil(count / perPage),
      currentPath: req.path,
    });
  } catch (err) { next(err); }
});

/**
 * GET /admin/faculty/new — add form
 */
router.get('/new', (req, res) => {
  res.render('admin/faculty-edit', {
    pageTitle: 'Add Faculty | GDCU Admin',
    layout: 'layouts/admin',
    f: {},
    errors: [],
    isNew: true,
    currentPath: req.path,
  });
});

/**
 * POST /admin/faculty/new — create
 */
router.post('/new', upload.single('photo'), [
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
], async (req, res, next) => {
  try {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.render('admin/faculty-edit', {
        pageTitle: 'Add Faculty | GDCU Admin',
        layout: 'layouts/admin',
        f: req.body,
        errors: result.array(),
        isNew: true,
        currentPath: req.path,
      });
    }

    const data = {
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      title: req.body.title || null,
      role: req.body.role || null,
      department: req.body.department || null,
      biography: req.body.biography || null,
      email: req.body.email || null,
      phone: req.body.phone || null,
      display_order: parseInt(req.body.display_order, 10) || 0,
      status: req.body.status || 'active',
      category: req.body.category || 'faculty',
    };

    if (req.file) {
      data.photo_url = `/uploads/faculty/${req.file.filename}`;
    }

    await knex('faculty_staff').insert(data);
    req.flash('success', `${data.first_name} ${data.last_name} has been added.`);
    res.redirect('/admin/faculty');
  } catch (err) { next(err); }
});

/**
 * GET /admin/faculty/:id/edit — edit form
 */
router.get('/:id/edit', async (req, res, next) => {
  try {
    const f = await knex('faculty_staff').where({ id: req.params.id }).first();
    if (!f) return res.status(404).render('errors/404', { pageTitle: 'Not found' });

    res.render('admin/faculty-edit', {
      pageTitle: `Edit ${f.first_name} ${f.last_name} | GDCU Admin`,
      layout: 'layouts/admin',
      f,
      errors: [],
      isNew: false,
      currentPath: req.path,
    });
  } catch (err) { next(err); }
});

/**
 * POST /admin/faculty/:id/edit — update
 */
router.post('/:id/edit', upload.single('photo'), [
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
], async (req, res, next) => {
  try {
    const f = await knex('faculty_staff').where({ id: req.params.id }).first();
    if (!f) return res.status(404).render('errors/404', { pageTitle: 'Not found' });

    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.render('admin/faculty-edit', {
        pageTitle: `Edit ${f.first_name} ${f.last_name} | GDCU Admin`,
        layout: 'layouts/admin',
        f: { ...f, ...req.body },
        errors: result.array(),
        isNew: false,
        currentPath: req.path,
      });
    }

    const data = {
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      title: req.body.title || null,
      role: req.body.role || null,
      department: req.body.department || null,
      biography: req.body.biography || null,
      email: req.body.email || null,
      phone: req.body.phone || null,
      display_order: parseInt(req.body.display_order, 10) || 0,
      status: req.body.status || 'inactive',
      category: req.body.category || 'faculty',
    };

    if (req.file) {
      data.photo_url = `/uploads/faculty/${req.file.filename}`;
      // Delete old photo if exists
      if (f.photo_url) {
        const oldPath = path.join(__dirname, '..', '..', 'public', f.photo_url);
        fs.unlink(oldPath, () => {});
      }
    }

    await knex('faculty_staff').where({ id: req.params.id }).update(data);
    req.flash('success', `${data.first_name} ${data.last_name} has been updated.`);
    res.redirect('/admin/faculty');
  } catch (err) { next(err); }
});

/**
 * POST /admin/faculty/:id/toggle — toggle active/inactive
 */
router.post('/:id/toggle', async (req, res, next) => {
  try {
    const f = await knex('faculty_staff').where({ id: req.params.id }).first();
    if (!f) return res.status(404).json({ error: 'Not found' });
    const newStatus = f.status === 'active' ? 'inactive' : 'active';
    await knex('faculty_staff').where({ id: req.params.id }).update({ status: newStatus });
    req.flash('success', `${f.first_name} ${f.last_name} is now ${newStatus}.`);
    res.redirect('/admin/faculty');
  } catch (err) { next(err); }
});

/**
 * POST /admin/faculty/:id/delete — delete (superadmin only)
 */
router.post('/:id/delete', requirePermission('manage_admins'), async (req, res, next) => {
  try {
    const f = await knex('faculty_staff').where({ id: req.params.id }).first();
    if (!f) return res.status(404).json({ error: 'Not found' });
    // Delete photo
    if (f.photo_url) {
      const p = path.join(__dirname, '..', '..', 'public', f.photo_url);
      fs.unlink(p, () => {});
    }
    await knex('faculty_staff').where({ id: req.params.id }).del();
    req.flash('success', `${f.first_name} ${f.last_name} has been removed.`);
    res.redirect('/admin/faculty');
  } catch (err) { next(err); }
});

module.exports = router;