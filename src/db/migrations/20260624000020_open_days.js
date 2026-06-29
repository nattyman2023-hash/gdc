/**
 * Open Days — schedulable public events with online registration.
 * Each registrant is also captured as a CRM lead (source = 'open_day')
 * so admissions can nurture them until they convert.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('open_days', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.text('description');
    t.dateTime('starts_at').notNullable();
    t.dateTime('ends_at');
    t.string('location');
    t.boolean('is_online').notNullable().defaultTo(true);
    t.string('join_url');
    t.integer('capacity'); // null = unlimited
    t.boolean('published').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('open_day_registrations', (t) => {
    t.increments('id').primary();
    t.integer('open_day_id').unsigned().notNullable().references('id').inTable('open_days').onDelete('CASCADE');
    t.string('first_name').notNullable();
    t.string('last_name');
    t.string('email').notNullable();
    t.string('phone');
    t.string('country');
    t.string('interest');
    t.text('message');
    t.integer('lead_id').unsigned().references('id').inTable('leads').onDelete('SET NULL');
    t.boolean('attended').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('open_day_registrations');
  await knex.schema.dropTableIfExists('open_days');
};
