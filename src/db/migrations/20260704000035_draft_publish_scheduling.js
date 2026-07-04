/**
 * Draft/publish workflow for modules, lessons, and quizzes (courses,
 * shared_modules, and assignments already have `published`), plus a
 * general "don't show before this date" scheduling column on lessons,
 * quizzes, and assignments. Modules already have `release_date` for the
 * same purpose — kept as-is rather than renamed, to avoid touching every
 * existing reference to it.
 *
 * All additive: new nullable/defaulted columns only.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('modules', (t) => {
    t.boolean('published').notNullable().defaultTo(true);
  });
  await knex.schema.alterTable('lessons', (t) => {
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamp('available_from').nullable();
  });
  await knex.schema.alterTable('quizzes', (t) => {
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamp('available_from').nullable();
  });
  await knex.schema.alterTable('assignments', (t) => {
    t.timestamp('available_from').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('modules', (t) => { t.dropColumn('published'); });
  await knex.schema.alterTable('lessons', (t) => { t.dropColumn('published'); t.dropColumn('available_from'); });
  await knex.schema.alterTable('quizzes', (t) => { t.dropColumn('published'); t.dropColumn('available_from'); });
  await knex.schema.alterTable('assignments', (t) => { t.dropColumn('available_from'); });
};
