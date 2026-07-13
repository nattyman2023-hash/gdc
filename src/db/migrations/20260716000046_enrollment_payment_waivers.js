/**
 * Allow an authorised administrator to grant course access without recording
 * a payment. The invoice remains visible and outstanding for accounting.
 */
exports.up = async function (knex) {
  if (await knex.schema.hasTable('enrollments') && !(await knex.schema.hasColumn('enrollments', 'payment_waived'))) {
    await knex.schema.alterTable('enrollments', (t) => {
      t.boolean('payment_waived').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('enrollments') && await knex.schema.hasColumn('enrollments', 'payment_waived')) {
    await knex.schema.alterTable('enrollments', (t) => t.dropColumn('payment_waived'));
  }
};
