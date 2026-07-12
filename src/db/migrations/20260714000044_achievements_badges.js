/**
 * Migration: Achievements & Badges system.
 *
 * Defines awardable badges and tracks which users have earned them.
 * The engine (src/lib/achievements.js) checks triggers (lesson complete,
 * quiz pass, streak, course complete) and inserts user_achievements rows.
 */
exports.up = async function (knex) {
  // Predefined badge definitions (created once, rarely changed).
  await knex.schema.createTable('badge_definitions', (t) => {
    t.increments('id').primary();
    t.string('key').notNullable().unique();         // machine key: 'first_lesson', 'streak_7', etc.
    t.string('name').notNullable();                  // display name: "First Steps"
    t.text('description').nullable();                // "Complete your first lesson"
    t.string('icon').notNullable().defaultTo('emoji_events');  // Material Symbols icon name
    t.string('category').notNullable().defaultTo('milestone'); // milestone, streak, quiz, course, special
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Records of users earning badges (one row per user per badge).
  await knex.schema.createTable('user_achievements', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('badge_id').unsigned().references('id').inTable('badge_definitions').onDelete('CASCADE').notNullable();
    t.timestamp('awarded_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'badge_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_achievements');
  await knex.schema.dropTableIfExists('badge_definitions');
};
</｜｜DSML｜｜parameter>
<task_progress>
- [x] Explore existing achievements infrastructure
- [x] Create migration for badge_definitions + user_achievements tables
- [ ] Build achievements engine/lib with trigger checks
- [ ] Add achievement triggers to lesson completion, quiz passes, course completion, streaks
- [ ] Create student-facing achievements view on profile
- [ ] Create admin badge management page
- [ ] Update profile page with achievements showcase
- [ ] Update dashboard with recent achievements
- [ ] Seed default badge definitions
- [ ] Final review and deployment notes
</task_progress>
</write_to_file>