/**
 * Group a module's lessons into ordered blocks ("Lesson 1", "Lesson 2", …).
 * Each block holds its activities (e.g. reading -> reading -> video).
 * block_no = the block's position in the module; block_title = the block topic.
 * Additive and nullable, so existing flat lessons are unaffected.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('lessons', 'block_no'))) {
    await knex.schema.alterTable('lessons', (t) => { t.integer('block_no'); });
  }
  if (!(await knex.schema.hasColumn('lessons', 'block_title'))) {
    await knex.schema.alterTable('lessons', (t) => { t.string('block_title'); });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('lessons', 'block_title')) {
    await knex.schema.alterTable('lessons', (t) => { t.dropColumn('block_title'); });
  }
  if (await knex.schema.hasColumn('lessons', 'block_no')) {
    await knex.schema.alterTable('lessons', (t) => { t.dropColumn('block_no'); });
  }
};
