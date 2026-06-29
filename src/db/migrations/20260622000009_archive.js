/**
 * Phase 11 — add an `archived` flag to leads and applications so records can be
 * archived (soft-hidden) without losing data, alongside hard delete.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('leads', (t) => {
    t.boolean('archived').notNullable().defaultTo(false);
  });
  await knex.schema.alterTable('applications', (t) => {
    t.boolean('archived').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('leads', (t) => t.dropColumn('archived'));
  await knex.schema.alterTable('applications', (t) => t.dropColumn('archived'));
};
