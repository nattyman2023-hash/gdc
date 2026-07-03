/**
 * Academic programs: catalogue listing + individual program detail.
 */
const express = require('express');
const knex = require('../config/db');
const { programmeExtras } = require('../lib/programmeInfo');

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

    // Curriculum: this programme's courses and the modules within them.
    // Modules reach a course via the legacy 1:1 link (modules.course_id) or,
    // for most courses, the shared-module system (course_shared_modules ->
    // a template row in `modules` reused across many courses) — check both,
    // the same way the LMS resolves a course's structure for students.
    const courses = await knex('courses').where({ program_id: program.id }).orderBy('sort_order');
    let curriculum = [];
    if (courses.length) {
      const courseIds = courses.map((c) => c.id);
      const legacyModules = await knex('modules').whereIn('course_id', courseIds).orderBy(['course_id', 'sort_order']);
      const sharedLinks = await knex('course_shared_modules').whereIn('course_id', courseIds).orderBy('sort_order');
      const sharedModuleIds = [...new Set(sharedLinks.map((l) => l.shared_module_id))];
      const sharedModules = sharedModuleIds.length
        ? await knex('modules').whereIn('shared_module_id', sharedModuleIds)
        : [];
      const bySmId = {};
      sharedModules.forEach((m) => { bySmId[m.shared_module_id] = m; });

      curriculum = courses.map((c) => {
        const ownShared = sharedLinks.filter((l) => l.course_id === c.id).map((l) => bySmId[l.shared_module_id]).filter(Boolean);
        const ownLegacy = legacyModules.filter((m) => m.course_id === c.id);
        return { ...c, modules: ownShared.length ? ownShared : ownLegacy };
      });
    }

    const { entryRequirements, careers } = programmeExtras(program);

    res.render('public/program-detail', {
      pageTitle: `${program.title} | GDCU`,
      metaDescription: program.summary,
      program,
      related,
      curriculum,
      entryRequirements,
      careers,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
