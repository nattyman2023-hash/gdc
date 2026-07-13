/**
 * Student LMS portal. All routes require an authenticated user.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const knex = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { recalcProgress, getCourseStructure, isLessonAvailable, isQuizAvailable, completeLessonWithDrip, getModuleEssayStatus, submitEssay, getBlockedCurriculum } = require('../lib/lms');
const { makeReference } = require('../lib/helpers');
const { getStripe } = require('../lib/stripe');
const { notifyUser, notifyRoles } = require('../lib/notify');
const programmes = require('../lib/programmes');
const profiles = require('../lib/profiles');
const { afterApplicationSubmitted } = require('../lib/admissionsFlow');
const achievements = require('../lib/achievements');

const router = express.Router();

// Everything here is behind auth and uses the portal layout.
router.use(requireAuth);
router.use((req, res, next) => {
  res.locals.layout = 'layouts/portal';
  res.locals.portalActive = '';
  next();
});

// Helper: find a student's enrollment for a course slug.
async function findEnrollment(userId, slug) {
  const course = await knex('courses').where({ slug, published: true }).first();
  if (!course) return { course: null, enrollment: null };
  const enrollment = await knex('enrollments')
    .where({ user_id: userId, course_id: course.id })
    .whereIn('status', ['active', 'completed'])
    .first();
  return { course, enrollment };
}

async function sharedModuleIdsForCourse(courseId) {
  return knex('course_shared_modules').where({ course_id: courseId }).pluck('shared_module_id');
}

// ─── Dashboard ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', userId)
      .whereIn('enrollments.status', ['active', 'completed'])
      .select(
        'enrollments.*',
        'courses.title as course_title',
        'courses.slug as course_slug',
        'courses.code as course_code',
        'courses.icon as course_icon',
        'courses.featured_image'
      )
      .orderBy('enrollments.enrolled_at', 'desc');

    const courseIds = enrollments.map((e) => e.course_id);
    const announcements = await knex('announcements')
      .where(function () {
        this.whereNull('course_id');
        if (courseIds.length) this.orWhereIn('course_id', courseIds);
      })
      .orderBy('published_at', 'desc')
      .limit(5);

    const certificates = await knex('certificates').where({ user_id: userId }).orderBy('issued_at', 'desc');

    const outRow = await knex('invoices')
      .where({ user_id: userId })
      .whereIn('status', ['sent', 'overdue'])
      .sum({ s: 'amount' })
      .first();
    const outstanding = Number(outRow.s || 0);

    // Check streak milestones on dashboard view (fire-and-forget)
    achievements.checkStreakMilestones(userId).catch(() => {});

    const streak = await achievements.getCurrentStreak(userId);
    const recentAchievements = (await achievements.getUserAchievements(userId)).slice(0, 3);

    res.render('portal/dashboard', {
      pageTitle: 'Student Workspace | GDCU',
      portalActive: 'dashboard',
      enrollments,
      announcements,
      certificates,
      outstanding,
      streak,
      recentAchievements,
    });
  } catch (err) {
    next(err);
  }
});

// ─── My Courses (enrolled only) ──────────────────────────────
router.get('/courses', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', userId)
      .whereIn('enrollments.status', ['active', 'completed'])
      .select(
        'enrollments.*',
        'courses.title as course_title',
        'courses.slug as course_slug',
        'courses.code as course_code',
        'courses.icon as course_icon',
        'courses.featured_image'
      )
      .orderBy('enrollments.enrolled_at', 'desc');
    res.render('portal/my-courses', {
      pageTitle: 'My Courses | GDCU',
      portalActive: 'my-courses',
      enrollments,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Catalog (browse + enroll) ───────────────────────────────
router.get('/catalog', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const courses = await knex('courses').where({ published: true }).orderBy('sort_order');
    const enrolledIds = await knex('enrollments').where({ user_id: userId }).whereIn('status', ['active', 'completed']).pluck('course_id');

    // Which non-enrolled courses need an application rather than instant
    // enrolment (bachelor/master/doctor, unless already qualified), and which
    // enrolled courses are still awaiting a first tuition payment.
    const applyOnlyIds = [];
    const unpaidIds = [];
    for (const c of courses) {
      if (enrolledIds.includes(c.id)) {
        if (!(await programmes.hasPaidTuition(userId, c.program_id))) unpaidIds.push(c.id);
      } else if (programmes.requiresApplication(c.category) && !(await programmes.hasQualifyingLevel(userId, c.category))) {
        applyOnlyIds.push(c.id);
      }
    }

    // List/card view toggle, remembered per session (defaults to cards).
    if (req.query.view === 'grid' || req.query.view === 'list') req.session.catalogView = req.query.view;
    const view = req.session.catalogView || 'grid';
    res.render('portal/catalog', {
      pageTitle: 'Course Catalogue | GDCU',
      portalActive: 'catalog',
      courses,
      enrolledIds,
      applyOnlyIds,
      unpaidIds,
      view,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/courses/:id/enroll', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const course = await knex('courses').where({ id: req.params.id, published: true }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/portal' });

    const existing = await knex('enrollments').where({ user_id: userId, course_id: course.id }).first();
    if (existing && existing.status === 'withdrawn') {
      await knex('enrollments').where({ id: existing.id }).update({ status: 'active', enrolled_at: knex.fn.now(), updated_at: knex.fn.now() });
      await programmes.ensureTuitionInvoice(course.program_id, userId, null);
      req.flash('success', `You are re-enrolled in ${course.title}. Visit Billing & Payments to pay your tuition and unlock your course content.`);
      return res.redirect(`/portal/courses/${course.slug}`);
    }
    if (!existing) {
      // Bachelor/Master/Doctorate programmes require an application (+ fee +
      // acceptance) unless this student already holds a qualifying enrollment
      // at or below that level, proving they've already cleared entry
      // requirements for it.
      if (programmes.requiresApplication(course.category) && !(await programmes.hasQualifyingLevel(userId, course.category))) {
        req.flash('info', 'This programme requires an application. Please apply to enrol.');
        return res.redirect(`/portal/apply?program=${course.program_id || ''}`);
      }
      await knex('enrollments').insert({ user_id: userId, course_id: course.id, status: 'active', progress_pct: 0 });
      await programmes.ensureTuitionInvoice(course.program_id, userId, null);
      req.flash('success', `You are enrolled in ${course.title}. Visit Billing & Payments to pay your tuition and unlock your course content.`);
    } else {
      req.flash('info', `You are already enrolled in ${course.title}.`);
    }
    res.redirect(`/portal/courses/${course.slug}`);
  } catch (err) {
    next(err);
  }
});

// ─── In-portal application (Bachelor/Master/Doctorate self-registration) ──
// Same applications table and admissions review pipeline as the public Apply
// Now form, just entered from inside the portal by an already-logged-in
// student — so name/email are never re-asked, and known profile details are
// pre-filled (still editable) rather than starting from a blank form.
const applyValidators = [
  body('phone').trim().notEmpty().withMessage('A contact phone number is required.'),
  body('date_of_birth').trim().notEmpty().withMessage('Date of birth is required.'),
  body('country').trim().notEmpty().withMessage('Country of residence is required.'),
  body('nationality').trim().notEmpty().withMessage('Nationality is required.'),
  body('prev_qualification').trim().notEmpty().withMessage('Please tell us your highest qualification.'),
  body('statement').trim().isLength({ min: 50 }).withMessage('Please write a personal statement (at least 50 characters).'),
  body('ref1_name').trim().notEmpty().withMessage('At least one referee is required.'),
  body('ref1_email').trim().isEmail().withMessage('A valid referee email is required.'),
  body('consent').notEmpty().withMessage('Please confirm the declaration to proceed.'),
];
// Fields copied straight from the form into the applications row (mirrors
// admissions.js's APPLICATION_FIELDS, minus what's handled specially below).
const APPLY_EXTRA_FIELDS = [
  'nationality', 'title', 'middle_name', 'preferred_name', 'gender',
  'address_line1', 'address_line2', 'city', 'region', 'postal_code',
  'prev_institution', 'prev_grade', 'prev_year', 'english_proficiency',
  'employment_status', 'occupation', 'employer', 'church_involvement',
  'ref1_name', 'ref1_email', 'ref1_relationship', 'ref2_name', 'ref2_email', 'ref2_relationship',
  'how_heard',
];

router.get('/apply', async (req, res, next) => {
  try {
    const programId = Number(req.query.program) || null;
    const program = programId ? await knex('programs').where({ id: programId, published: true }).first() : null;
    if (!program) {
      req.flash('error', 'Please choose a programme to apply for from the catalogue.');
      return res.redirect('/portal/catalog');
    }
    const userId = req.session.user.id;
    const existingApplication = await knex('applications')
      .where({ student_user_id: userId, program_id: programId })
      .whereNotIn('status', ['declined', 'withdrawn'])
      .first();
    if (existingApplication) {
      req.flash('info', `You already have an application for this programme (status: ${existingApplication.status.replace('_', ' ')}).`);
      return res.redirect('/portal/catalog');
    }
    const user = await knex('users').where({ id: userId }).first();
    const profile = await profiles.getProfile('student', userId);
    res.render('portal/apply', {
      pageTitle: `Apply — ${program.title} | GDCU`,
      portalActive: 'catalog',
      program,
      user,
      profile,
      form: {},
      errors: {},
    });
  } catch (err) {
    next(err);
  }
});

router.post('/apply', applyValidators, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const programId = Number(req.body.program_id) || null;
    const program = programId ? await knex('programs').where({ id: programId, published: true }).first() : null;
    const user = await knex('users').where({ id: userId }).first();
    if (!program || !user) {
      req.flash('error', 'Something went wrong — please try again from the catalogue.');
      return res.redirect('/portal/catalog');
    }

    const result = validationResult(req);
    if (!result.isEmpty()) {
      const errors = {};
      for (const e of result.array()) errors[e.path] = e.msg;
      const profile = await profiles.getProfile('student', userId);
      return res.status(422).render('portal/apply', {
        pageTitle: `Apply — ${program.title} | GDCU`,
        portalActive: 'catalog',
        program,
        user,
        profile,
        form: req.body,
        errors,
      });
    }

    const reference = makeReference();
    const record = {
      reference,
      program_id: program.id,
      student_user_id: userId,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: req.body.phone,
      country: req.body.country,
      date_of_birth: req.body.date_of_birth || null,
      prior_education: req.body.prev_qualification || null,
      statement: req.body.statement || null,
      sponsorship_interest: req.body.sponsorship_interest === 'on',
      status: 'new',
      payment_status: 'unpaid',
    };
    for (const f of APPLY_EXTRA_FIELDS) record[f] = (req.body[f] || '').trim() || null;
    const [appId] = await knex('applications').insert(record);
    const applicationId = Array.isArray(appId) ? appId[0] : appId;

    return await afterApplicationSubmitted({
      application: { id: applicationId, reference, first_name: user.first_name, last_name: user.last_name, email: user.email },
      successUrl: `${process.env.APP_URL || ''}/portal/catalog`,
      cancelUrl: `${process.env.APP_URL || ''}/portal/catalog`,
      req, res,
      tags: ['applicant', 'student'],
    });
  } catch (err) {
    next(err);
  }
});

// ─── Course overview ─────────────────────────────────────────
router.get('/courses/:slug', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/portal' });
    if (!enrollment) {
      req.flash('info', 'Enrol in this course to access its content.');
      return res.redirect('/portal/catalog');
    }
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) {
      return res.render('portal/payment-required', {
        pageTitle: `${course.title} | GDCU`,
        portalActive: 'my-courses',
        course,
      });
    }

    const structure = await getCourseStructure(course.id, enrollment.id);

    // Assignments belonging to a specific module are shown inside that
    // module's card rather than one flat list; attach them onto `structure`
    // before building `curriculum` so getBlockedCurriculum's `{...m}` spread
    // carries them through into the block-grouped view too.
    const moduleAssignments = await knex('assignments')
      .where({ course_id: course.id, published: true })
      .whereNotNull('module_id')
      .andWhere((b) => b.whereNull('available_from').orWhere('available_from', '<=', new Date()))
      .orderBy('sort_order');
    for (const asg of moduleAssignments) {
      asg.submission = await knex('assignment_submissions').where({ assignment_id: asg.id, user_id: userId }).first();
    }
    for (const m of structure) {
      m.assignments = moduleAssignments.filter((a) => a.module_id === m.id);
    }

    // Block-grouped curriculum (Lesson 1, 2, …) with microlearning gates, when the course uses blocks.
    const usesBlocks = structure.some((m) => m.lessons.some((l) => l.block_no));
    const curriculum = usesBlocks ? await getBlockedCurriculum(enrollment.id, structure, course) : null;
    // "Continue where you left off" — the first not-yet-complete block.
    // If it's ready, link to it; if it's waiting on the drip cooldown, show when it unlocks.
    let continueTo = null;
    if (curriculum) {
      for (const m of curriculum) {
        for (const blk of m.blocks) {
          if (!blk.complete) {
            const nextLesson = blk.lessons.find((l) => !l.completed) || blk.lessons[0];
            continueTo = {
              lessonId: nextLesson.id,
              moduleTitle: m.title.replace(/^Year \d+ · /, ''),
              blockNo: blk.block_no,
              blockTitle: blk.title,
              ready: !!blk.open,
              nextAvailable: blk.next_available || null,
              blockingQuiz: blk.blockedByQuiz || null,
            };
            break;
          }
        }
        if (continueTo) break;
      }
    }
    const allQuizzes = await knex('quizzes')
      .where({ course_id: course.id, published: true })
      .andWhere((b) => b.whereNull('available_from').orWhere('available_from', '<=', new Date()))
      .orderBy('sort_order');
    const instructor = course.instructor_id
      ? await knex('users').where({ id: course.instructor_id }).first()
      : null;

    // attach best attempt per quiz
    for (const q of allQuizzes) {
      const best = await knex('quiz_attempts')
        .where({ quiz_id: q.id, user_id: userId })
        .orderBy('score', 'desc')
        .first();
      q.best = best || null;
    }
    // Separate the course final exam from module quizzes, and gate it on
    // completing every lesson first.
    const quizzes = allQuizzes.filter((q) => !q.is_final_exam);
    const finalExam = allQuizzes.find((q) => q.is_final_exam) || null;
    let allLessonsComplete = true;
    structure.forEach((m) => m.lessons.forEach((l) => { if (!l.completed) allLessonsComplete = false; }));
    const finalExamUnlocked = finalExam ? allLessonsComplete : false;
    const finalExamPassed = finalExam && finalExam.best ? !!finalExam.best.passed : false;

    // Course-wide assignments (no module_id) still show in the flat list below.
    const assignments = await knex('assignments')
      .where({ course_id: course.id, published: true })
      .whereNull('module_id')
      .andWhere((b) => b.whereNull('available_from').orWhere('available_from', '<=', new Date()))
      .orderBy('created_at', 'desc');
    for (const asg of assignments) {
      asg.submission = await knex('assignment_submissions').where({ assignment_id: asg.id, user_id: userId }).first();
    }

    res.render('portal/course', {
      pageTitle: `${course.title} | GDCU`,
      portalActive: 'my-courses',
      course,
      enrollment,
      structure,
      curriculum,
      continueTo,
      quizzes,
      finalExam,
      finalExamUnlocked,
      finalExamPassed,
      instructor,
      assignments,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Lesson view ─────────────────────────────────────────────
router.get('/courses/:slug/lessons/:lessonId', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) {
      return res.render('portal/payment-required', {
        pageTitle: `${course.title} | GDCU`,
        portalActive: 'my-courses',
        course,
      });
    }

    // A lesson can live in a dedicated module (modules.course_id) OR in a
    // shared-module template (modules.shared_module_id → course_shared_modules).
    const sharedModuleIds = await knex('course_shared_modules')
      .where({ course_id: course.id })
      .pluck('shared_module_id');
    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .andWhere(function () {
        // Dedicated module owned by this course, OR a shared-module template
        // assigned to this course — a shared template's own modules.course_id
        // points at whichever course first created it, not the viewer's
        // course, so that must NOT be part of this match.
        this.where('modules.course_id', course.id)
          .orWhereIn('modules.shared_module_id', sharedModuleIds.length ? sharedModuleIds : [0]);
      })
      .select('lessons.*', 'modules.title as module_title')
      .first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/portal' });

    // Flattened ordered lesson list for prev/next + sidebar
    const structure = await getCourseStructure(course.id, enrollment.id);
    const flat = [];
    structure.forEach((m) => m.lessons.forEach((l) => flat.push(l)));
    const idx = flat.findIndex((l) => l.id === lesson.id);
    const prev = idx > 0 ? flat[idx - 1] : null;
    const next = idx < flat.length - 1 ? flat[idx + 1] : null;

    const progress = await knex('lesson_progress')
      .where({ enrollment_id: enrollment.id, lesson_id: lesson.id })
      .first();

    // Check drip feed availability
    const availability = await isLessonAvailable(enrollment.id, lesson.id, structure);
    if (!availability.available && !(progress && progress.completed)) {
      return res.render('portal/lesson-locked', {
        pageTitle: 'Lesson Locked | GDCU',
        portalActive: 'my-courses',
        course,
        enrollment,
        lesson,
        structure,
        availability,
      });
    }

    const materials = await knex('lesson_materials').where({ lesson_id: lesson.id }).orderBy('sort_order');
    const comments = await knex('lesson_comments').where({ lesson_id: lesson.id }).orderBy('created_at', 'desc').limit(50);
    const note = await knex('lesson_notes').where({ lesson_id: lesson.id, user_id: req.session.user.id }).first();

    res.render('portal/lesson', {
      pageTitle: `${lesson.title} | GDCU`,
      portalActive: 'my-courses',
      course,
      enrollment,
      lesson,
      structure,
      completed: progress ? !!progress.completed : false,
      prev,
      next,
      materials,
      comments,
      note,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Mark lesson complete ────────────────────────────────────
router.post('/courses/:slug/lessons/:lessonId/complete', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) {
      req.flash('info', 'Please make a tuition payment before studying this course.');
      return res.redirect(`/portal/courses/${course.slug}`);
    }

    const sharedModuleIds = await knex('course_shared_modules')
      .where({ course_id: course.id })
      .pluck('shared_module_id');
    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .andWhere(function () {
        this.where('modules.course_id', course.id)
          .orWhereIn('modules.shared_module_id', sharedModuleIds.length ? sharedModuleIds : [0]);
      })
      .select('lessons.id')
      .first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/portal' });

    // Use drip-feed-aware completion
    const structure = await getCourseStructure(course.id, enrollment.id);
    const result = await completeLessonWithDrip(enrollment.id, lesson.id, structure);

    if (!result.success) {
      req.flash('error', result.message);
      return res.redirect(`/portal/courses/${course.slug}/lessons/${lesson.id}`);
    }

    req.flash('success', result.message);

    // Check achievement milestones
    achievements.checkLessonMilestones(userId).catch(() => {});
    // Check if course was just completed
    const updated = await knex('enrollments').where({ id: enrollment.id }).first();
    if (updated.status === 'completed') {
      achievements.checkCourseMilestones(userId).catch(() => {});
    }

    const redirectTo = req.body.next && req.body.next.startsWith('/') ? req.body.next : `/portal/courses/${course.slug}`;
    res.redirect(redirectTo);
  } catch (err) {
    next(err);
  }
});

// ─── Lesson: post a discussion comment ───────────────────────
router.post('/courses/:slug/lessons/:lessonId/comment', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);
    const sharedModuleIds = await sharedModuleIdsForCourse(course.id);
    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .andWhere(function () {
        this.where('modules.course_id', course.id).orWhereIn('modules.shared_module_id', sharedModuleIds.length ? sharedModuleIds : [0]);
      })
      .select('lessons.id')
      .first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/portal' });
    if (req.body.body && req.body.body.trim()) {
      await knex('lesson_comments').insert({
        lesson_id: req.params.lessonId,
        user_id: userId,
        author_name: req.session.user.name,
        is_staff: ['faculty', 'staff', 'admin'].includes(req.session.user.role),
        body: req.body.body.trim(),
      });
    }
    res.redirect(`/portal/courses/${course.slug}/lessons/${req.params.lessonId}#discussion`);
  } catch (err) { next(err); }
});

// ─── Lesson: save personal note ──────────────────────────────
router.post('/courses/:slug/lessons/:lessonId/note', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);
    const sharedModuleIds = await sharedModuleIdsForCourse(course.id);
    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .andWhere(function () {
        this.where('modules.course_id', course.id).orWhereIn('modules.shared_module_id', sharedModuleIds.length ? sharedModuleIds : [0]);
      })
      .select('lessons.id')
      .first();
    if (!lesson) return res.status(404).render('errors/404', { pageTitle: 'Lesson not found', layout: 'layouts/portal' });
    const existing = await knex('lesson_notes').where({ lesson_id: req.params.lessonId, user_id: userId }).first();
    if (existing) {
      await knex('lesson_notes').where({ id: existing.id }).update({ body: req.body.body || '', updated_at: knex.fn.now() });
    } else {
      await knex('lesson_notes').insert({ lesson_id: req.params.lessonId, user_id: userId, body: req.body.body || '' });
    }
    req.flash('success', 'Your notes were saved.');
    res.redirect(`/portal/courses/${course.slug}/lessons/${req.params.lessonId}#notes`);
  } catch (err) { next(err); }
});

// ─── Assignments (student) ───────────────────────────────────
router.get('/assignments/:id', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const assignment = await knex('assignments').where({ id: req.params.id, published: true }).first();
    if (!assignment) return res.status(404).render('errors/404', { pageTitle: 'Assignment not found', layout: 'layouts/portal' });
    const course = await knex('courses').where({ id: assignment.course_id, published: true }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Course not found', layout: 'layouts/portal' });
    const enrollment = await knex('enrollments').where({ user_id: userId, course_id: course.id }).whereIn('status', ['active', 'completed']).first();
    if (!enrollment) { req.flash('info', 'Enrol in the course to access this assignment.'); return res.redirect('/portal/catalog'); }
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.render('portal/payment-required', { pageTitle: `${course.title} | GDCU`, portalActive: 'my-courses', course });
    const submission = await knex('assignment_submissions').where({ assignment_id: assignment.id, user_id: userId }).first();
    res.render('portal/assignment', { pageTitle: `${assignment.title} | GDCU`, portalActive: 'my-courses', assignment, course, submission });
  } catch (err) { next(err); }
});

router.post('/assignments/:id/submit', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const assignment = await knex('assignments').where({ id: req.params.id, published: true }).first();
    if (!assignment) return res.redirect('/portal');
    const course = await knex('courses').where({ id: assignment.course_id, published: true }).first();
    const enrollment = await knex('enrollments').where({ user_id: userId, course_id: assignment.course_id }).whereIn('status', ['active', 'completed']).first();
    if (!enrollment) return res.redirect('/portal/catalog');
    if (!course || !(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect('/portal/catalog');
    if (assignment.due_date && new Date(`${String(assignment.due_date).slice(0, 10)}T23:59:59`) < new Date()) {
      req.flash('error', 'The deadline for this assignment has passed.');
      return res.redirect(`/portal/assignments/${assignment.id}`);
    }
    const existing = await knex('assignment_submissions').where({ assignment_id: assignment.id, user_id: userId }).first();
    if (existing && existing.status === 'graded') {
      req.flash('info', 'This assignment has already been graded and cannot be resubmitted.');
      return res.redirect(`/portal/assignments/${assignment.id}`);
    }
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    const url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (!body && !url) { req.flash('error', 'Please provide written work or a link.'); return res.redirect(`/portal/assignments/${assignment.id}`); }
    if (body.length > 100000 || url.length > 2048) { req.flash('error', 'Your submission is too large.'); return res.redirect(`/portal/assignments/${assignment.id}`); }
    if (url) { try { new URL(url); } catch (_) { req.flash('error', 'Please provide a valid URL.'); return res.redirect(`/portal/assignments/${assignment.id}`); } }
    const data = { body: body || null, url: url || null, status: 'submitted', submitted_at: knex.fn.now() };
    if (existing) {
      await knex('assignment_submissions').where({ id: existing.id }).update(data);
    } else {
      await knex('assignment_submissions').insert({ assignment_id: assignment.id, user_id: userId, ...data });
    }
    req.flash('success', 'Your work has been submitted.');
    res.redirect(`/portal/assignments/${assignment.id}`);
  } catch (err) { next(err); }
});

// Programmes a student is associated with (accepted application or enrolled course).
async function studentProgrammeIds(userId) {
  const fromApps = await knex('applications')
    .where({ student_user_id: userId })
    .whereIn('status', ['accepted'])
    .whereNotNull('program_id')
    .pluck('program_id');
  const fromCourses = await knex('enrollments')
    .join('courses', 'enrollments.course_id', 'courses.id')
    .where('enrollments.user_id', userId)
    .whereIn('enrollments.status', ['active', 'completed'])
    .whereNotNull('courses.program_id').pluck('courses.program_id');
  return Array.from(new Set([...fromApps, ...fromCourses]));
}

// Whether the student may sit a given exam, and where "back" should point.
async function examAccess(userId, quiz) {
  if (quiz.is_final_exam && (quiz.exam_scope === 'programme' || quiz.exam_scope === 'year')) {
    const progIds = await studentProgrammeIds(userId);
    const paid = quiz.program_id ? await programmes.hasPaidTuition(userId, quiz.program_id) : false;
    return { allowed: !!quiz.program_id && progIds.includes(quiz.program_id) && paid, backUrl: '/portal/exams', course: null, paid };
  }
  const course = quiz.course_id ? await knex('courses').where({ id: quiz.course_id, published: true }).first() : null;
  const enrollment = quiz.course_id
    ? await knex('enrollments').where({ user_id: userId, course_id: quiz.course_id }).whereIn('status', ['active', 'completed']).first()
    : null;
  const paid = enrollment && course ? await programmes.hasPaidTuition(userId, course.program_id) : false;
  return { allowed: !!enrollment && paid, backUrl: course ? `/portal/courses/${course.slug}` : '/portal/catalog', course, enrollment, paid };
}

// ─── Programme / year final exams available to the student ───
router.get('/exams', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const progIds = await studentProgrammeIds(userId);
    const paidProgIds = [];
    for (const programId of progIds) {
      if (await programmes.hasPaidTuition(userId, programId)) paidProgIds.push(programId);
    }
    let exams = [];
    if (paidProgIds.length) {
      exams = await knex('quizzes')
        .where('is_final_exam', true).whereIn('exam_scope', ['year', 'programme'])
        .where('quizzes.published', true)
        .where(function () { this.whereNull('quizzes.available_from').orWhere('quizzes.available_from', '<=', new Date()); })
        .whereIn('program_id', paidProgIds)
        .leftJoin('programs', 'quizzes.program_id', 'programs.id')
        .select('quizzes.*', 'programs.title as program_title')
        .orderBy('quizzes.exam_scope');
      for (const e of exams) {
        e.best = await knex('quiz_attempts').where({ quiz_id: e.id, user_id: userId }).orderBy('score', 'desc').first();
        e.questionCount = Number((await knex('quiz_questions').where({ quiz_id: e.id }).count({ c: '*' }).first()).c);
      }
    }
    res.render('portal/exams', { pageTitle: 'Final Exams | GDCU', portalActive: 'exams', exams });
  } catch (err) { next(err); }
});

// ─── Quiz: take ──────────────────────────────────────────────
async function ensureActiveQuizAttempt(userId, quizId) {
  let attempt = await knex('quiz_attempts')
    .where({ user_id: userId, quiz_id: quizId })
    .whereNull('submitted_at')
    .orderBy('started_at', 'desc')
    .first();
  if (!attempt) {
    const [idRaw] = await knex('quiz_attempts').insert({
      quiz_id: quizId, user_id: userId, score: 0, passed: false, started_at: knex.fn.now(),
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    attempt = await knex('quiz_attempts').where({ id }).first();
  }
  return attempt;
}

router.get('/quizzes/:id', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const quiz = await knex('quizzes').where({ id: req.params.id }).first();
    if (!quiz) return res.status(404).render('errors/404', { pageTitle: 'Quiz not found', layout: 'layouts/portal' });
    const access = await examAccess(userId, quiz);
    if (!access.allowed) {
      req.flash('info', quiz.is_final_exam && quiz.exam_scope !== 'course' ? 'This exam is for students of its programme.' : 'Enrol in the course to take this quiz.');
      return res.redirect(access.backUrl);
    }
    // A direct link to a draft or not-yet-scheduled quiz must be blocked the
    // same as it would be if the student found it through the course listing.
    if (!quiz.published || (quiz.available_from && new Date(quiz.available_from) > new Date())) {
      req.flash('info', 'This quiz is not available yet.');
      return res.redirect(access.backUrl);
    }
    // Block-sequence quizzes: the covered lessons must be completed first.
    if (quiz.after_block && access.course) {
      const struct = await getCourseStructure(quiz.course_id, access.enrollment.id);
      const qa = await isQuizAvailable(access.enrollment.id, quiz, struct);
      if (!qa.available) {
        req.flash('info', 'Finish the lessons this quiz covers before taking it.');
        return res.redirect(`/portal/courses/${access.course.slug}`);
      }
    }

    const questions = await knex('quiz_questions').where({ quiz_id: quiz.id }).orderBy('sort_order').orderBy('id');
    for (const q of questions) {
      q.options = await knex('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
    }
    const attempt = await ensureActiveQuizAttempt(userId, quiz.id);

    res.render('portal/quiz', {
      pageTitle: `${quiz.title} | GDCU`,
      portalActive: 'my-courses',
      quiz,
      course: access.course,
      backUrl: access.backUrl,
      questions,
      attempt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Quiz: submit & grade ────────────────────────────────────
router.post('/quizzes/:id/submit', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const quiz = await knex('quizzes').where({ id: req.params.id }).first();
    if (!quiz) return res.status(404).render('errors/404', { pageTitle: 'Quiz not found', layout: 'layouts/portal' });

    const access = await examAccess(userId, quiz);
    if (!access.allowed) return res.redirect(access.backUrl);

    if (!quiz.published || (quiz.available_from && new Date(quiz.available_from) > new Date())) {
      req.flash('info', 'This quiz is not available yet.');
      return res.redirect(access.backUrl);
    }
    if (quiz.after_block && access.course) {
      const struct = await getCourseStructure(quiz.course_id, access.enrollment.id);
      const qa = await isQuizAvailable(access.enrollment.id, quiz, struct);
      if (!qa.available) {
        req.flash('info', 'Finish the lessons this quiz covers before taking it.');
        return res.redirect(`/portal/courses/${access.course.slug}`);
      }
    }
    if (quiz.is_final_exam && quiz.exam_scope === 'course' && access.course) {
      const structure = await getCourseStructure(quiz.course_id, access.enrollment.id);
      const allLessonsComplete = structure.every((m) => m.lessons.every((lesson) => lesson.completed));
      if (!allLessonsComplete) {
        req.flash('info', 'Complete all course lessons before taking the final exam.');
        return res.redirect(`/portal/courses/${access.course.slug}`);
      }
    }

    const attemptId = Number(req.body.attempt_id);
    const activeAttempt = Number.isInteger(attemptId) && attemptId > 0
      ? await knex('quiz_attempts').where({ id: attemptId, quiz_id: quiz.id, user_id: userId }).whereNull('submitted_at').first()
      : null;
    if (!activeAttempt) {
      req.flash('error', 'This quiz session has expired. Please start the quiz again.');
      return res.redirect(`/portal/quizzes/${quiz.id}`);
    }

    const elapsedMs = Date.now() - new Date(activeAttempt.started_at).getTime();
    const timedOut = quiz.time_limit_min && Number.isFinite(elapsedMs)
      ? elapsedMs > Number(quiz.time_limit_min) * 60 * 1000
      : false;

    const questions = await knex('quiz_questions').where({ quiz_id: quiz.id });
    const { score, passed } = await knex.transaction(async (trx) => {
      let correctCount = 0;
      for (const q of questions) {
        const raw = req.body[`q_${q.id}`];
        const submittedIds = (Array.isArray(raw) ? raw : [raw])
          .filter((value) => value !== undefined && value !== '')
          .map(Number)
          .filter(Number.isInteger);
        const options = await trx('quiz_options').where({ question_id: q.id });
        const validIds = new Set(options.map((option) => option.id));
        const chosenIds = submittedIds.filter((id) => validIds.has(id));
        const correctIds = options.filter((option) => option.is_correct).map((option) => option.id);
        const sameSet = correctIds.length > 0
          && chosenIds.length === correctIds.length
          && correctIds.every((id) => chosenIds.includes(id));
        const isCorrect = !timedOut && sameSet;
        if (isCorrect) correctCount += 1;

        const answerIds = q.type === 'multiple' ? (chosenIds.length ? chosenIds : [null]) : [chosenIds[0] || null];
        for (const optionId of answerIds) {
          await trx('quiz_answers').insert({
            attempt_id: activeAttempt.id,
            question_id: q.id,
            option_id: optionId,
            correct: isCorrect,
          });
        }
      }
      const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
      const passed = !timedOut && score >= quiz.pass_mark;
      await trx('quiz_attempts').where({ id: activeAttempt.id }).update({ score, passed, submitted_at: knex.fn.now() });
      return { score, passed };
    });

    // Check achievement milestones for quiz
    const attempt = { score, passed };
    achievements.checkQuizMilestones(userId, attempt).catch(() => {});

    // Passing a course final exam completes the enrolment (certificate becomes claimable).
    if (passed && quiz.is_final_exam && quiz.exam_scope === 'course' && quiz.course_id) {
      await knex('enrollments').where({ user_id: userId, course_id: quiz.course_id })
        .update({ status: 'completed', completed_at: knex.fn.now() });
      achievements.checkCourseMilestones(userId).catch(() => {});
    }

    res.redirect(`/portal/attempts/${activeAttempt.id}`);
  } catch (err) {
    next(err);
  }
});

// ─── Quiz: result / remediation review ───────────────────────
router.get('/attempts/:id', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const attempt = await knex('quiz_attempts').where({ id: req.params.id, user_id: userId }).first();
    if (!attempt) return res.status(404).render('errors/404', { pageTitle: 'Attempt not found', layout: 'layouts/portal' });

    const quiz = await knex('quizzes').where({ id: attempt.quiz_id }).first();
    const course = await knex('courses').where({ id: quiz.course_id }).first();
    const questions = await knex('quiz_questions').where({ quiz_id: quiz.id }).orderBy('sort_order').orderBy('id');
    const answers = await knex('quiz_answers').where({ attempt_id: attempt.id });
    const answersByQ = {};
    answers.forEach((a) => {
      if (!answersByQ[a.question_id]) answersByQ[a.question_id] = [];
      answersByQ[a.question_id].push(a);
    });

    for (const q of questions) {
      q.options = await knex('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
      const questionAnswers = answersByQ[q.id] || [];
      q.chosen = q.type === 'multiple'
        ? questionAnswers.filter((a) => a.option_id !== null).map((a) => a.option_id)
        : (questionAnswers[0] ? questionAnswers[0].option_id : null);
      q.gotCorrect = questionAnswers.length > 0 && questionAnswers.every((a) => !!a.correct);
    }

    res.render('portal/quiz-result', {
      pageTitle: `Quiz Result | GDCU`,
      portalActive: 'my-courses',
      attempt,
      quiz,
      course,
      questions,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Certificates ────────────────────────────────────────────
router.get('/certificates', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const certificates = await knex('certificates')
      .leftJoin('courses', 'certificates.course_id', 'courses.id')
      .where('certificates.user_id', userId)
      .select('certificates.*', 'courses.code as course_code')
      .orderBy('issued_at', 'desc');

    // Completed courses eligible for a (not-yet-claimed) certificate
    const completed = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where({ 'enrollments.user_id': userId, 'enrollments.status': 'completed' })
      .select('courses.id as course_id', 'courses.title', 'courses.code');
    const claimedCourseIds = new Set(certificates.map((c) => c.course_id));
    const claimable = completed.filter((c) => !claimedCourseIds.has(c.course_id));

    res.render('portal/certificates', {
      pageTitle: 'My Certificates | GDCU',
      portalActive: 'certificates',
      certificates,
      claimable,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/courses/:id/certificate', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const enrollment = await knex('enrollments').where({ user_id: userId, course_id: req.params.id }).first();
    const course = await knex('courses').where({ id: req.params.id }).first();
    if (!enrollment || !course) return res.redirect('/portal/certificates');

    if (enrollment.status !== 'completed') {
      req.flash('error', 'Complete all lessons before claiming your certificate.');
      return res.redirect(`/portal/courses/${course.slug}`);
    }
    // If this course has a final exam, it must be passed first.
    const finalExam = await knex('quizzes').where({ course_id: course.id, is_final_exam: true }).first();
    if (finalExam) {
      const passedFinal = await knex('quiz_attempts').where({ quiz_id: finalExam.id, user_id: userId, passed: true }).first();
      if (!passedFinal) {
        req.flash('error', 'You must pass the final exam before claiming your certificate.');
        return res.redirect(`/portal/courses/${course.slug}`);
      }
    }
    const existing = await knex('certificates').where({ user_id: userId, course_id: course.id }).first();
    if (!existing) {
      await knex('certificates').insert({
        reference: makeReference('GDCU-CERT'),
        user_id: userId,
        course_id: course.id,
        title: `Certificate of Completion — ${course.title}`,
      });
      req.flash('success', 'Congratulations! Your certificate has been issued.');
    }
    res.redirect('/portal/certificates');
  } catch (err) {
    next(err);
  }
});

// ─── Certificate view (printable) ────────────────────────────
router.get('/certificates/:reference', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const cert = await knex('certificates').where({ reference: req.params.reference, user_id: userId }).first();
    if (!cert) return res.status(404).render('errors/404', { pageTitle: 'Certificate not found', layout: 'layouts/portal' });
    res.render('portal/certificate-view', {
      pageTitle: 'Certificate | GDCU',
      layout: false, // standalone printable page
      cert,
      holder: req.session.user.name,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Billing ─────────────────────────────────────────────────
router.get('/billing', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const invoices = await knex('invoices').where({ user_id: userId }).whereNot('status', 'draft').orderBy('due_date');
    const today = new Date().toISOString().slice(0, 10);
    let outstanding = 0;
    for (const inv of invoices) {
      // Flag overdue (unpaid + past due date) for display
      inv.is_overdue = inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && String(inv.due_date).slice(0, 10) < today;
      if (inv.status === 'sent' || inv.status === 'overdue') outstanding += Number(inv.amount);
    }
    const { isConfigured } = await getStripe();
    res.render('portal/billing', {
      pageTitle: 'Billing & Payments | GDCU',
      portalActive: 'billing',
      invoices,
      outstanding,
      paymentsEnabled: isConfigured,
    });
  } catch (err) {
    next(err);
  }
});

// View a single invoice (before deciding to pay)
router.get('/invoices/:id', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const invoice = await knex('invoices').where({ id: req.params.id, user_id: userId }).first();
    if (!invoice) return res.status(404).render('errors/404', { pageTitle: 'Invoice not found', layout: 'layouts/portal' });
    const today = new Date().toISOString().slice(0, 10);
    invoice.is_overdue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_date && String(invoice.due_date).slice(0, 10) < today;
    const program = invoice.program_id ? await knex('programs').where({ id: invoice.program_id }).first() : null;
    res.render('portal/invoice-view', {
      pageTitle: `Invoice ${invoice.reference} | GDCU`,
      portalActive: 'billing',
      invoice,
      program,
    });
  } catch (err) {
    next(err);
  }
});

// Pay a single invoice
router.post('/invoices/:id/pay', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const invoice = await knex('invoices').where({ id: req.params.id, user_id: userId }).first();
    if (!invoice) return res.status(404).render('errors/404', { pageTitle: 'Invoice not found', layout: 'layouts/portal' });
    if (invoice.status === 'paid') {
      req.flash('info', 'This invoice is already paid.');
      return res.redirect('/portal/billing');
    }
    if (invoice.status === 'draft' || invoice.status === 'void') {
      req.flash('error', 'This invoice is not available for payment.');
      return res.redirect('/portal/billing');
    }

    const { stripe, isConfigured } = await getStripe();
    if (isConfigured) {
      const currency = (invoice.currency || 'GBP').toLowerCase();
      const checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: req.session.user.email,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: invoice.description, description: `Invoice ${invoice.reference}` },
              unit_amount: Math.round(Number(invoice.amount) * 100),
            },
            quantity: 1,
          },
        ],
        metadata: { kind: 'invoice', invoice_id: String(invoice.id), reference: invoice.reference },
        success_url: `${process.env.APP_URL}/portal/billing?paid=${invoice.reference}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/portal/billing?cancelled=1`,
      });
      await knex('invoices').where({ id: invoice.id }).update({ stripe_session_id: checkout.id, updated_at: knex.fn.now() });
      return res.redirect(303, checkout.url);
    }

    if (process.env.NODE_ENV === 'production') {
      req.flash('error', 'Online payments are temporarily unavailable. Please contact support.');
      return res.redirect(`/portal/invoices/${invoice.id}`);
    }

    // No Stripe configured (local dev) — record as paid directly.
    await knex('invoices').where({ id: invoice.id }).update({
      status: 'paid', payment_method: 'manual (dev)', paid_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
    req.flash('success', `Invoice ${invoice.reference} marked paid (Stripe not configured in this environment).`);
    return res.redirect('/portal/billing');
  } catch (err) {
    next(err);
  }
});

// ─── Events (portal) ─────────────────────────────────────────
// Academic calendar for students (their audience + public + everyone)
router.get('/schedule', async (req, res, next) => {
  try {
    const calendar = require('../lib/calendar');
    const events = await calendar.upcomingFor('student', { limit: 100 });
    res.render('portal/schedule', { pageTitle: 'Schedule & Key Dates | GDCU', portalActive: 'schedule', groups: calendar.groupByMonth(events), cats: calendar.CATEGORIES });
  } catch (err) { next(err); }
});

router.get('/events', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const events = await knex('events').where({ published: true }).where('starts_at', '>=', now).orderBy('starts_at');
    const myRsvps = await knex('event_rsvps').where({ user_id: userId }).pluck('event_id');
    const rsvpSet = new Set(myRsvps);
    events.forEach((e) => { e.going = rsvpSet.has(e.id); });
    res.render('portal/events', { pageTitle: 'Events | GDCU', portalActive: 'events', events });
  } catch (err) {
    next(err);
  }
});

router.post('/events/:id/rsvp', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const event = await knex('events').where({ id: req.params.id, published: true }).first();
    if (!event) return res.redirect('/portal/events');
    const existing = await knex('event_rsvps').where({ event_id: event.id, user_id: userId }).first();
    if (existing) {
      await knex('event_rsvps').where({ id: existing.id }).del();
      req.flash('info', `Your RSVP for "${event.title}" was removed.`);
    } else {
      await knex('event_rsvps').insert({ event_id: event.id, user_id: userId });
      req.flash('success', `You're going to "${event.title}".`);
    }
    res.redirect('/portal/events');
  } catch (err) {
    next(err);
  }
});

// ─── Live webinars ───────────────────────────────────────────
router.get('/webinars', async (req, res, next) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const upcoming = await knex('webinars').where({ published: true }).where('starts_at', '>=', now).orderBy('starts_at');
    const past = await knex('webinars').where({ published: true }).where('starts_at', '<', now).orderBy('starts_at', 'desc');
    res.render('portal/webinars', { pageTitle: 'Live Webinars | GDCU', portalActive: 'webinars', upcoming, past });
  } catch (err) { next(err); }
});

router.get('/webinars/:id', async (req, res, next) => {
  try {
    const webinar = await knex('webinars').where({ id: req.params.id, published: true }).first();
    if (!webinar) return res.status(404).render('errors/404', { pageTitle: 'Webinar not found', layout: 'layouts/portal' });
    const questions = await knex('webinar_questions').where({ webinar_id: webinar.id }).orderBy('upvotes', 'desc').orderBy('created_at', 'desc');
    const resources = (webinar.resources || '').split('\n').map((r) => r.trim()).filter(Boolean)
      .map((r) => { const [label, url] = r.split('|'); return { label: label || url, url: url || '#' }; });
    let embedHtml = null;
    if (webinar.provider === 'onestream' && webinar.stream_embed_url) {
      embedHtml = `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="${webinar.stream_embed_url}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
    } else if (webinar.provider === 'zoom' && webinar.join_url) {
      embedHtml = `<div class="bg-surface-container-lowest rounded-lg p-6 mb-6"><p class="text-sm text-on-surface-variant">Join the Zoom meeting from the link below. Start URL is available to instructors only.</p><a href="${webinar.join_url}" target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-2 bg-secondary text-on-secondary px-5 py-2 rounded font-bold">Join Zoom meeting</a></div>`;
    }
    res.render('portal/webinar', { pageTitle: `${webinar.title} | GDCU`, portalActive: 'webinars', webinar, questions, resources, embedHtml });
  } catch (err) { next(err); }
});

router.post('/webinars/:id/questions', async (req, res, next) => {
  try {
    if (req.body.body && req.body.body.trim()) {
      await knex('webinar_questions').insert({
        webinar_id: req.params.id, user_id: req.session.user.id, author_name: req.session.user.name, body: req.body.body.trim(),
      });
    }
    res.redirect(`/portal/webinars/${req.params.id}#questions`);
  } catch (err) { next(err); }
});

router.post('/webinars/:id/questions/:qid/upvote', async (req, res, next) => {
  try {
    await knex('webinar_questions').where({ id: req.params.qid }).increment('upvotes', 1);
    res.redirect(`/portal/webinars/${req.params.id}#questions`);
  } catch (err) { next(err); }
});

// ─── Library (portal) ────────────────────────────────────────
router.get('/library', async (req, res, next) => {
  try {
    const { type, q } = req.query;
    const query = knex('resources').where({ published: true });
    if (type) query.where('type', type);
    if (q) query.where((b) => b.whereILike('title', `%${q}%`).orWhereILike('description', `%${q}%`));
    const resources = await query.orderBy(['category', 'sort_order']);
    const types = await knex('resources').where({ published: true }).distinct('type').pluck('type');
    res.render('portal/library', {
      pageTitle: 'Library & Resources | GDCU',
      portalActive: 'library',
      resources,
      types,
      filters: { type: type || '', q: q || '' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Support helpdesk ────────────────────────────────────────
router.get('/support', async (req, res, next) => {
  try {
    const tickets = await knex('support_tickets').where({ user_id: req.session.user.id }).orderBy('updated_at', 'desc');
    res.render('portal/support', { pageTitle: 'Support | GDCU', portalActive: 'support', tickets });
  } catch (err) { next(err); }
});

router.post('/support', async (req, res, next) => {
  try {
    if (!req.body.subject || !req.body.body) {
      req.flash('error', 'Please enter a subject and a message.');
      return res.redirect('/portal/support');
    }
    const reference = makeReference('TKT');
    const [idRaw] = await knex('support_tickets').insert({
      reference,
      user_id: req.session.user.id,
      subject: req.body.subject,
      category: req.body.category || 'General',
      priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal',
      status: 'open',
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    await knex('ticket_replies').insert({
      ticket_id: id, author_id: req.session.user.id, author_name: req.session.user.name, is_staff: false, body: req.body.body,
    });
    notifyRoles(['admin', 'staff'], { type: 'message', title: 'New support ticket', body: `${req.session.user.name}: ${req.body.subject}`, link: `/admin/support/${id}` });
    req.flash('success', `Support ticket ${reference} created. We'll respond as soon as we can.`);
    res.redirect(`/portal/support/${id}`);
  } catch (err) { next(err); }
});

router.get('/support/:id', async (req, res, next) => {
  try {
    const ticket = await knex('support_tickets').where({ id: req.params.id, user_id: req.session.user.id }).first();
    if (!ticket) return res.status(404).render('errors/404', { pageTitle: 'Ticket not found', layout: 'layouts/portal' });
    const replies = await knex('ticket_replies').where({ ticket_id: ticket.id }).orderBy('created_at');
    res.render('portal/support-detail', { pageTitle: `${ticket.reference} | Support`, portalActive: 'support', ticket, replies, editReply: req.query.editReply ? Number(req.query.editReply) : null });
  } catch (err) { next(err); }
});

// Student edits their own reply
router.post('/ticket-replies/:id', async (req, res, next) => {
  try {
    const reply = await knex('ticket_replies').where({ id: req.params.id, author_id: req.session.user.id }).first();
    if (!reply) { req.flash('error', 'You can only edit your own messages.'); return res.redirect('/portal/support'); }
    if (req.body.body && req.body.body.trim()) {
      await knex('ticket_replies').where({ id: reply.id }).update({ body: req.body.body.trim(), edited_at: knex.fn.now() });
      req.flash('success', 'Message updated.');
    }
    res.redirect(`/portal/support/${reply.ticket_id}`);
  } catch (err) { next(err); }
});

// Student closes / reopens their own ticket
router.post('/support/:id/close', async (req, res, next) => {
  try {
    await knex('support_tickets').where({ id: req.params.id, user_id: req.session.user.id }).update({ status: 'closed', updated_at: knex.fn.now() });
    req.flash('success', 'Ticket closed.');
    res.redirect(`/portal/support/${req.params.id}`);
  } catch (err) { next(err); }
});
router.post('/support/:id/reopen', async (req, res, next) => {
  try {
    await knex('support_tickets').where({ id: req.params.id, user_id: req.session.user.id }).update({ status: 'open', updated_at: knex.fn.now() });
    req.flash('success', 'Ticket reopened.');
    res.redirect(`/portal/support/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/support/:id/reply', async (req, res, next) => {
  try {
    const ticket = await knex('support_tickets').where({ id: req.params.id, user_id: req.session.user.id }).first();
    if (!ticket) return res.redirect('/portal/support');
    if (req.body.body && req.body.body.trim()) {
      await knex('ticket_replies').insert({ ticket_id: ticket.id, author_id: req.session.user.id, author_name: req.session.user.name, is_staff: false, body: req.body.body.trim() });
      await knex('support_tickets').where({ id: ticket.id }).update({ status: 'open', updated_at: knex.fn.now() });
      notifyRoles(['admin', 'staff'], { type: 'message', title: 'Reply on support ticket', body: `${req.session.user.name}: ${ticket.subject}`, link: `/admin/support/${ticket.id}` });
    }
    res.redirect(`/portal/support/${ticket.id}`);
  } catch (err) { next(err); }
});

// ─── Performance analytics ───────────────────────────────────
router.get('/performance', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', userId)
      .select('enrollments.*', 'courses.title as course_title', 'courses.id as cid');
    const attempts = await knex('quiz_attempts')
      .join('quizzes', 'quiz_attempts.quiz_id', 'quizzes.id')
      .where('quiz_attempts.user_id', userId)
      .select('quiz_attempts.*', 'quizzes.title as quiz_title', 'quizzes.pass_mark');

    const avgProgress = enrollments.length ? Math.round(enrollments.reduce((s, e) => s + e.progress_pct, 0) / enrollments.length) : 0;
    const bestByQuiz = {};
    attempts.forEach((a) => { if (!bestByQuiz[a.quiz_id] || a.score > bestByQuiz[a.quiz_id].score) bestByQuiz[a.quiz_id] = a; });
    const bestAttempts = Object.values(bestByQuiz);
    const avgScore = bestAttempts.length ? Math.round(bestAttempts.reduce((s, a) => s + a.score, 0) / bestAttempts.length) : 0;
    const passed = bestAttempts.filter((a) => a.passed).length;

    res.render('portal/performance', {
      pageTitle: 'My Performance | GDCU', portalActive: 'performance',
      enrollments, bestAttempts, avgProgress, avgScore, passed,
      completed: enrollments.filter((e) => e.status === 'completed').length,
    });
  } catch (err) { next(err); }
});

// ─── Mentorship (book faculty office hours) ──────────────────
router.get('/mentorship', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const slots = await knex('office_hour_slots')
      .join('users', 'office_hour_slots.faculty_id', 'users.id')
      .where('office_hour_slots.starts_at', '>=', now)
      .select('office_hour_slots.*', 'users.first_name', 'users.last_name')
      .orderBy('office_hour_slots.starts_at');
    const myBookingIds = await knex('office_hour_bookings').where({ user_id: userId }).pluck('slot_id');
    const mySet = new Set(myBookingIds);
    for (const s of slots) {
      s.booked_count = Number((await knex('office_hour_bookings').where({ slot_id: s.id }).count({ c: '*' }).first()).c);
      s.mine = mySet.has(s.id);
      s.full = s.booked_count >= s.capacity && !s.mine;
    }
    res.render('portal/mentorship', { pageTitle: 'Mentorship | GDCU', portalActive: 'mentorship', slots });
  } catch (err) { next(err); }
});

router.post('/office-hours/:id/book', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const slot = await knex('office_hour_slots').where({ id: req.params.id }).first();
    if (!slot) return res.redirect('/portal/mentorship');
    const count = Number((await knex('office_hour_bookings').where({ slot_id: slot.id }).count({ c: '*' }).first()).c);
    const existing = await knex('office_hour_bookings').where({ slot_id: slot.id, user_id: userId }).first();
    if (existing) {
      req.flash('info', 'You have already booked this session.');
    } else if (count >= slot.capacity) {
      req.flash('error', 'Sorry, that session is now full.');
    } else {
      await knex('office_hour_bookings').insert({ slot_id: slot.id, user_id: userId, note: req.body.note || null });
      req.flash('success', 'Session booked. See you there!');
    }
    res.redirect('/portal/mentorship');
  } catch (err) { next(err); }
});

router.post('/office-hours/:id/cancel', async (req, res, next) => {
  try {
    await knex('office_hour_bookings').where({ slot_id: req.params.id, user_id: req.session.user.id }).del();
    req.flash('info', 'Booking cancelled.');
    res.redirect('/portal/mentorship');
  } catch (err) { next(err); }
});

// ─── Transcript (printable) ──────────────────────────────────
router.get('/transcript', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const rows = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', userId)
      .select('courses.id as course_id', 'courses.title', 'courses.code', 'courses.credits',
        'enrollments.progress_pct', 'enrollments.status', 'enrollments.completed_at');
    // Best quiz score per course as an indicative grade.
    for (const r of rows) {
      const best = await knex('quiz_attempts')
        .join('quizzes', 'quiz_attempts.quiz_id', 'quizzes.id')
        .where({ 'quizzes.course_id': r.course_id, 'quiz_attempts.user_id': userId })
        .max({ s: 'quiz_attempts.score' }).first();
      r.best_score = best && best.s != null ? Number(best.s) : null;
    }
    const totalCredits = rows.filter((r) => r.status === 'completed').reduce((s, r) => s + (r.credits || 0), 0);
    res.render('portal/transcript', {
      pageTitle: 'My Transcript | GDCU', layout: false, rows, totalCredits,
      holder: req.session.user.name, generated: new Date(),
    });
  } catch (err) { next(err); }
});

// ─── Graduation / commencement hub ───────────────────────────
router.get('/graduation', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', userId)
      .select('courses.title', 'courses.credits', 'enrollments.status', 'enrollments.progress_pct');
    const completed = enrollments.filter((e) => e.status === 'completed');
    const creditsEarned = completed.reduce((s, e) => s + (e.credits || 0), 0);
    const required = 120; // indicative credits for an award
    const certificates = await knex('certificates').where({ user_id: userId }).orderBy('issued_at', 'desc');
    const registration = await knex('graduation_registrations').where({ user_id: userId }).first();
    const eligible = creditsEarned >= required || (enrollments.length > 0 && completed.length === enrollments.length);

    res.render('portal/graduation', {
      pageTitle: 'Graduation Hub | GDCU', portalActive: 'graduation',
      enrollments, completed, creditsEarned, required, certificates, registration, eligible,
    });
  } catch (err) { next(err); }
});

router.post('/graduation/register', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const existing = await knex('graduation_registrations').where({ user_id: userId }).first();
    const data = {
      ceremony: req.body.ceremony || 'Annual Commencement',
      attending: req.body.attending !== 'no',
      regalia_size: req.body.regalia_size || null,
      guests: req.body.guests ? Number(req.body.guests) : 0,
      updated_at: knex.fn.now(),
    };
    if (existing) {
      await knex('graduation_registrations').where({ id: existing.id }).update(data);
    } else {
      await knex('graduation_registrations').insert({ user_id: userId, ...data });
    }
    req.flash('success', 'Your commencement registration has been saved.');
    res.redirect('/portal/graduation');
  } catch (err) { next(err); }
});

// ─── Chat page ──────────────────────────────────────────────
router.get('/chat', async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.session.user.id }).first();
    res.render('portal/chat', {
      pageTitle: 'Chat | GDCU',
      portalActive: 'chat',
      currentUser: user,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Profile ─────────────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.session.user.id }).first();
    const edit = req.query.edit === '1';

    // Get achievements (new badge-based system)
    const badges = await achievements.getUserAchievements(user.id);
    const streak = await achievements.getCurrentStreak(user.id);

    // Get cohorts
    const cohorts = await knex('cohorts')
      .join('cohort_members', 'cohort_members.cohort_id', 'cohorts.id')
      .where('cohort_members.user_id', user.id)
      .select('cohorts.*')
      .orderBy('cohorts.year', 'desc');

    res.render('portal/profile', { pageTitle: 'My Profile | GDCU', portalActive: 'profile', user, edit, achievements: badges, cohorts, streak });
  } catch (err) {
    next(err);
  }
});

// Update profile information (enhanced with photo, country, DOB, bio)
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const profileUploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'profiles');
fs.mkdirSync(profileUploadDir, { recursive: true });

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, profileUploadDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `user-${req.session.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

router.post('/profile', profileUpload.single('photo'), async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const updateData = {
      first_name: req.body.first_name?.trim(),
      last_name: req.body.last_name?.trim(),
      email: req.body.email?.trim(),
      country: req.body.country || null,
      date_of_birth: req.body.date_of_birth || null,
      bio: req.body.bio?.trim() || null,
      phone: req.body.phone || null,
      updated_at: knex.fn.now(),
    };

    // Handle photo upload
    if (req.file) {
      updateData.photo_url = `/uploads/profiles/${req.file.filename}`;
    }

    // Check email uniqueness
    const existing = await knex('users').where({ email: updateData.email }).whereNot({ id: userId }).first();
    if (existing) {
      req.flash('error', 'That email is already in use.');
      return res.redirect('/portal/profile?edit=1');
    }

    await knex('users').where({ id: userId }).update(updateData);

    // Update session
    req.session.user.name = `${updateData.first_name} ${updateData.last_name}`;
    req.session.user.email = updateData.email;

    req.flash('success', 'Your profile has been updated.');
    res.redirect('/portal/profile');
  } catch (err) {
    next(err);
  }
});

// Show password change form
router.get('/profile/change-password', async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.session.user.id }).first();
    res.render('portal/profile-password', { 
      pageTitle: 'Change Password | GDCU', 
      portalActive: 'profile', 
      user,
      form: {},
      error: null 
    });
  } catch (err) {
    next(err);
  }
});

// Change password
router.post('/profile/change-password', [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('New password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('New password must contain at least one number')
    .matches(/[!@#$%^&*]/)
    .withMessage('New password must contain at least one special character (!@#$%^&*)'),
  body('confirm_password').custom((value, { req }) => {
    if (value !== req.body.new_password) {
      throw new Error('Passwords do not match');
    }
    return true;
  }),
], async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const result = validationResult(req);

    if (!result.isEmpty()) {
      return res.status(400).render('portal/profile-password', {
        pageTitle: 'Change Password | GDCU',
        portalActive: 'profile',
        user: req.session.user,
        form: { new_password: req.body.new_password },
        error: result.array()[0].msg,
      });
    }

    const user = await knex('users').where({ id: userId }).first();
    const ok = await bcrypt.compare(req.body.current_password, user.password_hash);

    if (!ok) {
      return res.status(401).render('portal/profile-password', {
        pageTitle: 'Change Password | GDCU',
        portalActive: 'profile',
        user,
        form: { new_password: req.body.new_password },
        error: 'Current password is incorrect.',
      });
    }

    const hashedPassword = bcrypt.hashSync(req.body.new_password, 10);
    await knex('users').where({ id: userId }).update({
      password_hash: hashedPassword,
      updated_at: knex.fn.now(),
    });

    req.flash('success', 'Your password has been changed successfully.');
    res.redirect('/portal/profile');
  } catch (err) {
    next(err);
  }
});

// ─── Course discussion forums ────────────────────────────────

// List forums for a course the student is enrolled in.
router.get('/courses/:slug/forums', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) {
      return res.render('portal/payment-required', { pageTitle: `${course.title} | GDCU`, portalActive: 'my-courses', course });
    }

    const forums = await knex('course_forums')
      .where({ course_id: course.id, published: true })
      .orderBy('sort_order')
      .limit(50);

    // Count topics and latest activity per forum
    for (const f of forums) {
      f.topicCount = Number((await knex('forum_topics').where({ forum_id: f.id }).count({ c: '*' }).first()).c);
      f.replyCount = Number((await knex('forum_replies').whereIn('topic_id', knex('forum_topics').where({ forum_id: f.id }).select('id')).count({ c: '*' }).first()).c);
      const latest = await knex('forum_topics')
        .where({ forum_id: f.id })
        .orderBy('updated_at', 'desc')
        .first();
      f.latestTopic = latest || null;
    }

    res.render('portal/forums', {
      pageTitle: `Forums — ${course.title} | GDCU`,
      portalActive: 'courses',
      course,
      forums,
    });
  } catch (err) { next(err); }
});

// List topics in a forum.
router.get('/courses/:slug/forums/:forumId', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) {
      return res.render('portal/payment-required', { pageTitle: `${course.title} | GDCU`, portalActive: 'my-courses', course });
    }

    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id, published: true }).first();
    if (!forum) return res.status(404).render('errors/404', { pageTitle: 'Forum not found', layout: 'layouts/portal' });

    let topics = await knex('forum_topics')
      .where({ forum_id: forum.id })
      .join('users', 'forum_topics.user_id', 'users.id')
      .select('forum_topics.*', 'users.first_name', 'users.last_name')
      .orderBy('pinned', 'desc')
      .orderBy('updated_at', 'desc')
      .limit(100);

    // Annotate with reply count, last reply, and unread state
    const viewed = await knex('forum_topic_views').where({ user_id: userId }).pluck('topic_id');
    const viewedSet = new Set(viewed);
    for (const t of topics) {
      t.replyCount = Number((await knex('forum_replies').where({ topic_id: t.id }).count({ c: '*' }).first()).c);
      const lastReply = await knex('forum_replies')
        .where({ topic_id: t.id })
        .orderBy('created_at', 'desc')
        .first();
      t.lastActivity = lastReply ? lastReply.created_at : t.created_at;
      t.unread = !viewedSet.has(t.id);
    }

    res.render('portal/forum-topics', {
      pageTitle: `${forum.title} — ${course.title} | GDCU`,
      portalActive: 'courses',
      course,
      forum,
      topics,
    });
  } catch (err) { next(err); }
});

// View a topic and its replies.
router.get('/courses/:slug/forums/:forumId/topics/:topicId', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) {
      return res.render('portal/payment-required', { pageTitle: `${course.title} | GDCU`, portalActive: 'my-courses', course });
    }

    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id, published: true }).first();
    if (!forum) return res.status(404).render('errors/404', { pageTitle: 'Forum not found', layout: 'layouts/portal' });

    const topic = await knex('forum_topics')
      .where({ 'forum_topics.id': req.params.topicId, forum_id: forum.id })
      .join('users', 'forum_topics.user_id', 'users.id')
      .select('forum_topics.*', 'users.first_name', 'users.last_name')
      .first();
    if (!topic) return res.status(404).render('errors/404', { pageTitle: 'Topic not found', layout: 'layouts/portal' });

    // Increment view count
    await knex('forum_topics').where({ id: topic.id }).increment('views', 1);

    const replies = await knex('forum_replies')
      .where({ topic_id: topic.id })
      .join('users', 'forum_replies.user_id', 'users.id')
      .select('forum_replies.*', 'users.first_name', 'users.last_name')
      .orderBy('created_at', 'asc')
      .limit(200);

    // Mark as viewed by this user
    await knex('forum_topic_views')
      .insert({ topic_id: topic.id, user_id: userId, viewed_at: knex.fn.now() })
      .onConflict(['topic_id', 'user_id'])
      .merge({ viewed_at: knex.fn.now() });

    const subscribed = !!(await knex('forum_subscriptions').where({ topic_id: topic.id, user_id: userId }).first());

    res.render('portal/forum-topic', {
      pageTitle: `${topic.title} — ${course.title} | GDCU`,
      portalActive: 'courses',
      course,
      forum,
      topic,
      replies,
      subscribed,
      isStaff: ['faculty', 'staff', 'admin'].includes(req.session.user.role),
    });
  } catch (err) { next(err); }
});

// Create a new topic.
router.post('/courses/:slug/forums/:forumId/topics', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);

    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id, published: true }).first();
    if (!forum) return res.redirect(`/portal/courses/${course.slug}`);
    if (forum.locked) { req.flash('error', 'This forum is locked.'); return res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}`); }

    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    if (!title || !body) {
      req.flash('error', 'Title and message are required.');
      return res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}`);
    }

    const [topicIdRaw] = await knex('forum_topics').insert({
      forum_id: forum.id,
      user_id: userId,
      title,
      body,
    });
    const topicId = Array.isArray(topicIdRaw) ? topicIdRaw[0] : topicIdRaw;

    // Auto-subscribe the author
    await knex('forum_subscriptions').insert({ topic_id: topicId, user_id: userId }).onConflict(['topic_id', 'user_id']).ignore();

    // Check forum achievement milestones
    achievements.checkForumFirstTopic(userId).catch(() => {});

    req.flash('success', 'Topic posted.');
    res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}/topics/${topicId}`);
  } catch (err) { next(err); }
});

// Reply to a topic.
router.post('/courses/:slug/forums/:forumId/topics/:topicId/replies', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);

    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id, published: true }).first();
    if (!forum) return res.redirect(`/portal/courses/${course.slug}`);

    const topic = await knex('forum_topics').where({ id: req.params.topicId, forum_id: forum.id }).first();
    if (!topic) return res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}`);
    if (topic.locked) { req.flash('error', 'This topic is locked.'); return res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}/topics/${topic.id}`); }

    const body = (req.body.body || '').trim();
    if (!body) {
      req.flash('error', 'Please write a reply.');
      return res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}/topics/${topic.id}`);
    }

    await knex('forum_replies').insert({ topic_id: topic.id, user_id: userId, body });

    // Notify subscribers (excluding the author)
    const subs = await knex('forum_subscriptions').where({ topic_id: topic.id }).whereNot('user_id', userId).pluck('user_id');
    for (const subUserId of subs) {
      notifyUser(subUserId, {
        type: 'message',
        title: 'New reply in forum',
        body: `Someone replied to "${topic.title}" in ${course.title}`,
        link: `/portal/courses/${course.slug}/forums/${forum.id}/topics/${topic.id}`,
      });
    }

    // Auto-subscribe the replier
    await knex('forum_subscriptions').insert({ topic_id: topic.id, user_id: userId }).onConflict(['topic_id', 'user_id']).ignore();

    // Check forum reply milestones
    achievements.checkForumReplies(userId).catch(() => {});

    req.flash('success', 'Reply posted.');
    res.redirect(`/portal/courses/${course.slug}/forums/${forum.id}/topics/${topic.id}`);
  } catch (err) { next(err); }
});

// Subscribe / unsubscribe from a topic.
router.post('/courses/:slug/forums/:forumId/topics/:topicId/subscribe', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);

    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id, published: true }).first();
    if (!forum) return res.redirect(`/portal/courses/${course.slug}/forums`);
    const topic = await knex('forum_topics').where({ id: req.params.topicId, forum_id: forum.id }).first();
    if (!topic) return res.redirect(`/portal/courses/${course.slug}/forums/${req.params.forumId}`);

    const existing = await knex('forum_subscriptions').where({ topic_id: topic.id, user_id: userId }).first();
    if (existing) {
      await knex('forum_subscriptions').where({ id: existing.id }).del();
      req.flash('info', 'Unsubscribed from topic.');
    } else {
      await knex('forum_subscriptions').insert({ topic_id: topic.id, user_id: userId });
      req.flash('success', 'Subscribed to topic.');
    }
    res.redirect(`/portal/courses/${course.slug}/forums/${req.params.forumId}/topics/${topic.id}`);
  } catch (err) { next(err); }
});

// Staff/faculty: pin/unpin or lock/unlock a topic.
router.post('/courses/:slug/forums/:forumId/topics/:topicId/moderate', async (req, res, next) => {
  try {
    if (!['faculty', 'staff', 'admin'].includes(req.session.user.role)) {
      return res.status(403).render('errors/404', { pageTitle: 'Not authorised', layout: 'layouts/portal' });
    }
    const userId = req.session.user.id;
    const { course } = await findEnrollment(userId, req.params.slug);
    if (!course) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);

    const forum = await knex('course_forums').where({ id: req.params.forumId, course_id: course.id, published: true }).first();
    if (!forum) return res.redirect(`/portal/courses/${course.slug}`);
    const topic = await knex('forum_topics').where({ id: req.params.topicId, forum_id: forum.id }).first();
    if (!topic) return res.redirect(`/portal/courses/${course.slug}/forums/${req.params.forumId}`);

    const update = {};
    if (req.body.action === 'pin') update.pinned = !topic.pinned;
    if (req.body.action === 'lock') update.locked = !topic.locked;
    if (Object.keys(update).length) await knex('forum_topics').where({ id: topic.id }).update(update);

    res.redirect(`/portal/courses/${course.slug}/forums/${req.params.forumId}/topics/${topic.id}`);
  } catch (err) { next(err); }
});

// ─── Essay submission ────────────────────────────────────────


// ─── Get next lesson availability (AJAX) ──────────────────
router.get('/courses/:slug/next-available', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.json({ available: false });
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.json({ available: false, reason: 'payment_required' });

    const structure = await getCourseStructure(course.id, enrollment.id);
    const flat = [];
    structure.forEach(m => m.lessons.forEach(l => flat.push(l)));

    // Find current lesson (passed as query param)
    const currentId = parseInt(req.query.current_lesson_id);
    if (!currentId) return res.json({ available: false });

    const idx = flat.findIndex(l => l.id === currentId);
    if (idx < 0 || idx >= flat.length - 1) return res.json({ available: false, done: true });

    const nextLesson = flat[idx + 1];
    const availability = await isLessonAvailable(enrollment.id, nextLesson.id, structure);
    
    res.json({
      lesson_id: nextLesson.id,
      title: nextLesson.title,
      available: availability.available,
      next_available: availability.next_available ? availability.next_available.toISOString() : null,
      reason: availability.reason || null,
    });
  } catch (err) {
    console.error('Next available error:', err);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

router.post('/courses/:slug/modules/:moduleId/essay', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.redirect('/portal/catalog');
    if (!(await programmes.hasPaidTuition(userId, course.program_id))) return res.redirect(`/portal/courses/${course.slug}`);

    const sharedModuleIds = await sharedModuleIdsForCourse(course.id);
    const mod = await knex('modules')
      .where('id', req.params.moduleId)
      .andWhere(function () {
        this.where('course_id', course.id);
        if (sharedModuleIds.length) this.orWhereIn('shared_module_id', sharedModuleIds);
      })
      .first();
    if (!mod || !mod.essay_required) {
      req.flash('error', 'No essay is required for this module.');
      return res.redirect(`/portal/courses/${course.slug}`);
    }

    if (!req.body.body || !req.body.body.trim()) {
      req.flash('error', 'Please write your essay before submitting.');
      return res.redirect(`/portal/courses/${course.slug}`);
    }

    const result = await submitEssay(userId, enrollment.id, mod.id, req.body.body.trim());
    req.flash(result.success ? 'success' : 'error', result.message);
    res.redirect(`/portal/courses/${course.slug}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
