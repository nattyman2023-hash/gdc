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
const { stripe, isConfigured } = require('../lib/stripe');
const { notifyRoles } = require('../lib/notify');

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
  const enrollment = await knex('enrollments').where({ user_id: userId, course_id: course.id }).first();
  return { course, enrollment };
}

// ─── Dashboard ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const enrollments = await knex('enrollments')
      .join('courses', 'enrollments.course_id', 'courses.id')
      .where('enrollments.user_id', userId)
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

    res.render('portal/dashboard', {
      pageTitle: 'Student Workspace | GDCU',
      portalActive: 'dashboard',
      enrollments,
      announcements,
      certificates,
      outstanding,
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
    const enrolledIds = await knex('enrollments').where({ user_id: userId }).pluck('course_id');
    // List/card view toggle, remembered per session (defaults to cards).
    if (req.query.view === 'grid' || req.query.view === 'list') req.session.catalogView = req.query.view;
    const view = req.session.catalogView || 'grid';
    res.render('portal/catalog', {
      pageTitle: 'Course Catalogue | GDCU',
      portalActive: 'catalog',
      courses,
      enrolledIds,
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
    if (!existing) {
      await knex('enrollments').insert({ user_id: userId, course_id: course.id, status: 'active', progress_pct: 0 });
      req.flash('success', `You are enrolled in ${course.title}.`);
    } else {
      req.flash('info', `You are already enrolled in ${course.title}.`);
    }
    res.redirect(`/portal/courses/${course.slug}`);
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

    const structure = await getCourseStructure(course.id, enrollment.id);
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
    const allQuizzes = await knex('quizzes').where({ course_id: course.id }).orderBy('sort_order');
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

    const assignments = await knex('assignments').where({ course_id: course.id, published: true }).orderBy('created_at', 'desc');
    for (const asg of assignments) {
      asg.submission = await knex('assignment_submissions').where({ assignment_id: asg.id, user_id: userId }).first();
    }

    res.render('portal/course', {
      pageTitle: `${course.title} | GDCU`,
      portalActive: 'courses',
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

    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .andWhere('modules.course_id', course.id)
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
        portalActive: 'courses',
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
      portalActive: 'courses',
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

    const lesson = await knex('lessons')
      .join('modules', 'lessons.module_id', 'modules.id')
      .where('lessons.id', req.params.lessonId)
      .andWhere('modules.course_id', course.id)
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
    const course = await knex('courses').where({ id: assignment.course_id }).first();
    const enrollment = await knex('enrollments').where({ user_id: userId, course_id: course.id }).first();
    if (!enrollment) { req.flash('info', 'Enrol in the course to access this assignment.'); return res.redirect('/portal/catalog'); }
    const submission = await knex('assignment_submissions').where({ assignment_id: assignment.id, user_id: userId }).first();
    res.render('portal/assignment', { pageTitle: `${assignment.title} | GDCU`, portalActive: 'courses', assignment, course, submission });
  } catch (err) { next(err); }
});

router.post('/assignments/:id/submit', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const assignment = await knex('assignments').where({ id: req.params.id, published: true }).first();
    if (!assignment) return res.redirect('/portal');
    const enrollment = await knex('enrollments').where({ user_id: userId, course_id: assignment.course_id }).first();
    if (!enrollment) return res.redirect('/portal/catalog');
    const existing = await knex('assignment_submissions').where({ assignment_id: assignment.id, user_id: userId }).first();
    if (existing && existing.status === 'graded') {
      req.flash('info', 'This assignment has already been graded and cannot be resubmitted.');
      return res.redirect(`/portal/assignments/${assignment.id}`);
    }
    const data = { body: req.body.body || null, url: req.body.url || null, status: 'submitted', submitted_at: knex.fn.now() };
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
  const fromApps = await knex('applications').where({ student_user_id: userId }).whereNotNull('program_id').pluck('program_id');
  const fromCourses = await knex('enrollments')
    .join('courses', 'enrollments.course_id', 'courses.id')
    .where('enrollments.user_id', userId).whereNotNull('courses.program_id').pluck('courses.program_id');
  return Array.from(new Set([...fromApps, ...fromCourses]));
}

// Whether the student may sit a given exam, and where "back" should point.
async function examAccess(userId, quiz) {
  if (quiz.is_final_exam && (quiz.exam_scope === 'programme' || quiz.exam_scope === 'year')) {
    const progIds = await studentProgrammeIds(userId);
    return { allowed: !!quiz.program_id && progIds.includes(quiz.program_id), backUrl: '/portal/exams', course: null };
  }
  const course = quiz.course_id ? await knex('courses').where({ id: quiz.course_id }).first() : null;
  const enrollment = quiz.course_id ? await knex('enrollments').where({ user_id: userId, course_id: quiz.course_id }).first() : null;
  return { allowed: !!enrollment, backUrl: course ? `/portal/courses/${course.slug}` : '/portal/catalog', course };
}

// ─── Programme / year final exams available to the student ───
router.get('/exams', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const progIds = await studentProgrammeIds(userId);
    let exams = [];
    if (progIds.length) {
      exams = await knex('quizzes')
        .where('is_final_exam', true).whereIn('exam_scope', ['year', 'programme'])
        .whereIn('program_id', progIds)
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
    // Block-sequence quizzes: the covered lessons must be completed first.
    if (quiz.after_block && access.course) {
      const enr = await knex('enrollments').where({ user_id: userId, course_id: quiz.course_id }).first();
      const struct = await getCourseStructure(quiz.course_id, enr.id);
      const qa = await isQuizAvailable(enr.id, quiz, struct);
      if (!qa.available) {
        req.flash('info', 'Finish the lessons this quiz covers before taking it.');
        return res.redirect(`/portal/courses/${access.course.slug}`);
      }
    }

    const questions = await knex('quiz_questions').where({ quiz_id: quiz.id }).orderBy('sort_order').orderBy('id');
    for (const q of questions) {
      q.options = await knex('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
    }

    res.render('portal/quiz', {
      pageTitle: `${quiz.title} | GDCU`,
      portalActive: 'courses',
      quiz,
      course: access.course,
      backUrl: access.backUrl,
      questions,
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

    const questions = await knex('quiz_questions').where({ quiz_id: quiz.id });
    let correctCount = 0;

    const [attemptIdRaw] = await knex('quiz_attempts').insert({
      quiz_id: quiz.id, user_id: userId, score: 0, passed: false, started_at: knex.fn.now(),
    });
    const attemptId = Array.isArray(attemptIdRaw) ? attemptIdRaw[0] : attemptIdRaw;

    for (const q of questions) {
      // Form fields named q_<questionId> (radio = single value)
      const submitted = req.body[`q_${q.id}`];
      const timedOut = req.body.timed_out === '1';
      const correctOptions = await knex('quiz_options').where({ question_id: q.id, is_correct: true }).pluck('id');

      let isCorrect = false;
      let chosenId = null;
      if (submitted !== undefined && submitted !== '') {
        chosenId = Number(submitted);
        isCorrect = correctOptions.includes(chosenId);
      }
      if (isCorrect) correctCount += 1;

      await knex('quiz_answers').insert({
        attempt_id: attemptId,
        question_id: q.id,
        option_id: chosenId,
        correct: isCorrect,
      });
    }

    const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
    const passed = score >= quiz.pass_mark;
    await knex('quiz_attempts').where({ id: attemptId }).update({ score, passed, submitted_at: knex.fn.now() });

    // Passing a course final exam completes the enrolment (certificate becomes claimable).
    if (passed && quiz.is_final_exam && quiz.exam_scope === 'course' && quiz.course_id) {
      await knex('enrollments').where({ user_id: userId, course_id: quiz.course_id })
        .update({ status: 'completed', completed_at: knex.fn.now() });
    }

    res.redirect(`/portal/attempts/${attemptId}`);
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
    const answerByQ = {};
    answers.forEach((a) => { answerByQ[a.question_id] = a; });

    for (const q of questions) {
      q.options = await knex('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
      q.chosen = answerByQ[q.id] ? answerByQ[q.id].option_id : null;
      q.gotCorrect = answerByQ[q.id] ? !!answerByQ[q.id].correct : false;
    }

    res.render('portal/quiz-result', {
      pageTitle: `Quiz Result | GDCU`,
      portalActive: 'courses',
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
    const invoices = await knex('invoices').where({ user_id: userId }).orderBy('due_date');
    const today = new Date().toISOString().slice(0, 10);
    let outstanding = 0;
    for (const inv of invoices) {
      // Flag overdue (unpaid + past due date) for display
      inv.is_overdue = inv.status !== 'paid' && inv.status !== 'void' && inv.due_date && String(inv.due_date).slice(0, 10) < today;
      if (inv.status === 'sent' || inv.status === 'overdue') outstanding += Number(inv.amount);
    }
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

    // Get achievements
    const achievements = await knex('achievements').where({ user_id: user.id }).orderBy('awarded_at', 'desc').limit(20);

    // Get cohorts
    const cohorts = await knex('cohorts')
      .join('cohort_members', 'cohort_members.cohort_id', 'cohorts.id')
      .where('cohort_members.user_id', user.id)
      .select('cohorts.*')
      .orderBy('cohorts.year', 'desc');

    res.render('portal/profile', { pageTitle: 'My Profile | GDCU', portalActive: 'profile', user, edit, achievements, cohorts });
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

// ─── Essay submission ────────────────────────────────────────


// ─── Get next lesson availability (AJAX) ──────────────────
router.get('/courses/:slug/next-available', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { course, enrollment } = await findEnrollment(userId, req.params.slug);
    if (!course || !enrollment) return res.json({ available: false });

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

    const mod = await knex('modules')
      .where({ id: req.params.moduleId, course_id: course.id })
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
