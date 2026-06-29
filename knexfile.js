/**
 * Knex configuration.
 *
 * The SAME migrations & queries run on SQLite (local dev) and MySQL (Hostinger).
 * Switch with the DB_CLIENT env var ("sqlite" | "mysql").
 */
require('dotenv').config();
const path = require('path');

const sqliteFile = process.env.SQLITE_FILE || './data/gdcu.sqlite';

const base = {
  migrations: {
    directory: path.join(__dirname, 'src', 'db', 'migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, 'src', 'db', 'seeds'),
  },
};

const sqlite = {
  ...base,
  client: 'better-sqlite3',
  connection: { filename: sqliteFile },
  useNullAsDefault: true,
  pool: {
    // Enable foreign keys on every SQLite connection
    afterCreate: (conn, done) => {
      conn.pragma('foreign_keys = ON');
      conn.pragma('journal_mode = WAL');
      conn.pragma('synchronous = NORMAL');
      conn.pragma('cache_size = -64000'); // 64MB cache
      done(null, conn);
    },
  },
};

const mysql = {
  ...base,
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    connectTimeout: 10000,
    acquireTimeout: 10000,
  },
  pool: { 
    min: 1, 
    max: 5, 
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
  },
};

const active = process.env.DB_CLIENT === 'mysql' ? mysql : sqlite;

// Knex CLI reads keyed by NODE_ENV; map all to the active connection so
// `knex migrate:latest` works the same in every environment.
module.exports = {
  development: active,
  production: active,
  test: active,
};
