/**
 * Admin Preview Routes — let staff view courses and lessons exactly as a student would.
 * Mounted at /admin/preview
 */
const express = require('express');
const knex = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { getCourseStructure, getBlockedCurriculum } = require('../lib/lms');

const router = express.Router();

// All preview routes require staff/admin role
router.use(requireRole('staff', 'admin'));

/**
 * GET /admin/preview/courses/:slug
 * Shows the course curriculum page as a student sees it.
 */
router.get('/courses/:slug', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ slug: req.params.slug }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });

    const structure = await getCourseStructure(course.id);
    const allQuizzes = await knex('quizzes')
      .where({ course_id: course.id, published: true })
      .orderBy('sort_order');
    const quizzes = allQuizzes.filter((q) => !q.is_final_exam);
    const finalExam = allQuizzes.find((q) => q.is_final_exam) || null;
    const instructor = course.instructor_id
      ? await knex('users').where({ id: course.instructor_id }).first()
      : null;
    const moduleAssignments = await knex('assignments')
      .where({ course_id: course.id, published: true })
      .whereNotNull('module_id')
      .orderBy('sort_order');
    for (const m of structure) {
      m.assignments = moduleAssignments.filter((a) => a.module_id === m.id);
    }
    const assignments = await knex('assignments')
      .where({ course_id: course.id, published: true })
      .whereNull('module_id')
      .orderBy('created_at', 'desc');
    const usesBlocks = structure.some((m) => m.lessons.some((l) => l.block_no));
    const curriculum = usesBlocks ? await getBlockedCurriculum(null, structure, course) : null;

    res.render('portal/course', {
      pageTitle: `[PREVIEW] ${course.title} | GDCU Admin`,
      layout: false,
      portalActive: 'courses',
      course,
      enrollment: { progress_pct: 0, status: 'active' },
      structure,
      curriculum,
      continueTo: null,
      quizzes,
      finalExam,
      finalExamUnlocked: true,
      finalExamPassed: false,
      instructor,
      assignments,
      isPreview: true,
    });
  } catch (err) { next(err); }
});

/**
 * GET /admin/preview/courses/:slug/lessons/:lessonId
 * Shows a lesson page as a student would see it.
 */
router.get('/courses/:slug/lessons/:lessonId', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ slug: req.params.slug }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/admin' });

    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .select('lessons.*', 'modules.title as module_title')
      .first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/admin' });

    const structure = await getCourseStructure(course.id);
    const flat = [];
    structure.forEach((m) => m.lessons.forEach((l) => flat.push(l)));
    const idx = flat.findIndex((l) => l.id === lesson.id);
    const prev = idx > 0 ? flat[idx - 1] : null;
    const next = idx < flat.length - 1 ? flat[idx + 1] : null;
    const materials = await knex('lesson_materials').where({ lesson_id: lesson.id }).orderBy('sort_order');

    res.render('portal/lesson', {
      pageTitle: `[PREVIEW] ${lesson.title} | GDCU Admin`,
      layout: false,
      portalActive: 'courses',
      course,
      enrollment: { progress_pct: 0, status: 'active', id: 0 },
      lesson,
      structure,
      completed: false,
      prev,
      next,
      materials,
      comments: [],
      note: null,
      isPreview: true,
    });
  } catch (err) { next(err); }
});

module.exports = router;