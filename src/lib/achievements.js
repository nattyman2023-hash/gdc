/**
 * Achievements & Milestones engine.
 *
 * Checks trigger conditions (lesson complete, quiz passed, streak milestones,
 * course completion) and awards badges when conditions are met.
 * All functions are safe to call fire-and-forget (errors are swallowed).
 */
const knex = require('../config/db');

/** All badge keys the system knows about. */
const BADGES = {
  FIRST_LESSON:      'first_lesson',
  FIVE_LESSONS:      'five_lessons',
  TEN_LESSONS:       'ten_lessons',
  TWENTY_FIVE_LESSONS: 'twenty_five_lessons',
  FIFTY_LESSONS:     'fifty_lessons',
  HUNDRED_LESSONS:   'hundred_lessons',
  FIRST_QUIZ_PASS:   'first_quiz_pass',
  PERFECT_QUIZ:      'perfect_quiz',
  FIVE_QUIZZES:      'five_quizzes',
  FIRST_COURSE:      'first_course',
  THREE_COURSES:     'three_courses',
  STREAK_3:          'streak_3',
  STREAK_7:          'streak_7',
  STREAK_14:         'streak_14',
  STREAK_30:         'streak_30',
  EARLY_BIRD:        'early_bird',
  NIGHT_OWL:         'night_owl',
  FORUM_FIRST_TOPIC: 'forum_first_topic',
  FORUM_TEN_REPLIES: 'forum_ten_replies',
};

/**
 * Define default badges. Upserts so they can be re-run safely (e.g. on deploy).
 */
async function seedBadges() {
  const defs = [
    { key: BADGES.FIRST_LESSON,      name: 'First Steps',            description: 'Complete your first lesson',                          icon: 'direction_walk',        category: 'milestone', sort_order: 1 },
    { key: BADGES.FIVE_LESSONS,      name: 'On a Roll',              description: 'Complete 5 lessons',                                 icon: 'looks_one',             category: 'milestone', sort_order: 2 },
    { key: BADGES.TEN_LESSONS,       name: 'Dedicated Learner',      description: 'Complete 10 lessons',                                icon: 'looks_two',             category: 'milestone', sort_order: 3 },
    { key: BADGES.TWENTY_FIVE_LESSONS, name: 'Knowledge Seeker',     description: 'Complete 25 lessons',                                icon: 'looks_3',               category: 'milestone', sort_order: 4 },
    { key: BADGES.FIFTY_LESSONS,     name: 'Scholar in Training',    description: 'Complete 50 lessons',                                icon: 'school',                category: 'milestone', sort_order: 5 },
    { key: BADGES.HUNDRED_LESSONS,   name: 'Centurion',              description: 'Complete 100 lessons',                               icon: 'military_tech',         category: 'milestone', sort_order: 6 },
    { key: BADGES.FIRST_QUIZ_PASS,   name: 'Quiz Whiz',              description: 'Pass your first quiz',                               icon: 'quiz',                  category: 'quiz',      sort_order: 7 },
    { key: BADGES.PERFECT_QUIZ,      name: 'Perfect Score',          description: 'Get 100% on any quiz',                               icon: 'stars',                 category: 'quiz',      sort_order: 8 },
    { key: BADGES.FIVE_QUIZZES,      name: 'Quiz Master',            description: 'Pass 5 quizzes',                                     icon: 'leaderboard',           category: 'quiz',      sort_order: 9 },
    { key: BADGES.FIRST_COURSE,      name: 'Graduate',               description: 'Complete your first course',                         icon: 'workspace_premium',     category: 'course',    sort_order: 10 },
    { key: BADGES.THREE_COURSES,     name: 'Overachiever',           description: 'Complete 3 courses',                                 icon: 'workspace_premium',     category: 'course',    sort_order: 11 },
    { key: BADGES.STREAK_3,          name: '3-Day Streak',           description: 'Study 3 days in a row',                              icon: 'local_fire_department', category: 'streak',   sort_order: 12 },
    { key: BADGES.STREAK_7,          name: '7-Day Streak',           description: 'Study 7 days in a row',                              icon: 'local_fire_department', category: 'streak',   sort_order: 13 },
    { key: BADGES.STREAK_14,         name: 'Fortnight Warrior',      description: 'Study 14 days in a row',                             icon: 'local_fire_department', category: 'streak',   sort_order: 14 },
    { key: BADGES.STREAK_30,         name: 'Iron Will',              description: 'Study 30 days in a row',                             icon: 'local_fire_department', category: 'streak',   sort_order: 15 },
    { key: BADGES.FORUM_FIRST_TOPIC, name: 'Conversation Starter',   description: 'Start your first forum topic',                       icon: 'forum',                 category: 'special',  sort_order: 16 },
    { key: BADGES.FORUM_TEN_REPLIES, name: 'Community Helper',       description: 'Post 10 replies in the forums',                      icon: 'forum',                 category: 'special',  sort_order: 17 },
  ];

  for (const b of defs) {
    const existing = await knex('badge_definitions').where({ key: b.key }).first();
    if (existing) {
      await knex('badge_definitions').where({ id: existing.id }).update(b);
    } else {
      await knex('badge_definitions').insert(b);
    }
  }
}

/** Get a badge definition by its machine key. */
async function getBadge(key) {
  return knex('badge_definitions').where({ key, active: true }).first();
}

/** Award a badge to a user (no-op if already earned). */
async function awardBadge(userId, badgeKey) {
  if (!userId || !badgeKey) return null;
  try {
    const badge = await getBadge(badgeKey);
    if (!badge) return null;
    await knex('user_achievements').insert({
      user_id: userId,
      badge_id: badge.id,
      awarded_at: knex.fn.now(),
    }).onConflict(['user_id', 'badge_id']).ignore();
    return knex('user_achievements')
      .where({ user_id: userId, badge_id: badge.id })
      .first();
  } catch (err) {
    console.error('awardBadge failed:', err.message);
    return null;
  }
}

// ─── Trigger checkers ──────────────────────────────────────

/** Call after a lesson is marked complete. */
async function checkLessonMilestones(userId) {
  const count = Number((await knex('lesson_progress')
    .join('enrollments', 'lesson_progress.enrollment_id', 'enrollments.id')
    .where('enrollments.user_id', userId)
    .where('lesson_progress.completed', true)
    .count({ c: '*' })
    .first()).c);

  const thresholds = [
    { key: BADGES.FIRST_LESSON,       min: 1 },
    { key: BADGES.FIVE_LESSONS,       min: 5 },
    { key: BADGES.TEN_LESSONS,        min: 10 },
    { key: BADGES.TWENTY_FIVE_LESSONS, min: 25 },
    { key: BADGES.FIFTY_LESSONS,      min: 50 },
    { key: BADGES.HUNDRED_LESSONS,    min: 100 },
  ];

  for (const t of thresholds) {
    if (count >= t.min) await awardBadge(userId, t.key);
  }
}

/** Call after a quiz attempt is submitted and graded. */
async function checkQuizMilestones(userId, attempt) {
  // First quiz passed
  if (attempt.passed) {
    const passCount = Number((await knex('quiz_attempts')
      .where({ user_id: userId, passed: true })
      .count({ c: '*' }).first()).c);
    if (passCount >= 1) await awardBadge(userId, BADGES.FIRST_QUIZ_PASS);
    if (passCount >= 5) await awardBadge(userId, BADGES.FIVE_QUIZZES);
  }

  // Perfect score
  if (attempt.score === 100) {
    await awardBadge(userId, BADGES.PERFECT_QUIZ);
  }
}

/** Call after a course is completed (enrollment status → completed). */
async function checkCourseMilestones(userId) {
  const completedCount = Number((await knex('enrollments')
    .where({ user_id: userId, status: 'completed' })
    .count({ c: '*' }).first()).c);

  if (completedCount >= 1) await awardBadge(userId, BADGES.FIRST_COURSE);
  if (completedCount >= 3) await awardBadge(userId, BADGES.THREE_COURSES);
}

/** Call daily (or on login) to check and update study streaks. */
async function checkStreakMilestones(userId, loginDate) {
  const streak = await getCurrentStreak(userId, loginDate || new Date());
  const thresholds = [
    { key: BADGES.STREAK_3,  min: 3 },
    { key: BADGES.STREAK_7,  min: 7 },
    { key: BADGES.STREAK_14, min: 14 },
    { key: BADGES.STREAK_30, min: 30 },
  ];
  for (const t of thresholds) {
    if (streak >= t.min) await awardBadge(userId, t.key);
  }

  return streak;
}

/** Call when a user creates their first forum topic. */
async function checkForumFirstTopic(userId) {
  await awardBadge(userId, BADGES.FORUM_FIRST_TOPIC);
}

/** Call when a user posts a forum reply. */
async function checkForumReplies(userId) {
  const count = Number((await knex('forum_replies')
    .where({ user_id: userId })
    .count({ c: '*' }).first()).c);
  if (count >= 10) await awardBadge(userId, BADGES.FORUM_TEN_REPLIES);
}

/** Get all badges a user has earned, with definition data joined. */
async function getUserAchievements(userId) {
  const rows = await knex('user_achievements')
    .join('badge_definitions', 'user_achievements.badge_id', 'badge_definitions.id')
    .where('user_achievements.user_id', userId)
    .where('badge_definitions.active', true)
    .orderBy('badge_definitions.sort_order')
    .select(
      'user_achievements.awarded_at',
      'badge_definitions.id as badge_id',
      'badge_definitions.key',
      'badge_definitions.name',
      'badge_definitions.description',
      'badge_definitions.icon',
      'badge_definitions.category'
    );
  return rows;
}

/** Get all badge definitions (for admin management). */
async function getAllBadgeDefinitions() {
  return knex('badge_definitions').orderBy('sort_order');
}

/** Get the current streak for a user. */
function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function previousDay(day) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return dayKey(value);
}

async function getCurrentStreak(userId, asOf) {
  const dates = await knex('lesson_progress')
    .join('enrollments', 'lesson_progress.enrollment_id', 'enrollments.id')
    .where('enrollments.user_id', userId)
    .where('lesson_progress.completed', true)
    .select(knex.raw("DISTINCT DATE(lesson_progress.completed_at) as d"))
    .orderBy('d', 'desc');

  if (!dates.length) return 0;

  const dateSet = new Set(dates.map((r) => r.d));
  let cursor = dayKey(asOf || new Date());
  if (!dateSet.has(cursor)) cursor = previousDay(cursor);
  if (!dateSet.has(cursor)) return 0;

  let streak = 0;
  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

module.exports = {
  BADGES,
  seedBadges,
  awardBadge,
  checkLessonMilestones,
  checkQuizMilestones,
  checkCourseMilestones,
  checkStreakMilestones,
  checkForumFirstTopic,
  checkForumReplies,
  getUserAchievements,
  getAllBadgeDefinitions,
  getCurrentStreak,
};
