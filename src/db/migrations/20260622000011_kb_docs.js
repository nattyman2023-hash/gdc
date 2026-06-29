/**
 * Phase 13 — knowledge base + application documents.
 *   kb_articles            — public help / knowledge base articles
 *   application_documents  — supporting document links on an application
 */
exports.up = async function (knex) {
  await knex.schema.createTable('kb_articles', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.string('category').notNullable().defaultTo('General');
    t.text('excerpt').nullable();
    t.text('body').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.integer('views').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('application_documents', (t) => {
    t.increments('id').primary();
    t.integer('application_id').unsigned().references('id').inTable('applications').onDelete('CASCADE').notNullable();
    t.string('label').notNullable();
    t.string('url').notNullable();
    t.integer('uploaded_by').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('application_documents');
  await knex.schema.dropTableIfExists('kb_articles');
};
