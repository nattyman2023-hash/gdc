/**
 * Position a quiz within a module's block sequence: after_block = N means this
 * quiz is taken after block N is completed, covering the preceding blocks, and
 * must be passed before the next block unlocks.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('quizzes', 'after_block'))) {
    await knex.schema.alterTable('quizzes', (t) => { t.integer('after_block'); });
  }
  if (!(await knex.schema.hasColumn('quizzes', 'covers_blocks'))) {
    await knex.schema.alterTable('quizzes', (t) => { t.string('covers_blocks'); }); // e.g. "1-5"
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('quizzes', 'covers_blocks')) {
    await knex.schema.alterTable('quizzes', (t) => { t.dropColumn('covers_blocks'); });
  }
  if (await knex.schema.hasColumn('quizzes', 'after_block')) {
    await knex.schema.alterTable('quizzes', (t) => { t.dropColumn('after_block'); });
  }
};
