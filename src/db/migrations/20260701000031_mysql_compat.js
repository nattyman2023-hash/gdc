/**
 * Schema fix: ensure all tables created in 20260630000030_student_profiles.js
 * are fully MySQL-compatible.
 *
 * This migration handles the edge cases that the original migration got wrong:
 *   1. assignments ALTER TABLE used SQLite raw SQL syntax
 *   2. social_links used t.json() which SQLite doesn't support natively
 *
 * On a fresh database this migration is a no-op (the tables exist from the
 * previous migration). On MySQL (production), it checks if columns exist
 * before adding them so it won't error if already applied via the frozen
 * migration chain.
 */
exports.up = async function (knex) {
  const isMySQL = knex.client.config.client === 'mysql2';
  if (!isMySQL) {
    // SQLite: everything from the previous migration already works.
    return;
  }

  // ── 1. Ensure assignments have the new columns ──────────────
  const asgCols = await knex.raw("SHOW COLUMNS FROM assignments");
  const asgColNames = asgCols[0].map(c => c.Field);

  if (!asgColNames.includes('module_id')) {
    await knex.schema.alterTable('assignments', (t) => {
      t.integer('module_id').unsigned().references('id').inTable('modules').onDelete('SET NULL').nullable();
    });
  }
  if (!asgColNames.includes('lesson_block_id')) {
    await knex.schema.alterTable('assignments', (t) => {
      t.integer('lesson_block_id').unsigned().nullable();
    });
  }
  if (!asgColNames.includes('sort_order')) {
    await knex.schema.alterTable('assignments', (t) => {
      t.integer('sort_order').notNullable().defaultTo(0);
    });
  }
  if (!asgColNames.includes('assignment_type')) {
    await knex.schema.alterTable('assignments', (t) => {
      t.enu('assignment_type', ['essay', 'file_upload', 'link', 'quiz']).notNullable().defaultTo('essay');
    });
  }

  // ── 2. Ensure users have social_links column ────────────────
  const userCols = await knex.raw("SHOW COLUMNS FROM users");
  const userColNames = userCols[0].map(c => c.Field);

  if (!userColNames.includes('social_links')) {
    await knex.schema.alterTable('users', (t) => {
      t.specificType('social_links', 'JSON').nullable();
    });
  }
};

exports.down = async function () {
  // No rollback needed — this is a compatibility fix.
};
