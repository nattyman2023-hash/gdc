/**
 * LMS richness: featured imagery for courses and per-lesson images.
 * Purely additive — existing courses/lessons keep working with these null.
 */
exports.up = async function up(knex) {
  const hasCourseImg = await knex.schema.hasColumn('courses', 'featured_image');
  if (!hasCourseImg) {
    await knex.schema.alterTable('courses', (t) => { t.string('featured_image'); });
  }
  const hasLessonImg = await knex.schema.hasColumn('lessons', 'image_url');
  if (!hasLessonImg) {
    await knex.schema.alterTable('lessons', (t) => { t.string('image_url'); });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('lessons', 'image_url')) {
    await knex.schema.alterTable('lessons', (t) => { t.dropColumn('image_url'); });
  }
  if (await knex.schema.hasColumn('courses', 'featured_image')) {
    await knex.schema.alterTable('courses', (t) => { t.dropColumn('featured_image'); });
  }
};
