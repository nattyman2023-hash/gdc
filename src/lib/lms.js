/**
 * LMS domain helpers.
 */
const knex = require('../config/db');

/** Total number of lessons in a course. */
async function countLessons(courseId) {
  const row = await knex('lessons')
    .join('modules', 'lessons.module_id', 'modules.id')
    .where('modules.course_id', courseId)
    .count({ c: '*' })
    .first();
  return Number(row.c);
}

/** Number of completed lessons for an enrollment. */
async function countCompleted(enrollmentId) {
  const row = await knex('lesson_progress')
    .where({ enrollment_id: enrollmentId, completed: true })
    .count({ c: '*' })
    .first();
  return Number(row.c);
}

/**
 * Recalculate and persist progress for an enrollment.
 * Marks the enrollment completed when all lessons are done.
 * Returns the updated progress percentage.
 */
async function recalcProgress(enrollment) {
  const total = await countLessons(enrollment.course_id);
  const done = await countCompleted(enrollment.id);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const update = { progress_pct: pct };
  if (pct >= 100 && enrollment.status !== 'completed') {
    update.status = 'completed';
    update.completed_at = knex.fn.now();
  }
  await knex('enrollments').where({ id: enrollment.id }).update(update);
  return pct;
}

/**
 * Load a course's full structure (modules -> lessons), optionally annotated
 * with completion flags for a given enrollment.
 */
async function getCourseStructure(courseId, enrollmentId = null) {
  const modules = await knex('modules').where({ course_id: courseId }).orderBy('sort_order');
  const lessons = await knex('lessons')
    .whereIn('module_id', modules.map((m) => m.id))
    .orderBy(['module_id', 'sort_order']);

  let completedIds = new Set();
  if (enrollmentId) {
    const progress = await knex('lesson_progress')
      .where({ enrollment_id: enrollmentId, completed: true })
      .pluck('lesson_id');
    completedIds = new Set(progress);
  }

  return modules.map((m) => ({
    ...m,
    lessons: lessons
      .filter((l) => l.module_id === m.id)
      .map((l) => ({ ...l, completed: completedIds.has(l.id) })),
  }));
}

// ─────────────────────────────────────────────────────────────────
// Drip feed helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Flatten a course structure into an ordered lesson array.
 */
function getFlatLessonList(structure) {
  const flat = [];
  structure.forEach((m) => m.lessons.forEach((l) => flat.push(l)));
  return flat;
}

/** Quiz ids the user has passed. */
async function passedQuizIds(userId) {
  if (!userId) return new Set();
  const ids = await knex('quiz_attempts').where({ user_id: userId, passed: true }).pluck('quiz_id');
  return new Set(ids);
}

/**
 * Block-aware availability: a "block" (block_no) groups its activities
 * (two readings + a video). All activities in a block open together; the next
 * block opens only after the current block is fully completed AND the drip
 * interval (default 4h) has passed; and a quiz positioned after a block must be
 * passed before the following block opens.
 */
async function blockLessonAvailable(enrollmentId, lesson, structure, course) {
  const intervalMs = (course.drip_feed_interval_hours || 4) * 3600 * 1000;
  const mods = structure;
  const modIdx = mods.findIndex((m) => m.id === lesson.module_id);
  const mod = mods[modIdx];
  const B = lesson.block_no;

  const enrollment = await knex('enrollments').where({ id: enrollmentId }).first();
  const passed = await passedQuizIds(enrollment ? enrollment.user_id : null);

  const blockLessons = (m, b) => m.lessons.filter((l) => l.block_no === b);
  const blockComplete = (m, b) => { const ls = blockLessons(m, b); return ls.length > 0 && ls.every((l) => l.completed); };
  async function blockLastCompletedAt(m, b) {
    const ids = blockLessons(m, b).map((l) => l.id);
    if (!ids.length) return null;
    const row = await knex('lesson_progress').where({ enrollment_id: enrollmentId }).whereIn('lesson_id', ids).where('completed', true).max({ x: 'completed_at' }).first();
    return row && row.x ? new Date(row.x) : null;
  }

  // Quiz gates inside this module: any quiz after an earlier block must be passed.
  const mQuizzes = await knex('quizzes').where({ module_id: mod.id }).whereNotNull('after_block').orderBy('after_block');
  for (const q of mQuizzes) {
    if (q.after_block < B && !passed.has(q.id)) return { available: false, reason: 'quiz_required', quiz_id: q.id, quiz_title: q.title };
  }

  if (B > 1) {
    if (!blockComplete(mod, B - 1)) return { available: false, reason: 'previous_block_incomplete' };
    const at = await blockLastCompletedAt(mod, B - 1);
    if (at) { const next = new Date(at.getTime() + intervalMs); if (new Date() < next) return { available: false, reason: 'drip_feed_cooldown', next_available: next }; }
    return { available: true, reason: 'block_open' };
  }
  // First block of a module
  if (modIdx === 0) return { available: true, reason: 'first_block' };
  const prev = mods[modIdx - 1];
  if (!prev.lessons.every((l) => l.completed)) return { available: false, reason: 'previous_module_incomplete' };
  const prevQuizzes = await knex('quizzes').where({ module_id: prev.id }).whereNotNull('after_block');
  for (const q of prevQuizzes) { if (!passed.has(q.id)) return { available: false, reason: 'quiz_required', quiz_id: q.id, quiz_title: q.title }; }
  const prevMaxBlock = Math.max(1, ...prev.lessons.map((l) => l.block_no || 1));
  const at = await blockLastCompletedAt(prev, prevMaxBlock);
  if (at) { const next = new Date(at.getTime() + intervalMs); if (new Date() < next) return { available: false, reason: 'drip_feed_cooldown', next_available: next }; }
  return { available: true, reason: 'block_open' };
}

/** Whether a quiz can be attempted: its covered blocks must be complete and any earlier quizzes passed. */
async function isQuizAvailable(enrollmentId, quiz, structure) {
  if (!quiz.after_block) return { available: true };
  const enrollment = await knex('enrollments').where({ id: enrollmentId }).first();
  const passed = await passedQuizIds(enrollment ? enrollment.user_id : null);
  const mod = structure.find((m) => m.id === quiz.module_id);
  if (!mod) return { available: true };
  // all blocks up to after_block complete
  for (let b = 1; b <= quiz.after_block; b++) {
    const ls = mod.lessons.filter((l) => l.block_no === b);
    if (ls.length && !ls.every((l) => l.completed)) return { available: false, reason: 'blocks_incomplete' };
  }
  // earlier quizzes in this module passed
  const earlier = await knex('quizzes').where({ module_id: mod.id }).whereNotNull('after_block').andWhere('after_block', '<', quiz.after_block);
  for (const q of earlier) { if (!passed.has(q.id)) return { available: false, reason: 'quiz_required', quiz_id: q.id }; }
  return { available: true };
}

/**
 * Check whether a lesson is available to a student under drip‑feed rules.
 * Returns { available: boolean, reason: string, next_available?: Date }
 */
async function isLessonAvailable(enrollmentId, lessonId, structure) {
  const progress = await knex('lesson_progress')
    .where({ enrollment_id: enrollmentId, lesson_id: lessonId })
    .first();

  if (progress && progress.completed) {
    return { available: true, reason: 'already_completed' };
  }

  // Block-structured courses use block-level gating.
  const blockLesson = await knex('lessons').where({ id: lessonId }).first();
  if (blockLesson && blockLesson.block_no) {
    const bmod = await knex('modules').where({ id: blockLesson.module_id }).first();
    const bcourse = bmod ? await knex('courses').where({ id: bmod.course_id }).first() : null;
    if (bcourse && bcourse.drip_feed_enabled) return blockLessonAvailable(enrollmentId, blockLesson, structure, bcourse);
    return { available: true, reason: 'drip_disabled' };
  }

  const flat = getFlatLessonList(structure);
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx === -1) return { available: false, reason: 'not_found' };

  // First lesson is always available
  if (idx === 0) return { available: true, reason: 'first_lesson' };

  // Find the course to check drip feed settings
  const lesson = await knex('lessons').where({ id: lessonId }).first();
  if (!lesson) return { available: false, reason: 'not_found' };
  const mod = await knex('modules').where({ id: lesson.module_id }).first();
  if (!mod) return { available: false, reason: 'not_found' };
  const course = await knex('courses').where({ id: mod.course_id }).first();

  // If drip feed is disabled, lesson is available
  if (!course || !course.drip_feed_enabled) {
    return { available: true, reason: 'drip_disabled' };
  }

  // Check module release date
  if (mod.release_date) {
    const releaseDate = new Date(mod.release_date);
    if (new Date() < releaseDate) {
      return { available: false, reason: 'scheduled_release', next_available: releaseDate };
    }
  }

  // Check module prerequisite
  if (mod.prerequisite_module_id) {
    const prereqModule = structure.find((m) => m.id === mod.prerequisite_module_id);
    if (prereqModule) {
      const allPrereqDone = prereqModule.lessons.every((l) => l.completed);
      if (!allPrereqDone) {
        return { available: false, reason: 'prerequisite_not_met' };
      }
    }
  }

  // Check essay requirement: previous module's essay must be submitted
  const prevModule = structure.find((m) => {
    const prevIdx = structure.findIndex((sm) => sm.id === mod.id) - 1;
    return prevIdx >= 0 && structure[prevIdx].id === m.id;
  });
  if (prevModule && prevModule.essay_required) {
    const essay = await knex('essay_submissions')
      .where({ module_id: prevModule.id, enrollment_id: enrollmentId })
      .first();
    if (!essay || essay.status === 'returned') {
      return { available: false, reason: 'essay_required' };
    }
  }

  // Find the most recently completed lesson before this one
  let lastCompleted = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (flat[i].completed) { lastCompleted = flat[i]; break; }
  }

  if (!lastCompleted) {
    return { available: false, reason: 'previous_not_completed' };
  }

  // Check drip feed cooldown
  const lastProgress = await knex('lesson_progress')
    .where({ enrollment_id: enrollmentId, lesson_id: lastCompleted.id, completed: true })
    .first();

  if (lastProgress && lastProgress.completed_at) {
    const completedAt = new Date(lastProgress.completed_at);
    const intervalHours = course.drip_feed_interval_hours || 4;
    const nextAvailable = new Date(completedAt.getTime() + intervalHours * 60 * 60 * 1000);

    if (new Date() < nextAvailable) {
      return { available: false, reason: 'drip_feed_cooldown', next_available: nextAvailable };
    }
  }

  return { available: true, reason: 'drip_feed_available' };
}

/**
 * Mark a lesson complete, respecting drip feed rules.
 * Returns { success, message, next_lesson? }
 */
async function completeLessonWithDrip(enrollmentId, lessonId, structure) {
  const availability = await isLessonAvailable(enrollmentId, lessonId, structure);
  if (!availability.available) {
    return { success: false, message: 'Lesson is not available yet.' };
  }

  const existing = await knex('lesson_progress')
    .where({ enrollment_id: enrollmentId, lesson_id: lessonId })
    .first();

  if (existing) {
    await knex('lesson_progress').where({ id: existing.id }).update({
      completed: true,
      completed_at: knex.fn.now(),
    });
  } else {
    await knex('lesson_progress').insert({
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      completed: true,
      completed_at: knex.fn.now(),
    });
  }

  // Recalc enrollment progress
  const enrollment = await knex('enrollments').where({ id: enrollmentId }).first();
  if (enrollment) await recalcProgress(enrollment);

  // Find next lesson
  const next = await getNextAvailableLesson(enrollmentId, lessonId, structure);

  return { success: true, message: 'Lesson completed!', next_lesson: next };
}

/**
 * Find the next available lesson after the given one.
 */
async function getNextAvailableLesson(enrollmentId, currentLessonId, structure) {
  const flat = getFlatLessonList(structure);
  const idx = flat.findIndex((l) => l.id === currentLessonId);
  if (idx === -1 || idx >= flat.length - 1) return null;

  for (let i = idx + 1; i < flat.length; i++) {
    const avail = await isLessonAvailable(enrollmentId, flat[i].id, structure);
    if (avail.available) return flat[i];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Essay helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Get essay submission status for a module.
 */
async function getModuleEssayStatus(enrollmentId, moduleId) {
  const essay = await knex('essay_submissions')
    .where({ enrollment_id: enrollmentId, module_id: moduleId })
    .first();
  return essay || null;
}

/**
 * Submit an essay for a module.
 */
async function submitEssay(userId, enrollmentId, moduleId, body) {
  const existing = await knex('essay_submissions')
    .where({ user_id: userId, module_id: moduleId })
    .first();

  if (existing) {
    if (existing.status === 'graded') {
      return { success: false, message: 'This essay has already been graded.' };
    }
    await knex('essay_submissions').where({ id: existing.id }).update({
      body,
      status: 'submitted',
      submitted_at: knex.fn.now(),
    });
  } else {
    await knex('essay_submissions').insert({
      user_id: userId,
      module_id: moduleId,
      enrollment_id: enrollmentId,
      body,
      status: 'submitted',
    });
  }

  return { success: true, message: 'Essay submitted successfully.' };
}

/**
 * Build a display model of the course as blocks ("Lesson 1, 2, …") with their
 * activities and quizzes, annotated with complete/open/locked + unlock time.
 * Used to render the curriculum with microlearning gates.
 */
async function getBlockedCurriculum(enrollmentId, structure, course) {
  const enrollment = await knex('enrollments').where({ id: enrollmentId }).first();
  const passed = await passedQuizIds(enrollment ? enrollment.user_id : null);
  const intervalMs = (course.drip_feed_interval_hours || 4) * 3600 * 1000;
  const prog = await knex('lesson_progress').where({ enrollment_id: enrollmentId, completed: true }).select('lesson_id', 'completed_at');
  const compAt = {}; prog.forEach((p) => { compAt[p.lesson_id] = p.completed_at ? new Date(p.completed_at) : null; });
  const allQuizzes = await knex('quizzes').whereIn('module_id', structure.map((m) => m.id)).whereNotNull('after_block');

  let gateOpen = true;
  let lastBlockCompletedAt = null;
  return structure.map((m) => {
    const blockNos = [...new Set(m.lessons.map((l) => l.block_no).filter(Boolean))].sort((a, b) => a - b);
    const blocks = blockNos.map((b) => {
      const ls = m.lessons.filter((l) => l.block_no === b);
      const complete = ls.length > 0 && ls.every((l) => l.completed);
      let open = false; let next_available = null;
      if (complete) open = true;
      else if (gateOpen) {
        if (lastBlockCompletedAt) { const na = new Date(lastBlockCompletedAt.getTime() + intervalMs); if (new Date() < na) { next_available = na; } else open = true; }
        else open = true;
      }
      const quizRow = allQuizzes.find((q) => q.module_id === m.id && q.after_block === b);
      const quiz = quizRow ? { id: quizRow.id, title: quizRow.title, covers: quizRow.covers_blocks, passed: passed.has(quizRow.id), available: complete } : null;
      // advance the gate
      if (complete) {
        const times = ls.map((l) => compAt[l.id]).filter(Boolean).map((t) => t.getTime());
        if (times.length) lastBlockCompletedAt = new Date(Math.max(...times));
        if (quizRow && !passed.has(quizRow.id)) gateOpen = false;
      } else {
        gateOpen = false;
      }
      return { block_no: b, title: ls[0] ? (ls[0].block_title || `Lesson ${b}`) : `Lesson ${b}`, lessons: ls, complete, open, next_available, quiz };
    });
    return { ...m, blocks };
  });
}

module.exports = { countLessons, countCompleted, recalcProgress, getCourseStructure,
  isLessonAvailable, isQuizAvailable, completeLessonWithDrip, getNextAvailableLesson,
  getModuleEssayStatus, submitEssay, getFlatLessonList, getBlockedCurriculum, passedQuizIds };
