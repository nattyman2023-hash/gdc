/**
 * Academic programs: catalogue listing + individual program detail.
 */
const express = require('express');
const knex = require('../config/db');

const router = express.Router();

// Catalogue with optional ?level= and ?school= filters
router.get('/', async (req, res, next) => {
  try {
    const { level, school, q } = req.query;
    const query = knex('programs').where({ published: true });
    if (level) query.where('level', level);
    if (school) query.where('school', school);
    if (q) {
      query.where((b) =>
        b.whereILike('title', `%${q}%`).orWhereILike('summary', `%${q}%`)
      );
    }
    const programs = await query.orderBy('sort_order');

    const levels = await knex('programs').where({ published: true }).distinct('level').pluck('level');
    const schools = await knex('programs').where({ published: true }).distinct('school').pluck('school');

    res.render('public/programs', {
      pageTitle: 'Academic Programs | GDCU',
      programs,
      levels,
      schools,
      filters: { level: level || '', school: school || '', q: q || '' },
    });
  } catch (err) {
    next(err);
  }
});

// Program detail
router.get('/:slug', async (req, res, next) => {
  try {
    const program = await knex('programs').where({ slug: req.params.slug, published: true }).first();
    if (!program) {
      return res.status(404).render('errors/404', { pageTitle: 'Program not found' });
    }
    const related = await knex('programs')
      .where({ published: true, school: program.school })
      .whereNot('id', program.id)
      .limit(3);
    res.render('public/program-detail', {
      pageTitle: `${program.title} | GDCU`,
      metaDescription: program.summary,
      program,
      related,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
