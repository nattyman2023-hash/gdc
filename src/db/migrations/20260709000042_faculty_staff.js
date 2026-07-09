/**
 * Faculty & Staff table for CRM management.
 * Once added in the admin panel, profiles appear on the public About Us / Team page.
 */
exports.up = (knex) =>
  knex.schema.createTable('faculty_staff', (t) => {
    t.increments('id');
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('title').comment('e.g. Professor, Dean, Lecturer');
    t.string('role').comment('e.g. Head of Department');
    t.string('department');
    t.text('biography');
    t.string('email');
    t.string('phone');
    t.string('photo_url');
    t.integer('display_order').defaultTo(0);
    t.string('status', 20).defaultTo('active').comment('active|inactive');
    t.string('category', 30).defaultTo('faculty').comment('faculty|staff|leadership');
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTableIfExists('faculty_staff');