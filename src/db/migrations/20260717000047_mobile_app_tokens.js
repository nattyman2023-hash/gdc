/**
 * Mobile student app authentication tokens.
 *
 * Tokens are stored as SHA-256 hashes so a database read alone cannot be used
 * to impersonate a student. The raw bearer token is returned only at login.
 */
exports.up = async function (knex) {
  if (await knex.schema.hasTable('mobile_tokens')) return;

  await knex.schema.createTable('mobile_tokens', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();
    t.string('token_hash', 64).notNullable().unique();
    t.string('device_name').nullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('last_used_at').nullable();
    t.timestamp('revoked_at').nullable();
    t.timestamps(true, true);
    t.index(['user_id', 'revoked_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('mobile_tokens');
};
