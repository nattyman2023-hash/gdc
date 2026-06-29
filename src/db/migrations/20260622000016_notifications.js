/**
 * Phase 24 — notifications & email engine.
 *   notifications — in-app notifications per user
 *   email_log     — transactional email outbox (sent or logged)
 */
exports.up = async function (knex) {
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.string('type').notNullable().defaultTo('info'); // info, application, payment, message, success
    t.string('title').notNullable();
    t.string('body').nullable();
    t.string('link').nullable();
    t.boolean('read').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'read']);
  });

  await knex.schema.createTable('email_log', (t) => {
    t.increments('id').primary();
    t.string('to_email').notNullable();
    t.string('to_name').nullable();
    t.string('subject').notNullable();
    t.text('body').nullable();
    t.string('template').nullable();
    t.enu('status', ['sent', 'logged', 'failed']).notNullable().defaultTo('logged');
    t.string('error').nullable();
    t.string('related_type').nullable();
    t.integer('related_id').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('email_log');
  await knex.schema.dropTableIfExists('notifications');
};
