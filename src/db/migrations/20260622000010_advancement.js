/**
 * Phase 12 — advancement & community.
 *   sponsorships / sponsorship_contributions — diaspora tuition sponsorship
 *   grant_applications                        — research grant applications
 *   alumni_profiles                           — alumni network / mentors
 *   graduation_registrations                  — commencement registration
 */
exports.up = async function (knex) {
  await knex.schema.createTable('sponsorships', (t) => {
    t.increments('id').primary();
    t.string('token').notNullable().unique();
    t.integer('student_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.decimal('target_amount', 10, 2).nullable();
    t.string('currency').notNullable().defaultTo('GBP');
    t.text('message').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('sponsorship_contributions', (t) => {
    t.increments('id').primary();
    t.integer('sponsorship_id').unsigned().references('id').inTable('sponsorships').onDelete('CASCADE').notNullable();
    t.string('sponsor_name').notNullable();
    t.string('sponsor_email').nullable();
    t.decimal('amount', 10, 2).notNullable();
    t.text('message').nullable();
    t.enu('status', ['pledged', 'paid']).notNullable().defaultTo('pledged');
    t.string('stripe_session_id').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('grant_applications', (t) => {
    t.increments('id').primary();
    t.string('reference').notNullable().unique();
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('email').notNullable();
    t.string('institution').nullable();
    t.string('title').notNullable();
    t.string('category').nullable();
    t.text('summary').nullable();
    t.decimal('amount_requested', 10, 2).nullable();
    t.enu('status', ['submitted', 'under_review', 'awarded', 'declined']).notNullable().defaultTo('submitted');
    t.text('review_notes').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('alumni_profiles', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.integer('graduation_year').nullable();
    t.string('program').nullable();
    t.string('role').nullable();
    t.string('organisation').nullable();
    t.string('country').nullable();
    t.text('bio').nullable();
    t.boolean('is_mentor').notNullable().defaultTo(false);
    t.boolean('published').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('graduation_registrations', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable().unique();
    t.string('ceremony').nullable();
    t.boolean('attending').notNullable().defaultTo(true);
    t.string('regalia_size').nullable();
    t.integer('guests').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('graduation_registrations');
  await knex.schema.dropTableIfExists('alumni_profiles');
  await knex.schema.dropTableIfExists('grant_applications');
  await knex.schema.dropTableIfExists('sponsorship_contributions');
  await knex.schema.dropTableIfExists('sponsorships');
};
