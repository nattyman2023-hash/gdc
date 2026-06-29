/**
 * Phase 7 — Events & Campus Hub, and the Library / Resource repository.
 *
 *   events       — campus/community events (public + portal)
 *   event_rsvps  — a student's RSVP to an event
 *   resources    — library / academic resource items (links, documents, videos)
 */
exports.up = async function (knex) {
  await knex.schema.createTable('events', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.string('category').nullable(); // Webinar, Worship, Conference, Orientation
    t.text('description').nullable();
    t.string('location').nullable(); // physical location text
    t.boolean('is_online').notNullable().defaultTo(true);
    t.string('join_url').nullable();
    t.timestamp('starts_at').notNullable();
    t.timestamp('ends_at').nullable();
    t.string('image_url').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('event_rsvps', (t) => {
    t.increments('id').primary();
    t.integer('event_id').unsigned().references('id').inTable('events').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['event_id', 'user_id']);
  });

  await knex.schema.createTable('resources', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.enu('type', ['document', 'link', 'video', 'book', 'journal']).notNullable().defaultTo('link');
    t.string('category').nullable();
    t.text('description').nullable();
    t.string('url').notNullable();
    t.string('author').nullable();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('SET NULL').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('resources');
  await knex.schema.dropTableIfExists('event_rsvps');
  await knex.schema.dropTableIfExists('events');
};
