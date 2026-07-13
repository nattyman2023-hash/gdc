/**
 * Migration: Achievements & Badges system.
 *
 * Defines awardable badges and tracks which users have earned them.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('badge_definitions', (t) => {
    t.increments('id').primary();
    t.string('key').notNullable().unique();
    t.string('name').notNullable();
    t.text('description').nullable();
    t.string('icon').notNullable().defaultTo('emoji_events');
    t.string('category').notNullable().defaultTo('milestone');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('user_achievements', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('badge_id').unsigned().references('id').inTable('badge_definitions').onDelete('CASCADE').notNullable();
    t.timestamp('awarded_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'badge_id']);
  });

  // Seed the definitions used by the achievements engine so a fresh deploy
  // is immediately usable. The runtime helper can safely update them later.
  await knex('badge_definitions').insert([
    { key: 'first_lesson', name: 'First Steps', description: 'Complete your first lesson', icon: 'direction_walk', category: 'milestone', sort_order: 1 },
    { key: 'five_lessons', name: 'On a Roll', description: 'Complete 5 lessons', icon: 'looks_one', category: 'milestone', sort_order: 2 },
    { key: 'ten_lessons', name: 'Dedicated Learner', description: 'Complete 10 lessons', icon: 'looks_two', category: 'milestone', sort_order: 3 },
    { key: 'twenty_five_lessons', name: 'Knowledge Seeker', description: 'Complete 25 lessons', icon: 'looks_3', category: 'milestone', sort_order: 4 },
    { key: 'fifty_lessons', name: 'Scholar in Training', description: 'Complete 50 lessons', icon: 'school', category: 'milestone', sort_order: 5 },
    { key: 'hundred_lessons', name: 'Centurion', description: 'Complete 100 lessons', icon: 'military_tech', category: 'milestone', sort_order: 6 },
    { key: 'first_quiz_pass', name: 'Quiz Whiz', description: 'Pass your first quiz', icon: 'quiz', category: 'quiz', sort_order: 7 },
    { key: 'perfect_quiz', name: 'Perfect Score', description: 'Get 100% on any quiz', icon: 'stars', category: 'quiz', sort_order: 8 },
    { key: 'five_quizzes', name: 'Quiz Master', description: 'Pass 5 quizzes', icon: 'leaderboard', category: 'quiz', sort_order: 9 },
    { key: 'first_course', name: 'Graduate', description: 'Complete your first course', icon: 'workspace_premium', category: 'course', sort_order: 10 },
    { key: 'three_courses', name: 'Overachiever', description: 'Complete 3 courses', icon: 'workspace_premium', category: 'course', sort_order: 11 },
    { key: 'streak_3', name: '3-Day Streak', description: 'Study 3 days in a row', icon: 'local_fire_department', category: 'streak', sort_order: 12 },
    { key: 'streak_7', name: '7-Day Streak', description: 'Study 7 days in a row', icon: 'local_fire_department', category: 'streak', sort_order: 13 },
    { key: 'streak_14', name: 'Fortnight Warrior', description: 'Study 14 days in a row', icon: 'local_fire_department', category: 'streak', sort_order: 14 },
    { key: 'streak_30', name: 'Iron Will', description: 'Study 30 days in a row', icon: 'local_fire_department', category: 'streak', sort_order: 15 },
    { key: 'forum_first_topic', name: 'Conversation Starter', description: 'Start your first forum topic', icon: 'forum', category: 'special', sort_order: 16 },
    { key: 'forum_ten_replies', name: 'Community Helper', description: 'Post 10 replies in the forums', icon: 'forum', category: 'special', sort_order: 17 },
  ]);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_achievements');
  await knex.schema.dropTableIfExists('badge_definitions');
};
