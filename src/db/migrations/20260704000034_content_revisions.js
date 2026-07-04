/**
 * Version history / audit trail for course-builder content.
 *
 * Stores a full JSON snapshot of a module/lesson/quiz/assignment row
 * immediately before it's changed or deleted, so an admin can see what
 * changed and restore a prior version.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('content_revisions', (t) => {
    t.increments('id').primary();
    t.string('entity_type').notNullable(); // 'module' | 'lesson' | 'quiz' | 'assignment'
    t.integer('entity_id').unsigned().notNullable();
    t.integer('course_id').unsigned().nullable();
    t.string('action').notNullable(); // 'create' | 'update' | 'delete' | 'restore'
    t.text('snapshot_json').notNullable();
    t.integer('actor_user_id').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('content_revisions');
};
