/**
 * Final exam support across three scopes: a single course, a programme year,
 * or an entire programme.
 *  - is_final_exam: marks a quiz as a culminating exam (not a module quiz).
 *  - exam_scope: 'course' | 'year' | 'programme'.
 *  - program_id / exam_year: used for year/programme exams.
 *  - course_id becomes nullable so programme/year exams need not belong to a course.
 * Additive + nullability relaxation — existing quizzes are unaffected.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('quizzes', 'is_final_exam'))) {
    await knex.schema.alterTable('quizzes', (t) => { t.boolean('is_final_exam').notNullable().defaultTo(false); });
  }
  if (!(await knex.schema.hasColumn('quizzes', 'exam_scope'))) {
    await knex.schema.alterTable('quizzes', (t) => { t.string('exam_scope').notNullable().defaultTo('course'); });
  }
  if (!(await knex.schema.hasColumn('quizzes', 'program_id'))) {
    await knex.schema.alterTable('quizzes', (t) => {
      t.integer('program_id').unsigned().references('id').inTable('programs').onDelete('CASCADE');
    });
  }
  if (!(await knex.schema.hasColumn('quizzes', 'exam_year'))) {
    await knex.schema.alterTable('quizzes', (t) => { t.integer('exam_year'); });
  }
  // Allow course_id to be null for programme/year exams.
  await knex.schema.alterTable('quizzes', (t) => {
    t.integer('course_id').unsigned().nullable().alter();
  });
};

exports.down = async function down(knex) {
  for (const col of ['exam_year', 'program_id', 'exam_scope', 'is_final_exam']) {
    if (await knex.schema.hasColumn('quizzes', col)) {
      await knex.schema.alterTable('quizzes', (t) => { t.dropColumn(col); });
    }
  }
};
