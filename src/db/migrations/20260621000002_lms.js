/**
 * Phase 2 — Learning Management System (LMS).
 *
 *   courses          — courses belonging to a program
 *   modules          — sections within a course
 *   lessons          — content units within a module
 *   enrollments      — a student enrolled in a course (+ progress %)
 *   lesson_progress  — per-lesson completion for an enrollment
 *   quizzes          — assessments attached to a course
 *   quiz_questions   — questions in a quiz
 *   quiz_options     — answer options for a question
 *   quiz_attempts    — a student's attempt at a quiz (score/pass)
 *   quiz_answers     — chosen options per attempt
 *   announcements    — course or global announcements
 *   certificates     — issued on course completion
 */
exports.up = async function (knex) {
  await knex.schema.createTable('courses', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.integer('program_id').unsigned().references('id').inTable('programs').onDelete('SET NULL').nullable();
    t.integer('instructor_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('code').nullable(); // e.g. THEO101
    t.string('title').notNullable();
    t.text('summary').nullable();
    t.text('description').nullable();
    t.integer('credits').notNullable().defaultTo(15);
    t.string('icon').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('modules', (t) => {
    t.increments('id').primary();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.string('title').notNullable();
    t.text('summary').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('lessons', (t) => {
    t.increments('id').primary();
    t.integer('module_id').unsigned().references('id').inTable('modules').onDelete('CASCADE').notNullable();
    t.string('title').notNullable();
    t.string('type').notNullable().defaultTo('reading'); // reading, video, live
    t.text('content').nullable(); // HTML/markdown-ish body
    t.string('video_url').nullable();
    t.integer('duration_min').notNullable().defaultTo(15);
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('enrollments', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.enu('status', ['active', 'completed', 'withdrawn']).notNullable().defaultTo('active');
    t.integer('progress_pct').notNullable().defaultTo(0);
    t.timestamp('enrolled_at').defaultTo(knex.fn.now());
    t.timestamp('completed_at').nullable();
    t.unique(['user_id', 'course_id']);
  });

  await knex.schema.createTable('lesson_progress', (t) => {
    t.increments('id').primary();
    t.integer('enrollment_id').unsigned().references('id').inTable('enrollments').onDelete('CASCADE').notNullable();
    t.integer('lesson_id').unsigned().references('id').inTable('lessons').onDelete('CASCADE').notNullable();
    t.boolean('completed').notNullable().defaultTo(false);
    t.timestamp('completed_at').nullable();
    t.unique(['enrollment_id', 'lesson_id']);
  });

  await knex.schema.createTable('quizzes', (t) => {
    t.increments('id').primary();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.string('title').notNullable();
    t.text('description').nullable();
    t.integer('pass_mark').notNullable().defaultTo(60); // percent
    t.integer('time_limit_min').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('quiz_questions', (t) => {
    t.increments('id').primary();
    t.integer('quiz_id').unsigned().references('id').inTable('quizzes').onDelete('CASCADE').notNullable();
    t.text('prompt').notNullable();
    t.enu('type', ['single', 'multiple', 'truefalse']).notNullable().defaultTo('single');
    t.text('explanation').nullable(); // shown in remediation/review
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('quiz_options', (t) => {
    t.increments('id').primary();
    t.integer('question_id').unsigned().references('id').inTable('quiz_questions').onDelete('CASCADE').notNullable();
    t.text('text').notNullable();
    t.boolean('is_correct').notNullable().defaultTo(false);
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('quiz_attempts', (t) => {
    t.increments('id').primary();
    t.integer('quiz_id').unsigned().references('id').inTable('quizzes').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('score').notNullable().defaultTo(0); // percent
    t.boolean('passed').notNullable().defaultTo(false);
    t.timestamp('started_at').defaultTo(knex.fn.now());
    t.timestamp('submitted_at').nullable();
  });

  await knex.schema.createTable('quiz_answers', (t) => {
    t.increments('id').primary();
    t.integer('attempt_id').unsigned().references('id').inTable('quiz_attempts').onDelete('CASCADE').notNullable();
    t.integer('question_id').unsigned().references('id').inTable('quiz_questions').onDelete('CASCADE').notNullable();
    t.integer('option_id').unsigned().references('id').inTable('quiz_options').onDelete('CASCADE').nullable();
    t.boolean('correct').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('announcements', (t) => {
    t.increments('id').primary();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').nullable(); // null = global
    t.string('title').notNullable();
    t.text('body').notNullable();
    t.string('author').nullable();
    t.timestamp('published_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('certificates', (t) => {
    t.increments('id').primary();
    t.string('reference').notNullable().unique();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('SET NULL').nullable();
    t.string('title').notNullable();
    t.timestamp('issued_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'course_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('certificates');
  await knex.schema.dropTableIfExists('announcements');
  await knex.schema.dropTableIfExists('quiz_answers');
  await knex.schema.dropTableIfExists('quiz_attempts');
  await knex.schema.dropTableIfExists('quiz_options');
  await knex.schema.dropTableIfExists('quiz_questions');
  await knex.schema.dropTableIfExists('quizzes');
  await knex.schema.dropTableIfExists('lesson_progress');
  await knex.schema.dropTableIfExists('enrollments');
  await knex.schema.dropTableIfExists('lessons');
  await knex.schema.dropTableIfExists('modules');
  await knex.schema.dropTableIfExists('courses');
};
