/**
 * Phase 14 — finance & governance back-office.
 *   payroll_entries      — faculty/staff pay records
 *   budget_lines         — institutional budget & asset allocation
 *   governance_documents — policies, legal & compliance repository
 *   board_members        — institutional governance board
 */
exports.up = async function (knex) {
  await knex.schema.createTable('payroll_entries', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.string('period').notNullable(); // e.g. "June 2026"
    t.decimal('gross', 10, 2).notNullable().defaultTo(0);
    t.decimal('deductions', 10, 2).notNullable().defaultTo(0);
    t.decimal('net', 10, 2).notNullable().defaultTo(0);
    t.string('currency').notNullable().defaultTo('GBP');
    t.enu('status', ['pending', 'paid']).notNullable().defaultTo('pending');
    t.text('notes').nullable();
    t.timestamp('paid_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('budget_lines', (t) => {
    t.increments('id').primary();
    t.string('fiscal_year').notNullable().defaultTo('2026');
    t.string('category').notNullable();
    t.string('description').nullable();
    t.decimal('allocated', 12, 2).notNullable().defaultTo(0);
    t.decimal('spent', 12, 2).notNullable().defaultTo(0);
    t.string('currency').notNullable().defaultTo('GBP');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('governance_documents', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.string('category').notNullable().defaultTo('Policy'); // Policy, Legal, Minutes, Report, Compliance
    t.string('doc_type').nullable(); // PDF, Link
    t.string('url').notNullable();
    t.date('review_date').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('board_members', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('role').nullable();
    t.text('bio').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('board_members');
  await knex.schema.dropTableIfExists('governance_documents');
  await knex.schema.dropTableIfExists('budget_lines');
  await knex.schema.dropTableIfExists('payroll_entries');
};
