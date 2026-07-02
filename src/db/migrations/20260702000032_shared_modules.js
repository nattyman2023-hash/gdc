/**
 * Migration: Add shared_modules support for many-to-many course-module relationships.
 * 
 * This allows:
 * - Modules to be shared across multiple courses (e.g. CORE-101 for all Year 1 students)
 * - Each module can have a year_level indicator
 * - Courses can reference shared modules + own dedicated modules
 */
exports.up = async function (knex) {
  // Tables for the shared module system
  await knex.schema.createTable('shared_modules', (t) => {
    t.increments('id').primary();
    t.string('code').notNullable().unique(); // e.g. CORE-101, BIBL-201
    t.string('title').notNullable();
    t.text('description').nullable();
    t.text('summary').nullable();
    t.integer('year_level').notNullable().defaultTo(1); // 1=first year common, 2=second year etc.
    t.string('category').nullable(); // 'core', 'biblical', 'theology', 'ministry', 'leadership', etc.
    t.string('featured_image').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Junction table linking courses to shared_modules
  await knex.schema.createTable('course_shared_modules', (t) => {
    t.increments('id').primary();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.integer('shared_module_id').unsigned().references('id').inTable('shared_modules').onDelete('CASCADE').notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.unique(['course_id', 'shared_module_id']);
  });

  // Add a type column to modules to distinguish shared vs dedicated
  await knex.schema.alterTable('modules', (t) => {
    t.integer('shared_module_id').unsigned().references('id').inTable('shared_modules').onDelete('SET NULL').nullable();
    t.integer('year_level').notNullable().defaultTo(1);
  });

  // Add year_level to courses for display/grouping
  await knex.schema.alterTable('courses', (t) => {
    t.integer('year_level').notNullable().defaultTo(1);
    t.string('category').nullable(); // certificate, diploma, bachelor, master, doctorate
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('modules', (t) => {
    t.dropColumn('shared_module_id');
    t.dropColumn('year_level');
  });
  await knex.schema.alterTable('courses', (t) => {
    t.dropColumn('year_level');
    t.dropColumn('category');
  });
  await knex.schema.dropTableIfExists('course_shared_modules');
  await knex.schema.dropTableIfExists('shared_modules');
};
