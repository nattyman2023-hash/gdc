/**
 * Complete the live DB schema. The migrations never fully applied on the live
 * MySQL, so several supporting tables are missing or lack newer columns (e.g.
 * essay_submissions doesn't exist), causing "Something went wrong" in admin.
 *
 * This rebuilds every table EXCEPT the ones we must preserve, using the local
 * schema as the source of truth. The rebuilt tables are recreated EMPTY — they
 * hold student activity / transactional data, of which production has none yet.
 * Content tables (already restored with data) and auth/migration tables are
 * preserved untouched.
 *
 * Usage: node scripts/fix-schema.js  ->  writes fix-schema.sql
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'gdcu.sqlite'), { readonly: true });
const OUT = path.join(__dirname, '..', 'fix-schema.sql');
const DBNAME = 'u514321141_gdcu';

// Do NOT touch these: content tables already restored with data; users/sessions
// hold the admin login + active sessions; knex_* hold the frozen migration state.
const PRESERVE = new Set([
  'programs', 'courses', 'modules', 'lessons', 'lesson_materials', 'quizzes', 'quiz_questions', 'quiz_options',
  'users', 'sessions', 'knex_migrations', 'knex_migrations_lock',
]);

function mysqlType(col) {
  const t = String(col.type || '').toLowerCase();
  const hasDefault = col.dflt_value !== null && col.dflt_value !== undefined;
  if (col.pk) return 'int unsigned NOT NULL AUTO_INCREMENT';
  if (t === 'integer') return 'int';
  if (t === 'boolean') return 'tinyint(1)';
  if (t === 'datetime' || t === 'timestamp') return 'datetime';
  if (t === 'date') return 'date';
  if (t === 'float' || t === 'real' || t === 'double') return 'double';
  if (t.startsWith('decimal') || t.startsWith('numeric')) return t.replace('numeric', 'decimal');
  if (t.startsWith('varchar')) return t;
  if (t === 'json') return 'json';
  if (t === 'text') return hasDefault ? 'varchar(255)' : 'text';
  if (t === 'bigint') return 'bigint';
  return hasDefault ? 'varchar(255)' : 'text';
}

function mysqlDefaultClause(col) {
  if (col.dflt_value === null || col.dflt_value === undefined) return '';
  const raw = String(col.dflt_value);
  if (raw.toUpperCase() === 'CURRENT_TIMESTAMP') return ' DEFAULT CURRENT_TIMESTAMP';
  const m = raw.match(/^'(.*)'$/);
  const val = m ? m[1] : raw;
  const t = String(col.type || '').toLowerCase();
  const numeric = ['integer', 'boolean', 'float', 'real', 'double', 'bigint'].includes(t) || t.startsWith('decimal') || t.startsWith('numeric');
  if (numeric) return ` DEFAULT ${val}`;
  return ` DEFAULT '${val.replace(/'/g, "\\'")}'`;
}

function createTableSql(table) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  const defs = cols.map((c) => {
    let line = `  \`${c.name}\` ${mysqlType(c)}`;
    if (!c.pk) line += c.notnull ? ' NOT NULL' : ' NULL';
    line += mysqlDefaultClause(c);
    return line;
  });
  const pk = cols.find((c) => c.pk);
  if (pk) defs.push(`  PRIMARY KEY (\`${pk.name}\`)`);
  // IF NOT EXISTS + no foreign-key constraints => creates missing tables without
  // any DROP, so it needs no "disable foreign key checks" and can't fail on FKs.
  return `CREATE TABLE IF NOT EXISTS \`${table}\` (\n${defs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
}

const allTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%' ORDER BY name")
  .all()
  .map((r) => r.name)
  .filter((t) => !PRESERVE.has(t));

const lines = [];
lines.push('-- GDCU schema completion: create any missing supporting tables (empty)');
lines.push(`USE \`${DBNAME}\`;`);
lines.push('SET NAMES utf8mb4;');
lines.push('');
for (const t of allTables) {
  lines.push(createTableSql(t));
  lines.push('');
}

// users is preserved (holds the admin), but a late migration adds `phone`.
// Add it only if missing, so we don't disturb the existing account.
lines.push("-- Ensure users.phone exists (added by a later migration that may not have applied)");
lines.push("SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone');");
lines.push("SET @s := IF(@c = 0, 'ALTER TABLE `users` ADD COLUMN `phone` varchar(255) NULL', 'DO 0');");
lines.push('PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
lines.push('');
fs.writeFileSync(OUT, lines.join('\n'));

// eslint-disable-next-line no-console
console.log(`Rebuilding ${allTables.length} tables (empty):\n  ${allTables.join(', ')}`);
console.log(`\nWrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
