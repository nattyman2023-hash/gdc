/**
 * Attendance / engagement tracking.
 *  - login_events: one row per student login, so we can show real activity history.
 *  - attendance_warnings: which escalation emails have been sent, so each stage
 *    fires once per absence streak (and resets automatically once they log back in).
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('login_events', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'created_at']);
  });

  await knex.schema.createTable('attendance_warnings', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('stage').notNullable(); // 1 = first warning, 2 = second, 3 = final notice
    t.timestamp('sent_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'stage']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('attendance_warnings');
  await knex.schema.dropTableIfExists('login_events');
};
