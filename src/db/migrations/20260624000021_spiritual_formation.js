/**
 * Spiritual Formation & Chapel.
 *  - formation_groups: small pastoral groups (default Tuesdays) each led by a facilitator.
 *  - formation_members: which students belong to which group.
 *  - chapel_sessions: the scheduled Tuesday chapel gatherings.
 *  - chapel_attendance: per-student attendance for a chapel session.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('formation_groups', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.text('description');
    t.integer('facilitator_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    t.string('meeting_day').notNullable().defaultTo('Tuesday');
    t.string('meeting_time'); // e.g. "13:00"
    t.integer('capacity'); // null = unlimited
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('formation_members', (t) => {
    t.increments('id').primary();
    t.integer('group_id').unsigned().notNullable().references('id').inTable('formation_groups').onDelete('CASCADE');
    t.integer('student_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['group_id', 'student_id']);
  });

  await knex.schema.createTable('chapel_sessions', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.string('theme');
    t.string('speaker');
    t.string('scripture');
    t.dateTime('starts_at').notNullable();
    t.string('join_url');
    t.string('location');
    t.string('status').notNullable().defaultTo('scheduled'); // scheduled | completed | cancelled
    t.text('notes');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('chapel_attendance', (t) => {
    t.increments('id').primary();
    t.integer('session_id').unsigned().notNullable().references('id').inTable('chapel_sessions').onDelete('CASCADE');
    t.integer('student_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('status').notNullable().defaultTo('present'); // present | excused | absent
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['session_id', 'student_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('chapel_attendance');
  await knex.schema.dropTableIfExists('chapel_sessions');
  await knex.schema.dropTableIfExists('formation_members');
  await knex.schema.dropTableIfExists('formation_groups');
};
