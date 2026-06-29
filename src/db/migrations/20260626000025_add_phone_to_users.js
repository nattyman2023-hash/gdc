/**
 * Migration: Add phone column to users table for profile management.
 */

exports.up = async (knex) => {
  await knex.schema.table('users', (t) => {
    t.string('phone').nullable().after('status');
  });
};

exports.down = async (knex) => {
  await knex.schema.table('users', (t) => {
    t.dropColumn('phone');
  });
};
