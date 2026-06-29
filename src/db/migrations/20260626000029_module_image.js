/**
 * A featured image per module, so the course builder can show modules as
 * collapsible image cards.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('modules', 'featured_image'))) {
    await knex.schema.alterTable('modules', (t) => { t.string('featured_image'); });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('modules', 'featured_image')) {
    await knex.schema.alterTable('modules', (t) => { t.dropColumn('featured_image'); });
  }
};
