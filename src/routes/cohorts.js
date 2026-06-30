/**
 * Cohorts API routes. Admin manages cohorts, students see their cohorts.
 */
const express = require('express');
const router = express.Router();
const knex = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Student views their cohorts
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cohorts = await knex('cohorts')
      .join('cohort_members', 'cohort_members.cohort_id', 'cohorts.id')
      .join('courses', 'courses.id', 'cohorts.course_id')
      .where('cohort_members.user_id', userId)
      .select('cohorts.*', 'courses.title as course_title', 'courses.slug as course_slug')
      .orderBy('cohorts.year', 'desc');

    // Count members per cohort
    const cohortsWithCounts = await Promise.all(cohorts.map(async (c) => {
      const count = await knex('cohort_members').where('cohort_id', c.id).count('* as cnt').first();
      return { ...c, member_count: count.cnt };
    }));

    res.json({ cohorts: cohortsWithCounts });
  } catch (err) {
    console.error('Cohorts error:', err);
    res.status(500).json({ error: 'Failed to load cohorts' });
  }
});

// Get cohort members (for chat)
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const members = await knex('cohort_members')
      .join('users', 'users.id', 'cohort_members.user_id')
      .where('cohort_members.cohort_id', req.params.id)
      .select('users.id', 'users.first_name', 'users.last_name', 'users.photo_url', 'users.country', 'cohort_members.role')
      .orderBy('users.first_name');

    res.json({ members });
  } catch (err) {
    console.error('Cohort members error:', err);
    res.status(500).json({ error: 'Failed to load members' });
  }
});

module.exports = router;
