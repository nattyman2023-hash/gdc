/**
 * Academic calendar / schedule.
 * One table of dated items (closures, opening dates, term dates, deadlines,
 * holidays, exams, general events) with an audience so the same calendar can be
 * sliced for the public site, students, faculty and staff. Managed from the CRM.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('calendar_events', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.text('description');
    t.string('category').notNullable().defaultTo('event'); // closure|opening|term|deadline|holiday|exam|event
    t.dateTime('starts_at').notNullable();
    t.dateTime('ends_at');
    t.boolean('all_day').notNullable().defaultTo(true);
    t.string('location');
    t.string('audience').notNullable().defaultTo('all'); // public|students|faculty|staff|all
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['starts_at']);
    t.index(['audience']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('calendar_events');
};
