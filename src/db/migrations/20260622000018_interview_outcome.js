/**
 * Phase 26 — interview outcomes (recommendation, rating, notes).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('interviews', (t) => {
    t.enu('outcome', ['pending', 'recommend', 'hold', 'decline']).notNullable().defaultTo('pending');
    t.integer('rating').nullable(); // 1–5
    t.text('outcome_notes').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('interviews', (t) => {
    t.dropColumn('outcome');
    t.dropColumn('rating');
    t.dropColumn('outcome_notes');
  });
};
