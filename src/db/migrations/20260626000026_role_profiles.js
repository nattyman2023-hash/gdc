/**
 * Role-scoped profiles. Authentication stays in the single `users` table;
 * role-specific data lives in its own 1:1 profile table so students, faculty
 * and staff each have the fields that make sense for them.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('student_profiles'))) {
    await knex.schema.createTable('student_profiles', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      t.string('phone');
      t.date('date_of_birth');
      t.string('country');
      t.string('nationality');
      t.string('address');
      t.integer('program_id').unsigned().references('id').inTable('programs').onDelete('SET NULL');
      t.string('intake');
      t.integer('year_of_study');
      t.string('student_ref');
      t.string('emergency_name');
      t.string('emergency_phone');
      t.text('bio');
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('faculty_profiles'))) {
    await knex.schema.createTable('faculty_profiles', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      t.string('title'); // Dr, Prof, Rev, Mr, Mrs, Ms
      t.string('phone');
      t.string('specialism');
      t.string('qualifications');
      t.string('department');
      t.text('bio');
      t.string('photo_url');
      t.boolean('public_profile').notNullable().defaultTo(false);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('staff_profiles'))) {
    await knex.schema.createTable('staff_profiles', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      t.string('job_title');
      t.string('department');
      t.string('phone');
      t.text('bio');
      t.timestamps(true, true);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('student_profiles');
  await knex.schema.dropTableIfExists('faculty_profiles');
  await knex.schema.dropTableIfExists('staff_profiles');
};
