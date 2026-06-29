/**
 * Shared in-app notifications (any authenticated user).
 */
const express = require('express');
const knex = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function layoutForRole(role) {
  if (role === 'student') return 'layouts/portal';
  if (role === 'faculty') return 'layouts/faculty';
  return 'layouts/admin';
}

// Full list page
router.get('/', async (req, res, next) => {
  try {
    const notifications = await knex('notifications')
      .where({ user_id: req.session.user.id })
      .orderBy('created_at', 'desc')
      .limit(100);
    res.render('notifications', {
      pageTitle: 'Notifications | GDCU',
      layout: layoutForRole(req.session.user.role),
      portalActive: '', facultyActive: '', adminActive: '',
      notifications,
    });
  } catch (err) { next(err); }
});

// Open a notification: mark read, go to its link
router.get('/go/:id', async (req, res, next) => {
  try {
    const n = await knex('notifications').where({ id: req.params.id, user_id: req.session.user.id }).first();
    if (!n) return res.redirect('/notifications');
    await knex('notifications').where({ id: n.id }).update({ read: true });
    res.redirect(n.link && n.link.startsWith('/') ? n.link : '/notifications');
  } catch (err) { next(err); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await knex('notifications').where({ user_id: req.session.user.id, read: false }).update({ read: true });
    res.redirect(req.get('referer') || '/notifications');
  } catch (err) { next(err); }
});

module.exports = router;
