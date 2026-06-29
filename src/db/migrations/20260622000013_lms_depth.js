/**
 * Phase 15 — LMS depth (virtual classroom), live webinars, interview self-scheduling.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('lesson_materials', (t) => {
    t.increments('id').primary();
    t.integer('lesson_id').unsigned().references('id').inTable('lessons').onDelete('CASCADE').notNullable();
    t.string('label').notNullable();
    t.string('url').notNullable();
    t.string('type').notNullable().defaultTo('link'); // link, pdf, slides, video
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('lesson_comments', (t) => {
    t.increments('id').primary();
    t.integer('lesson_id').unsigned().references('id').inTable('lessons').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('author_name').nullable();
    t.boolean('is_staff').notNullable().defaultTo(false);
    t.text('body').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('lesson_notes', (t) => {
    t.increments('id').primary();
    t.integer('lesson_id').unsigned().references('id').inTable('lessons').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.text('body').nullable();
    t.timestamps(true, true);
    t.unique(['lesson_id', 'user_id']);
  });

  await knex.schema.createTable('webinars', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.string('presenter').nullable();
    t.text('description').nullable();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('SET NULL').nullable();
    t.timestamp('starts_at').notNullable();
    t.string('join_url').nullable();
    t.string('recording_url').nullable();
    t.text('resources').nullable(); // simple newline list of "label|url"
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('webinar_questions', (t) => {
    t.increments('id').primary();
    t.integer('webinar_id').unsigned().references('id').inTable('webinars').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('author_name').nullable();
    t.text('body').notNullable();
    t.integer('upvotes').notNullable().defaultTo(0);
    t.boolean('answered').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('interview_slots', (t) => {
    t.increments('id').primary();
    t.integer('interviewer_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.timestamp('starts_at').notNullable();
    t.string('mode').notNullable().defaultTo('online');
    t.string('location').nullable();
    t.integer('capacity').notNullable().defaultTo(1);
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('applications', (t) => {
    t.string('interview_token').nullable();
  });
  await knex.schema.alterTable('interviews', (t) => {
    t.integer('slot_id').unsigned().references('id').inTable('interview_slots').onDelete('SET NULL').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('interviews', (t) => t.dropColumn('slot_id'));
  await knex.schema.alterTable('applications', (t) => t.dropColumn('interview_token'));
  await knex.schema.dropTableIfExists('interview_slots');
  await knex.schema.dropTableIfExists('webinar_questions');
  await knex.schema.dropTableIfExists('webinars');
  await knex.schema.dropTableIfExists('lesson_notes');
  await knex.schema.dropTableIfExists('lesson_comments');
  await knex.schema.dropTableIfExists('lesson_materials');
};
