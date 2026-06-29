/**
 * Shared Knex instance used across the app.
 * Reads the same config the CLI uses (knexfile.js) for the current NODE_ENV.
 */
const knexConfig = require('../../knexfile');

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const knex = require('knex')(knexConfig[env]);

module.exports = knex;
