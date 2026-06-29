/**
 * Phase 10 — scheduling.
 *   interviews            — admissions interviews tied to an application
 *   office_hour_slots     — faculty availability for mentorship
 *   office_hour_bookings  — student bookings against a slot
 */
exports.up = async function (knex) {
  await knex.schema.createTable('interviews', (t) => {
    t.increments('id').primary();
    t.integer('application_id').unsigned().references('id').inTable('applications').onDelete('CASCADE').notNullable();
    t.integer('interviewer_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.timestamp('scheduled_at').notNullable();
    t.string('mode').notNullable().defaultTo('online'); // online | in_person
    t.string('location').nullable(); // link or place
    t.enu('status', ['scheduled', 'completed', 'cancelled', 'no_show']).notNullable().defaultTo('scheduled');
    t.text('notes').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('office_hour_slots', (t) => {
    t.increments('id').primary();
    t.integer('faculty_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.timestamp('starts_at').notNullable();
    t.timestamp('ends_at').nullable();
    t.string('mode').notNullable().defaultTo('online');
    t.string('join_url').nullable();
    t.integer('capacity').notNullable().defaultTo(1);
    t.string('topic').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('office_hour_bookings', (t) => {
    t.increments('id').primary();
    t.integer('slot_id').unsigned().references('id').inTable('office_hour_slots').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.text('note').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['slot_id', 'user_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('office_hour_bookings');
  await knex.schema.dropTableIfExists('office_hour_slots');
  await knex.schema.dropTableIfExists('interviews');
};
