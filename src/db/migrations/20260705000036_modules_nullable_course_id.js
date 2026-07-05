/**
 * Migration: Make modules.course_id nullable.
 *
 * The shared-module system (migration 20260702000032) uses a row in
 * `modules` as a *template* for a shared module — it has a
 * `shared_module_id` but no single `course_id` (the module is shared
 * across many courses via the `course_shared_modules` junction).
 *
 * The original `modules` table (migration 20260621000002) defined
 * `course_id` as NOT NULL, so inserting a shared-module template row
 * with `course_id: null` crashes on MySQL:
 *   "Column 'course_id' cannot be null"
 *
 * This migration relaxes the column to nullable so shared-module
 * template rows can be created. Dedicated (course-specific) modules
 * still always carry a non-null course_id — that is enforced at the
 * application layer, not the DB layer.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('modules', (t) => {
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').nullable().alter();
  });
};

exports.down = async function (knex) {
  // Revert to notNullable. NOTE: this will fail if any shared-module
  // template rows with null course_id exist — delete them first.
  await knex.schema.alterTable('modules', (t) => {
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable().alter();
  });
};