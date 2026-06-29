/**
 * Phase 3 — CRM / Admin.
 *
 *   crm_notes  — timeline notes attached to a lead or application (polymorphic)
 *   invoices   — tuition invoices / instalments raised against a student
 *
 * Also adds a couple of CRM-friendly columns to existing tables.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('crm_notes', (t) => {
    t.increments('id').primary();
    t.enu('entity_type', ['lead', 'application', 'student']).notNullable();
    t.integer('entity_id').notNullable();
    t.integer('author_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.string('author_name').nullable();
    t.text('body').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
  });

  await knex.schema.createTable('invoices', (t) => {
    t.increments('id').primary();
    t.string('reference').notNullable().unique();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.integer('program_id').unsigned().references('id').inTable('programs').onDelete('SET NULL').nullable();
    t.string('description').notNullable();
    t.decimal('amount', 10, 2).notNullable();
    t.string('currency').notNullable().defaultTo('GBP');
    t.date('due_date').nullable();
    t.integer('installment_no').nullable(); // e.g. 1 of 4
    t.integer('installment_total').nullable();
    t.enu('status', ['draft', 'sent', 'paid', 'overdue', 'void']).notNullable().defaultTo('sent');
    t.string('payment_method').nullable(); // card, bank_transfer, stripe
    t.timestamp('paid_at').nullable();
    t.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.timestamps(true, true);
  });

  // Link an accepted application to the student account it created.
  await knex.schema.alterTable('applications', (t) => {
    t.integer('student_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.integer('assigned_to').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('applications', (t) => {
    t.dropColumn('student_user_id');
    t.dropColumn('assigned_to');
  });
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('crm_notes');
};
