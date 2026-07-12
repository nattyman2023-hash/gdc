/**
 * Migration: Add course-wide discussion forums.
 *
 * Allows students in the same course to create topics, reply, subscribe,
 * and see unread/pinned/locked states. Faculty and staff can moderate.
 */
exports.up = async function (knex) {
  // Forums are categories within a course (e.g. "General Discussion", "Q&A").
  await knex.schema.createTable('course_forums', (t) => {
    t.increments('id').primary();
    t.integer('course_id').unsigned().references('id').inTable('courses').onDelete('CASCADE').notNullable();
    t.string('title').notNullable();
    t.text('description').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Topics (threads) inside a forum.
  await knex.schema.createTable('forum_topics', (t) => {
    t.increments('id').primary();
    t.integer('forum_id').unsigned().references('id').inTable('course_forums').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.string('title').notNullable();
    t.text('body').notNullable();
    t.boolean('pinned').notNullable().defaultTo(false);
    t.boolean('locked').notNullable().defaultTo(false);
    t.integer('views').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  // Replies to a topic.
  await knex.schema.createTable('forum_replies', (t) => {
    t.increments('id').primary();
    t.integer('topic_id').unsigned().references('id').inTable('forum_topics').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.text('body').notNullable();
    t.timestamps(true, true);
  });

  // Track last view per user per topic for unread indicators.
  await knex.schema.createTable('forum_topic_views', (t) => {
    t.increments('id').primary();
    t.integer('topic_id').unsigned().references('id').inTable('forum_topics').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.timestamp('viewed_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['topic_id', 'user_id']);
  });

  // Subscriptions so users get notified of new replies.
  await knex.schema.createTable('forum_subscriptions', (t) => {
    t.increments('id').primary();
    t.integer('topic_id').unsigned().references('id').inTable('forum_topics').onDelete('CASCADE').notNullable();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.timestamps(true, true);
    t.unique(['topic_id', 'user_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('forum_subscriptions');
  await knex.schema.dropTableIfExists('forum_topic_views');
  await knex.schema.dropTableIfExists('forum_replies');
  await knex.schema.dropTableIfExists('forum_topics');
  await knex.schema.dropTableIfExists('course_forums');
};
