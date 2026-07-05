/**
 * Migration: Create the settings key-value table so API keys (Emailit, Stripe, Zoom)
 * can be entered and updated from the admin CRM without SSH access to the server.
 */
exports.up = async function (knex) {
  if (await knex.schema.hasTable('settings')) return;

  await knex.schema.createTable('settings', (t) => {
    t.string('key', 120).primary();
    t.text('value').nullable();
    t.string('label', 200).notNullable();   // human-readable name
    t.string('group', 80).notNullable();     // e.g. email, payments, zoom
    t.boolean('sensitive').defaultTo(true);  // mask in the UI if true
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('settings');
};