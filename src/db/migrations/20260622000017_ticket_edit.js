/**
 * Phase 25 — allow editing of support ticket replies (track edits).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('ticket_replies', (t) => {
    t.timestamp('edited_at').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('ticket_replies', (t) => {
    t.dropColumn('edited_at');
  });
};
