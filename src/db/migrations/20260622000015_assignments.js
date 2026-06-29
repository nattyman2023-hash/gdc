/**
 * Phase 19 — LMS assignments (create → submit → grade).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('assignments', (t) => {
    t.increments('id').primary();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.string('title').notNullable();
    t.text('instructions').nullable();
    t.date('due_date').nullable();
    t.integer('max_points').notNullable().defaultTo(100);
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('assignment_submissions', (t) => {
    t.increments('id').primary();
    t.integer('assignment_id').unsigned().references('id').inTable('assignments').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.text('body').nullable();
    t.string('url').nullable();
    t.enu('status', ['submitted', 'graded']).notNullable().defaultTo('submitted');
    t.integer('grade').nullable();
    t.text('feedback').nullable();
    t.timestamp('submitted_at').defaultTo(knex.fn.now());
    t.timestamp('graded_at').nullable();
    t.unique(['assignment_id', 'user_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('assignment_submissions');
  await knex.schema.dropTableIfExists('assignments');
};
