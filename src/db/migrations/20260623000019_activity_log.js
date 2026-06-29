/**
 * Phase 27 (Batch 2) — activity log (audit trail) for CRM records.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('activity_log', (t) => {
    t.increments('id').primary();
    t.enu('entity_type', ['lead', 'application', 'student']).notNullable();
    t.integer('entity_id').notNullable();
    t.integer('actor_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('actor_name').nullable();
    t.string('action').notNullable();   // e.g. "status changed", "assigned", "email sent"
    t.string('detail').nullable();       // e.g. "new → in_review"
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('activity_log');
};
