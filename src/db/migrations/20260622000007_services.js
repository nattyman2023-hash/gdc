/**
 * Phase 9 — additional Stitch features.
 *   support_tickets / ticket_replies  — student helpdesk
 *   scholarships                      — scholarship listings
 *   job_openings / job_applications   — careers / Join GDCU
 */
exports.up = async function (knex) {
  await knex.schema.createTable('support_tickets', (t) => {
    t.increments('id').primary();
    t.string('reference').notNullable().unique();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('subject').notNullable();
    t.string('category').notNullable().defaultTo('General');
    t.enu('priority', ['low', 'normal', 'high']).notNullable().defaultTo('normal');
    t.enu('status', ['open', 'pending', 'resolved', 'closed']).notNullable().defaultTo('open');
    t.integer('assigned_to').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('ticket_replies', (t) => {
    t.increments('id').primary();
    t.integer('ticket_id').unsigned().references('id').inTable('support_tickets').onDelete('CASCADE').notNullable();
    t.integer('author_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('author_name').nullable();
    t.boolean('is_staff').notNullable().defaultTo(false);
    t.text('body').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('scholarships', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.text('summary').nullable();
    t.text('description').nullable();
    t.string('award').nullable(); // e.g. "Up to 50% tuition"
    t.text('eligibility').nullable();
    t.date('deadline').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('job_openings', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.string('department').nullable();
    t.string('location').nullable();
    t.string('type').notNullable().defaultTo('Faculty'); // Faculty, Staff, Full-time, Part-time, Volunteer
    t.text('summary').nullable();
    t.text('description').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.date('closes_on').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('job_applications', (t) => {
    t.increments('id').primary();
    t.integer('job_id').unsigned().references('id').inTable('job_openings').onDelete('CASCADE').notNullable();
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('email').notNullable();
    t.string('phone').nullable();
    t.text('cover_note').nullable();
    t.string('cv_url').nullable();
    t.enu('status', ['new', 'reviewing', 'shortlisted', 'rejected', 'hired']).notNullable().defaultTo('new');
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('job_applications');
  await knex.schema.dropTableIfExists('job_openings');
  await knex.schema.dropTableIfExists('scholarships');
  await knex.schema.dropTableIfExists('ticket_replies');
  await knex.schema.dropTableIfExists('support_tickets');
};
