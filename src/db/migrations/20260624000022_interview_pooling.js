/**
 * Interview pooling + calendar scaffolding.
 *  - interview_slots.interviewer_id becomes nullable so a slot can belong to a
 *    shared pool ("Academic Office" / "any available host") rather than one person.
 *  - host_label names the pool when there is no specific interviewer.
 *  - calendar_connections stores a user's connected calendar (Google) — the
 *    plumbing is in place now; it stays dormant until OAuth credentials are set.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('interview_slots', (t) => {
    t.string('host_label'); // e.g. "Academic Office" — shown when interviewer_id is null
  });
  await knex.schema.alterTable('interview_slots', (t) => {
    t.integer('interviewer_id').unsigned().nullable().alter();
  });

  await knex.schema.createTable('calendar_connections', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE').unique();
    t.string('provider').notNullable().defaultTo('google');
    t.string('google_email');
    t.text('access_token');
    t.text('refresh_token');
    t.dateTime('expires_at');
    t.string('calendar_id').defaultTo('primary');
    t.timestamps(true, true);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('calendar_connections');
  await knex.schema.alterTable('interview_slots', (t) => {
    t.dropColumn('host_label');
  });
  // Note: reverting interviewer_id back to NOT NULL is intentionally skipped
  // (would fail if any pooled slots exist).
};
