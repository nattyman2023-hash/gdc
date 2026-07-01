/**
 * A featured image per open day, so the public site can show open days as
 * immersive image-backed cards (homepage banner, listing, detail hero).
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('open_days', 'image_url'))) {
    await knex.schema.alterTable('open_days', (t) => { t.string('image_url'); });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('open_days', 'image_url')) {
    await knex.schema.alterTable('open_days', (t) => { t.dropColumn('image_url'); });
  }
};
