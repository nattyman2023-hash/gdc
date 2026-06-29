/**
 * Phase 3 — Enhanced LMS: drip feed, essay assignments, quiz enhancements.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('courses', (t) => {
    t.boolean('drip_feed_enabled').notNullable().defaultTo(false);
    t.integer('drip_feed_interval_hours').notNullable().defaultTo(4);
  });

  await knex.schema.alterTable('modules', (t) => {
    t.timestamp('release_date').nullable();
    t.integer('prerequisite_module_id').unsigned().references('id').inTable('modules').onDelete('SET NULL').nullable();
    t.boolean('essay_required').notNullable().defaultTo(false);
    t.text('essay_prompt').nullable();
  });

  await knex.schema.alterTable('quizzes', (t) => {
    t.integer('module_id').unsigned().references('id').inTable('modules').onDelete('SET NULL').nullable();
    t.integer('lesson_id').unsigned().references('id').inTable('lessons').onDelete('SET NULL').nullable();
    t.integer('max_attempts').unsigned().nullable();
    t.boolean('randomize_questions').notNullable().defaultTo(false);
    t.enu('feedback_mode', ['immediate', 'delayed', 'after_attempt']).notNullable().defaultTo('immediate');
  });

  // Instead of renaming the table (which breaks FKs), just drop and recreate it.
  // quiz_options references quiz_questions, so drop quiz_options first.
  await knex.schema.dropTableIfExists('quiz_options');
  await knex.schema.dropTableIfExists('quiz_answers');
  await knex.schema.dropTableIfExists('quiz_attempts');
  await knex.schema.dropTableIfExists('quiz_questions');

  await knex.schema.createTable('quiz_questions', (t) => {
    t.increments('id').primary();
    t.integer('quiz_id').unsigned().references('id').inTable('quizzes').onDelete('CASCADE').notNullable();
    t.text('prompt').notNullable();
    t.enu('type', ['single', 'multiple', 'truefalse', 'short_answer']).notNullable().defaultTo('single');
    t.text('explanation').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('quiz_attempts', (t) => {
    t.increments('id').primary();
    t.integer('quiz_id').unsigned().references('id').inTable('quizzes').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('score').notNullable().defaultTo(0);
    t.boolean('passed').notNullable().defaultTo(false);
    t.timestamp('started_at').defaultTo(knex.fn.now());
    t.timestamp('submitted_at').nullable();
  });

  await knex.schema.createTable('quiz_options', (t) => {
    t.increments('id').primary();
    t.integer('question_id').unsigned().references('id').inTable('quiz_questions').onDelete('CASCADE').notNullable();
    t.text('text').notNullable();
    t.boolean('is_correct').notNullable().defaultTo(false);
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('quiz_answers', (t) => {
    t.increments('id').primary();
    t.integer('attempt_id').unsigned().references('id').inTable('quiz_attempts').onDelete('CASCADE').notNullable();
    t.integer('question_id').unsigned().references('id').inTable('quiz_questions').onDelete('CASCADE').notNullable();
    t.integer('option_id').unsigned().references('id').inTable('quiz_options').onDelete('CASCADE').nullable();
    t.boolean('correct').notNullable().defaultTo(false);
    t.text('short_answer_text').nullable();
  });

  await knex.schema.alterTable('lesson_progress', (t) => {
    t.timestamp('drip_feed_start').nullable();
    t.timestamp('available_until').nullable();
  });

  await knex.schema.createTable('essay_submissions', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('module_id').unsigned().references('id').inTable('modules').onDelete('CASCADE').notNullable();
    t.integer('enrollment_id').unsigned().references('id').inTable('enrollments').onDelete('CASCADE').notNullable();
    t.text('body').notNullable();
    t.enu('status', ['submitted', 'graded', 'returned']).notNullable().defaultTo('submitted');
    t.integer('score').nullable();
    t.text('feedback').nullable();
    t.timestamp('submitted_at').defaultTo(knex.fn.now());
    t.timestamp('graded_at').nullable();
    t.unique(['user_id', 'module_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('essay_submissions');
  await knex.schema.alterTable('lesson_progress', (t) => {
    t.dropColumn('drip_feed_start');
    t.dropColumn('available_until');
  });

  await knex.schema.dropTableIfExists('quiz_answers');
  await knex.schema.dropTableIfExists('quiz_options');
  await knex.schema.dropTableIfExists('quiz_attempts');
  await knex.schema.dropTableIfExists('quiz_questions');

  // Recreate original quiz_questions without short_answer
  await knex.schema.createTable('quiz_questions', (t) => {
    t.increments('id').primary();
    t.integer('quiz_id').unsigned().references('id').inTable('quizzes').onDelete('CASCADE').notNullable();
    t.text('prompt').notNullable();
    t.enu('type', ['single', 'multiple', 'truefalse']).notNullable().defaultTo('single');
    t.text('explanation').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
  });
  await knex.schema.createTable('quiz_attempts', (t) => {
    t.increments('id').primary();
    t.integer('quiz_id').unsigned().references('id').inTable('quizzes').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('score').notNullable().defaultTo(0);
    t.boolean('passed').notNullable().defaultTo(false);
    t.timestamp('started_at').defaultTo(knex.fn.now());
    t.timestamp('submitted_at').nullable();
  });
  await knex.schema.createTable('quiz_options', (t) => {
    t.increments('id').primary();
    t.integer('question_id').unsigned().references('id').inTable('quiz_questions').onDelete('CASCADE').notNullable();
    t.text('text').notNullable();
    t.boolean('is_correct').notNullable().defaultTo(false);
    t.integer('sort_order').notNullable().defaultTo(0);
  });
  await knex.schema.createTable('quiz_answers', (t) => {
    t.increments('id').primary();
    t.integer('attempt_id').unsigned().references('id').inTable('quiz_attempts').onDelete('CASCADE').notNullable();
    t.integer('question_id').unsigned().references('id').inTable('quiz_questions').onDelete('CASCADE').notNullable();
    t.integer('option_id').unsigned().references('id').inTable('quiz_options').onDelete('CASCADE').nullable();
    t.boolean('correct').notNullable().defaultTo(false);
  });

  await knex.schema.alterTable('quizzes', (t) => {
    t.dropColumn('module_id');
    t.dropColumn('lesson_id');
    t.dropColumn('max_attempts');
    t.dropColumn('randomize_questions');
    t.dropColumn('feedback_mode');
  });
  await knex.schema.alterTable('modules', (t) => {
    t.dropColumn('release_date');
    t.dropColumn('prerequisite_module_id');
    t.dropColumn('essay_required');
    t.dropColumn('essay_prompt');
  });
  await knex.schema.alterTable('courses', (t) => {
    t.dropColumn('drip_feed_enabled');
    t.dropColumn('drip_feed_interval_hours');
  });
};