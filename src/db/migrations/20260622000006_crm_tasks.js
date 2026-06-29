/**
 * Phase 8 — CRM enhancements.
 *   crm_tasks — follow-up tasks/reminders attached to a lead or application,
 *               assignable to a staff member with a due date.
 *   leads.converted_application_id — link a lead to the application it became.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('crm_tasks', (t) => {
    t.increments('id').primary();
    t.enu('entity_type', ['lead', 'application']).notNullable();
    t.integer('entity_id').notNullable();
    t.string('title').notNullable();
    t.date('due_date').nullable();
    t.integer('assigned_to').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.boolean('done').notNullable().defaultTo(false);
    t.timestamp('done_at').nullable();
    t.timestamps(true, true);
    t.index(['entity_type', 'entity_id']);
    t.index(['done', 'due_date']);
  });

  await knex.schema.alterTable('leads', (t) => {
    t.integer('converted_application_id').unsigned()
      .references('id').inTable('applications').onDelete('SET NULL').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('leads', (t) => {
    t.dropColumn('converted_application_id');
  });
  await knex.schema.dropTableIfExists('crm_tasks');
};
