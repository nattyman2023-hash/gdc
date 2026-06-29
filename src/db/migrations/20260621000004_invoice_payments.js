/**
 * Phase 5 — online tuition payments.
 * Add Stripe tracking columns to invoices so student self-service payments
 * can be reconciled via the webhook.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('invoices', (t) => {
    t.string('stripe_session_id').nullable();
    t.string('stripe_payment_intent').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('invoices', (t) => {
    t.dropColumn('stripe_session_id');
    t.dropColumn('stripe_payment_intent');
  });
};
