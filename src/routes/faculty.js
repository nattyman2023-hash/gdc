/**
 * Faculty teaching portal — requires role faculty or admin.
 * Dashboard of taught courses, student rosters with progress, a gradebook of
 * quiz attempts, and the ability to post course announcements.
 */
const express = require('express');
const knex = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { notifyUser } = require('../lib/notify');

const router = express.Router();

router.use(requireRole('faculty', 'admin'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/faculty';
  res.locals.facultyActive = '';
  next();
});

// Courses taught by this user (admins see all courses).
async function taughtCourses(user) {
  const q = knex('courses').where({ published: true });
  if (user.role !== 'admin') q.where('instructor_id', user.id);
  return q.orderBy('sort_order');
}

// Dashboard
router.get('/', async (req, res, next) => {
  try {
    const courses = await taughtCourses(req.session.user);
    for (const c of courses) {
      c.student_count = Number((await knex('enrollments').where({ course_id: c.id }).count({ x: '*' }).first()).x);
      const avg = await knex('enrollments').where({ course_id: c.id }).avg({ a: 'progress_pct' }).first();
      c.avg_progress = Math.round(Number(avg.a || 0));
      c.quiz_count = Number((await knex('quizzes').where({ course_id: c.id }).count({ x: '*' }).first()).x);
    }
    const totalStudents = courses.reduce((s, c) => s + c.student_count, 0);
    res.render('faculty/dashboard', {
      pageTitle: 'Faculty Dashboard | GDCU',
      facultyActive: 'dashboard',
      courses,
      totalStudents,
    });
  } catch (err) { next(err); }
});

// Combined roster across all taught courses
router.get('/students', async (req, res, next) => {
  try {
    const courses = await taughtCourses(req.session.user);
    const courseIds = courses.map((c) => c.id);
    let students = [];
    if (courseIds.length) {
      students = await knex('enrollments')
        .join('users', 'enrollments.user_id', 'users.id')
        .join('courses', 'enrollments.course_id', 'courses.id')
        .whereIn('enrollments.course_id', courseIds)
        .select('users.first_name', 'users.last_name', 'users.email', 'users.id as user_id',
          'courses.title as course_title', 'courses.slug as course_slug', 'courses.id as course_id',
          'enrollments.progress_pct', 'enrollments.status')
        .orderBy(['users.last_name', 'courses.title']);
    }
    res.render('faculty/students', { pageTitle: 'My Students | GDCU', facultyActive: 'students', students });
  } catch (err) { next(err); }
});

// Course detail: roster + gradebook + announcements
router.get('/courses/:slug', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ slug: req.params.slug }).first();
    if (!course) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/faculty' });
    if (req.session.user.role !== 'admin' && course.instructor_id !== req.session.user.id) {
      return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    }

    const roster = await knex('enrollments')
      .join('users', 'enrollments.user_id', 'users.id')
      .where('enrollments.course_id', course.id)
      .select('users.id as user_id', 'users.first_name', 'users.last_name', 'users.email',
        'enrollments.progress_pct', 'enrollments.status')
      .orderBy('users.last_name');

    const quizzes = await knex('quizzes').where({ course_id: course.id }).orderBy('sort_order');
    // Gradebook: best attempt per student per quiz
    for (const student of roster) {
      student.scores = {};
      for (const quiz of quizzes) {
        const best = await knex('quiz_attempts')
          .where({ quiz_id: quiz.id, user_id: student.user_id })
          .orderBy('score', 'desc')
          .first();
        student.scores[quiz.id] = best ? best.score : null;
      }
    }

    const announcements = await knex('announcements').where({ course_id: course.id }).orderBy('published_at', 'desc');
    const assignments = await knex('assignments').where({ course_id: course.id }).orderBy('created_at', 'desc');
    for (const asg of assignments) {
      asg.submission_count = Number((await knex('assignment_submissions').where({ assignment_id: asg.id }).count({ c: '*' }).first()).c);
      asg.graded_count = Number((await knex('assignment_submissions').where({ assignment_id: asg.id, status: 'graded' }).count({ c: '*' }).first()).c);
    }

    res.render('faculty/course', {
      pageTitle: `${course.title} | Faculty`,
      facultyActive: 'dashboard',
      course, roster, quizzes, announcements, assignments,
    });
  } catch (err) { next(err); }
});

// Post a course announcement
router.post('/courses/:slug/announce', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ slug: req.params.slug }).first();
    if (!course) return res.redirect('/faculty');
    if (req.session.user.role !== 'admin' && course.instructor_id !== req.session.user.id) {
      return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    }
    if (req.body.title && req.body.body) {
      await knex('announcements').insert({
        course_id: course.id,
        title: req.body.title,
        body: req.body.body,
        author: `Dr. ${req.session.user.name}`,
        published_at: knex.fn.now(),
      });
      const ids = await knex('enrollments').where({ course_id: course.id }).pluck('user_id');
      for (const id of ids) await notifyUser(id, { type: 'info', title: `Announcement: ${course.title}`, body: req.body.title, link: `/portal/courses/${course.slug}` });
      req.flash('success', 'Announcement posted to your students.');
    }
    res.redirect(`/faculty/courses/${course.slug}`);
  } catch (err) { next(err); }
});

// ─── My interviews ───────────────────────────────────────────
router.get('/interviews', async (req, res, next) => {
  try {
    const q = knex('interviews')
      .join('applications', 'interviews.application_id', 'applications.id')
      .select('interviews.*', 'applications.first_name', 'applications.last_name', 'applications.reference', 'applications.id as application_id')
      .orderBy('interviews.scheduled_at');
    if (req.session.user.role !== 'admin') q.where('interviews.interviewer_id', req.session.user.id);
    const all = await q;
    const now = Date.now();
    const upcoming = all.filter((iv) => new Date(iv.scheduled_at).getTime() >= now && iv.status === 'scheduled');
    const past = all.filter((iv) => !(new Date(iv.scheduled_at).getTime() >= now && iv.status === 'scheduled'));
    res.render('faculty/interviews', { pageTitle: 'My Interviews | GDCU', facultyActive: 'interviews', upcoming, past });
  } catch (err) { next(err); }
});

// Academic calendar for faculty (their audience + public + everyone)
router.get('/schedule', async (req, res, next) => {
  try {
    const calendar = require('../lib/calendar');
    const events = await calendar.upcomingFor('faculty', { limit: 100 });
    res.render('faculty/schedule', { pageTitle: 'Schedule & Key Dates | GDCU', facultyActive: 'schedule', groups: calendar.groupByMonth(events), cats: calendar.CATEGORIES });
  } catch (err) { next(err); }
});

router.post('/interviews/:id/outcome', async (req, res, next) => {
  try {
    const iv = await knex('interviews').where({ id: req.params.id }).first();
    if (!iv) return res.redirect('/faculty/interviews');
    if (req.session.user.role !== 'admin' && iv.interviewer_id !== req.session.user.id) {
      return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    }
    const outcome = ['pending', 'recommend', 'hold', 'decline'].includes(req.body.outcome) ? req.body.outcome : 'pending';
    await knex('interviews').where({ id: iv.id }).update({
      outcome, rating: req.body.rating ? Number(req.body.rating) : null,
      outcome_notes: req.body.outcome_notes || null, status: 'completed', updated_at: knex.fn.now(),
    });
    req.flash('success', 'Interview outcome saved.');
    res.redirect('/faculty/interviews');
  } catch (err) { next(err); }
});

// ─── Office hours & mentorship ───────────────────────────────
router.get('/office-hours', async (req, res, next) => {
  try {
    const slots = await knex('office_hour_slots').where({ faculty_id: req.session.user.id }).orderBy('starts_at');
    for (const s of slots) {
      s.bookings = await knex('office_hour_bookings')
        .join('users', 'office_hour_bookings.user_id', 'users.id')
        .where('office_hour_bookings.slot_id', s.id)
        .select('users.first_name', 'users.last_name', 'office_hour_bookings.note');
    }
    res.render('faculty/office-hours', { pageTitle: 'Office Hours | GDCU', facultyActive: 'office', slots });
  } catch (err) { next(err); }
});

router.post('/office-hours', async (req, res, next) => {
  try {
    if (!req.body.starts_at) {
      req.flash('error', 'Please choose a start time.');
      return res.redirect('/faculty/office-hours');
    }
    const capacity = Number(req.body.capacity || 1);
    const startsAt = new Date(req.body.starts_at);
    const endsAt = req.body.ends_at ? new Date(req.body.ends_at) : null;
    if (!Number.isInteger(capacity) || capacity < 1 || Number.isNaN(startsAt.getTime()) || (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt))) {
      req.flash('error', 'Please provide valid office-hour times and capacity.');
      return res.redirect('/faculty/office-hours');
    }
    await knex('office_hour_slots').insert({
      faculty_id: req.session.user.id,
      starts_at: req.body.starts_at.replace('T', ' ') + ':00',
      ends_at: req.body.ends_at ? req.body.ends_at.replace('T', ' ') + ':00' : null,
      mode: req.body.mode || 'online',
      join_url: req.body.join_url || null,
      capacity,
      topic: req.body.topic || null,
    });
    req.flash('success', 'Office-hour slot added.');
    res.redirect('/faculty/office-hours');
  } catch (err) { next(err); }
});

router.post('/office-hours/:id/delete', async (req, res, next) => {
  try {
    await knex('office_hour_slots').where({ id: req.params.id, faculty_id: req.session.user.id }).del();
    req.flash('success', 'Slot removed.');
    res.redirect('/faculty/office-hours');
  } catch (err) { next(err); }
});

// ─── Assignments ─────────────────────────────────────────────
async function loadOwnedAssignment(req) {
  const assignment = await knex('assignments').where({ id: req.params.id }).first();
  if (!assignment) return { assignment: null };
  const course = await knex('courses').where({ id: assignment.course_id }).first();
  const owns = req.session.user.role === 'admin' || (course && course.instructor_id === req.session.user.id);
  return { assignment, course, owns };
}

router.post('/courses/:slug/assignments', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ slug: req.params.slug }).first();
    if (!course) return res.redirect('/faculty');
    if (req.session.user.role !== 'admin' && course.instructor_id !== req.session.user.id) {
      return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    }
    const maxPoints = Number(req.body.max_points || 100);
    const dueDate = req.body.due_date ? new Date(req.body.due_date) : null;
    if (!req.body.title || !req.body.title.trim() || !Number.isFinite(maxPoints) || maxPoints <= 0 || (dueDate && Number.isNaN(dueDate.getTime()))) {
      req.flash('error', 'Please provide a title, valid points, and a valid due date.');
      return res.redirect(`/faculty/courses/${course.slug}`);
    }
    await knex('assignments').insert({
      course_id: course.id,
      title: req.body.title.trim(),
      instructions: req.body.instructions || null,
      due_date: req.body.due_date || null,
      max_points: maxPoints,
      created_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
    req.flash('success', 'Assignment created.');
    res.redirect(`/faculty/courses/${course.slug}`);
  } catch (err) { next(err); }
});

router.get('/assignments/:id', async (req, res, next) => {
  try {
    const { assignment, course, owns } = await loadOwnedAssignment(req);
    if (!assignment) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/faculty' });
    if (!owns) return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    // Submissions joined to students
    const submissions = await knex('assignment_submissions')
      .join('users', 'assignment_submissions.user_id', 'users.id')
      .where('assignment_submissions.assignment_id', assignment.id)
      .select('assignment_submissions.*', 'users.first_name', 'users.last_name')
      .orderBy('assignment_submissions.submitted_at', 'desc');
    res.render('faculty/assignment', { pageTitle: `${assignment.title} | Faculty`, facultyActive: 'dashboard', assignment, course, submissions });
  } catch (err) { next(err); }
});

router.post('/submissions/:sid/grade', async (req, res, next) => {
  try {
    const submission = await knex('assignment_submissions').where({ id: req.params.sid }).first();
    if (!submission) return res.redirect('/faculty');
    const assignment = await knex('assignments').where({ id: submission.assignment_id }).first();
    const course = await knex('courses').where({ id: assignment.course_id }).first();
    const owns = req.session.user.role === 'admin' || (course && course.instructor_id === req.session.user.id);
    if (!owns) return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    const grade = req.body.grade === '' || req.body.grade === undefined ? null : Number(req.body.grade);
    if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > Number(assignment.max_points))) {
      req.flash('error', `Grade must be between 0 and ${assignment.max_points}.`);
      return res.redirect(`/faculty/assignments/${assignment.id}`);
    }
    await knex('assignment_submissions').where({ id: submission.id }).update({
      grade,
      feedback: req.body.feedback || null,
      status: 'graded', graded_at: knex.fn.now(),
    });
    notifyUser(submission.user_id, { type: 'success', title: 'Assignment graded', body: `${assignment.title}: ${req.body.grade}/${assignment.max_points}`, link: `/portal/assignments/${assignment.id}` });
    req.flash('success', 'Submission graded.');
    res.redirect(`/faculty/assignments/${assignment.id}`);
  } catch (err) { next(err); }
});

router.post('/assignments/:id/delete', async (req, res, next) => {
  try {
    const { assignment, course, owns } = await loadOwnedAssignment(req);
    if (assignment && owns) await knex('assignments').where({ id: assignment.id }).del();
    res.redirect(course ? `/faculty/courses/${course.slug}` : '/faculty');
  } catch (err) { next(err); }
});

// ─── Quiz builder ────────────────────────────────────────────
// Guard: the actor must own the quiz's course (or be admin).
async function loadOwnedQuiz(req) {
  const quiz = await knex('quizzes').where({ id: req.params.id }).first();
  if (!quiz) return { quiz: null, course: null };
  const course = await knex('courses').where({ id: quiz.course_id }).first();
  const owns = req.session.user.role === 'admin' || (course && course.instructor_id === req.session.user.id);
  return { quiz, course, owns };
}

// Create a quiz for a course
router.post('/courses/:slug/quizzes', async (req, res, next) => {
  try {
    const course = await knex('courses').where({ slug: req.params.slug }).first();
    if (!course) return res.redirect('/faculty');
    if (req.session.user.role !== 'admin' && course.instructor_id !== req.session.user.id) {
      return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    }
    const max = await knex('quizzes').where({ course_id: course.id }).max({ m: 'sort_order' }).first();
    const passMark = Number(req.body.pass_mark || 60);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      req.flash('error', 'Pass mark must be between 0 and 100.');
      return res.redirect(`/faculty/courses/${course.slug}`);
    }
    const [idRaw] = await knex('quizzes').insert({
      course_id: course.id,
      title: req.body.title || 'New quiz',
      description: req.body.description || null,
      pass_mark: passMark,
      sort_order: (Number(max.m) || 0) + 1,
    });
    const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
    req.flash('success', 'Quiz created. Now add questions.');
    res.redirect(`/faculty/quizzes/${id}/edit`);
  } catch (err) { next(err); }
});

// Edit a quiz (meta + questions)
router.get('/quizzes/:id/edit', async (req, res, next) => {
  try {
    const { quiz, course, owns } = await loadOwnedQuiz(req);
    if (!quiz) return res.status(404).render('errors/404', { pageTitle: 'Not found', layout: 'layouts/faculty' });
    if (!owns) return res.status(403).render('errors/403', { pageTitle: 'Access denied', layout: 'layouts/faculty' });
    const questions = await knex('quiz_questions').where({ quiz_id: quiz.id }).orderBy('sort_order').orderBy('id');
    for (const q of questions) q.options = await knex('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
    res.render('faculty/quiz-edit', { pageTitle: 'Edit Quiz | GDCU', facultyActive: 'dashboard', quiz, course, questions });
  } catch (err) { next(err); }
});

router.post('/quizzes/:id', async (req, res, next) => {
  try {
    const { quiz, course, owns } = await loadOwnedQuiz(req);
    if (!quiz || !owns) return res.redirect('/faculty');
    const passMark = req.body.pass_mark === '' || req.body.pass_mark === undefined ? quiz.pass_mark : Number(req.body.pass_mark);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      req.flash('error', 'Pass mark must be between 0 and 100.');
      return res.redirect(`/faculty/quizzes/${quiz.id}/edit`);
    }
    await knex('quizzes').where({ id: quiz.id }).update({
      title: req.body.title || quiz.title,
      description: req.body.description || null,
      pass_mark: passMark,
    });
    req.flash('success', 'Quiz updated.');
    res.redirect(`/faculty/quizzes/${quiz.id}/edit`);
  } catch (err) { next(err); }
});

router.post('/quizzes/:id/delete', async (req, res, next) => {
  try {
    const { quiz, course, owns } = await loadOwnedQuiz(req);
    if (quiz && owns) await knex('quizzes').where({ id: quiz.id }).del();
    res.redirect(course ? `/faculty/courses/${course.slug}` : '/faculty');
  } catch (err) { next(err); }
});

// Add a question (single-answer, 2–4 options, one correct)
router.post('/quizzes/:id/questions', async (req, res, next) => {
  try {
    const { quiz, owns } = await loadOwnedQuiz(req);
    if (!quiz || !owns) return res.redirect('/faculty');

    const options = [req.body.opt1, req.body.opt2, req.body.opt3, req.body.opt4]
      .map((t) => (t || '').trim()).filter(Boolean);
    if (!req.body.prompt || options.length < 2) {
      req.flash('error', 'A question needs a prompt and at least two options.');
      return res.redirect(`/faculty/quizzes/${quiz.id}/edit`);
    }
    const correctIdx = Number(req.body.correct || 0); // index into options
    if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= options.length) {
      req.flash('error', 'Choose one correct answer.');
      return res.redirect(`/faculty/quizzes/${quiz.id}/edit`);
    }
    const max = await knex('quiz_questions').where({ quiz_id: quiz.id }).max({ m: 'sort_order' }).first();
    const [qidRaw] = await knex('quiz_questions').insert({
      quiz_id: quiz.id, prompt: req.body.prompt, type: 'single',
      explanation: req.body.explanation || null, sort_order: (Number(max.m) || 0) + 1,
    });
    const qid = Array.isArray(qidRaw) ? qidRaw[0] : qidRaw;
    for (let i = 0; i < options.length; i++) {
      await knex('quiz_options').insert({ question_id: qid, text: options[i], is_correct: i === correctIdx, sort_order: i + 1 });
    }
    req.flash('success', 'Question added.');
    res.redirect(`/faculty/quizzes/${quiz.id}/edit`);
  } catch (err) { next(err); }
});

router.post('/questions/:qid/delete', async (req, res, next) => {
  try {
    const question = await knex('quiz_questions').where({ id: req.params.qid }).first();
    if (question) {
      const quiz = await knex('quizzes').where({ id: question.quiz_id }).first();
      const course = quiz ? await knex('courses').where({ id: quiz.course_id }).first() : null;
      const owns = req.session.user.role === 'admin' || (course && course.instructor_id === req.session.user.id);
      if (owns) await knex('quiz_questions').where({ id: question.id }).del();
      return res.redirect(`/faculty/quizzes/${question.quiz_id}/edit`);
    }
    res.redirect('/faculty');
  } catch (err) { next(err); }
});

module.exports = router;
