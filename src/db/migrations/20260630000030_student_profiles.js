/**
 * Extended student profiles, cohorts, achievements, chat system.
 *
 * Adds:
 *   1. Extended profile fields on users (photo, country, bio, etc.)
 *   2. cohorts & cohort_members (batch/year groups)
 *   3. Assignments linked to modules/blocks
 *   4. achievements & attendance_summary
 *   5. Full chat system (conversations, participants, messages, reactions)
 */
exports.up = async function (knex) {
  // ── 1. Extended student profiles ──────────────────────────
  await knex.schema.alterTable('users', (t) => {
    t.string('photo_url').nullable();
    t.string('country').nullable();
    t.string('country_code', 4).nullable(); // e.g. "GB", "KE"
    t.date('date_of_birth').nullable();
    t.text('bio').nullable();
    t.json('social_links').nullable();
    t.string('student_id', 20).nullable().unique(); // e.g. "GDCU-2026-0001"
  });

  // ── 2. Cohorts (batches / year groups) ────────────────────
  await knex.schema.createTable('cohorts', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.integer('year').notNullable();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('SET NULL').nullable();
    t.string('code', 20).nullable().unique(); // e.g. "BATH-2026"
    t.timestamps(true, true);
  });

  await knex.schema.createTable('cohort_members', (t) => {
    t.increments('id').primary();
    t.integer('cohort_id').unsigned().references('id').inTable('cohorts').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.enu('role', ['student', 'mentor', 'moderator']).notNullable().defaultTo('student');
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.unique(['cohort_id', 'user_id']);
  });

  // ── 3. Assignments linked to modules/blocks ────────────────
  // Use raw SQL for SQLite compatibility with ALTER TABLE ADD COLUMN
  await knex.schema.raw("ALTER TABLE assignments ADD COLUMN module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL");
  await knex.schema.raw("ALTER TABLE assignments ADD COLUMN lesson_block_id INTEGER");
  await knex.schema.raw("ALTER TABLE assignments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  await knex.schema.raw("ALTER TABLE assignments ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'essay'");

  // ── 4. Achievements ────────────────────────────────────────
  await knex.schema.createTable('achievements', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.string('type').notNullable();          // 'course_complete', 'perfect_quiz', 'attendance_streak', etc.
    t.string('title').notNullable();
    t.text('description').nullable();
    t.string('badge_icon').nullable();       // Material Symbol name
    t.string('badge_color').nullable();      // hex or tailwind class
    t.timestamp('awarded_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'type']);
  });

  // ── 5. Attendance summary per course ──────────────────────
  await knex.schema.createTable('attendance_summary', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.integer('total_sessions').notNullable().defaultTo(0);
    t.integer('attended').notNullable().defaultTo(0);
    t.decimal('percentage', 5, 2).notNullable().defaultTo(0);
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'course_id']);
  });

  // ── 6. Chat system ─────────────────────────────────────────
  await knex.schema.createTable('chat_conversations', (t) => {
    t.increments('id').primary();
    t.enu('type', ['direct', 'cohort', 'group']).notNullable();
    t.string('title').nullable();
    t.text('description').nullable();
    t.integer('cohort_id').unsigned().references('id').inTable('cohorts').onDelete('SET NULL').nullable();
    t.string('avatar_url').nullable();
    t.timestamp('last_message_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('chat_participants', (t) => {
    t.increments('id').primary();
    t.integer('conversation_id').unsigned().references('id').inTable('chat_conversations').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.timestamp('last_read_at').defaultTo(knex.fn.now());
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.boolean('is_admin').notNullable().defaultTo(false);
    t.unique(['conversation_id', 'user_id']);
  });

  await knex.schema.createTable('chat_messages', (t) => {
    t.increments('id').primary();
    t.integer('conversation_id').unsigned().references('id').inTable('chat_conversations').onDelete('CASCADE').notNullable();
    t.integer('sender_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.text('message').notNullable();
    t.enu('message_type', ['text', 'image', 'file', 'system']).notNullable().defaultTo('text');
    t.string('attachment_url').nullable();
    t.string('attachment_name').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('edited_at').nullable();
    t.index(['conversation_id', 'created_at']);
  });

  await knex.schema.createTable('chat_reactions', (t) => {
    t.increments('id').primary();
    t.integer('message_id').unsigned().references('id').inTable('chat_messages').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.string('emoji').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['message_id', 'user_id', 'emoji']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('chat_reactions');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_participants');
  await knex.schema.dropTableIfExists('chat_conversations');
  await knex.schema.dropTableIfExists('attendance_summary');
  await knex.schema.dropTableIfExists('achievements');

  await knex.schema.alterTable('assignments', (t) => {
    t.dropColumn('module_id');
    t.dropColumn('lesson_block_id');
    t.dropColumn('sort_order');
    t.dropColumn('assignment_type');
  });

  await knex.schema.dropTableIfExists('cohort_members');
  await knex.schema.dropTableIfExists('cohorts');

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('photo_url');
    t.dropColumn('country');
    t.dropColumn('country_code');
    t.dropColumn('date_of_birth');
    t.dropColumn('bio');
    t.dropColumn('social_links');
    t.dropColumn('student_id');
  });
};
