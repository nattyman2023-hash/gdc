/**
 * Payments table for Stripe integration.
 * Stores payment records linked to applications/users.
 */
exports.up = (knex) =>
  knex.schema.createTable('payments', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    t.integer('application_id').unsigned().references('id').inTable('applications').onDelete('SET NULL');
    t.string('stripe_session_id').unique();
    t.string('stripe_payment_intent_id');
    t.string('currency', 3).defaultTo('GBP');
    t.integer('amount').unsigned().comment('Amount in minor units (pence/cents)');
    t.string('status', 20).defaultTo('pending').comment('pending|paid|failed|cancelled|refunded');
    t.string('description');
    t.jsonb('metadata');
    t.timestamp('paid_at');
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTableIfExists('payments');