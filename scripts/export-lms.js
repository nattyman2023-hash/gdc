/**
 * Export LMS content from the local SQLite dev DB to a self-contained MySQL
 * import file (restore-courses.sql) for the live site, via phpMyAdmin.
 *
 * The live database's migrations never fully completed, so its content tables
 * are missing newer columns. Rather than chase that, this REBUILDS the 8
 * content tables with the correct structure (derived from the local schema)
 * and then loads the data — so the import works regardless of the live DB's
 * current state. Tables are created WITHOUT foreign-key constraints (the app
 * works fine without DB-level FKs) to avoid drop/create ordering issues.
 *
 * - courses.instructor_id is set NULL (reassign instructors in the admin).
 * - Image paths are repointed from the old .png to the optimised .webp.
 *
 * Usage: node scripts/export-lms.js  ->  writes restore-courses.sql
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'gdcu.sqlite'), { readonly: true });
const OUT = path.join(__dirname, '..', 'restore-courses.sql');
const DBNAME = 'u514321141_gdcu';

// Create order (so populated tables read sensibly); FK constraints are omitted.
const TABLES = ['programs', 'courses', 'modules', 'lessons', 'lesson_materials', 'quizzes', 'quiz_questions', 'quiz_options'];

function mysqlType(col) {
  const t = String(col.type || '').toLowerCase();
  const hasDefault = col.dflt_value !== null && col.dflt_value !== undefined;
  if (col.pk) return 'int unsigned NOT NULL AUTO_INCREMENT';
  if (t === 'integer') return 'int';
  if (t === 'boolean') return 'tinyint(1)';
  if (t === 'datetime') return 'datetime';
  if (t === 'float' || t === 'real') return 'double';
  if (t.startsWith('decimal')) return t;
  if (t.startsWith('varchar')) return t;
  // MySQL forbids a DEFAULT on TEXT, so short defaulted "text" cols become varchar.
  if (t === 'text') return hasDefault ? 'varchar(255)' : 'text';
  return 'text';
}

function mysqlDefaultClause(col) {
  if (col.dflt_value === null || col.dflt_value === undefined) return '';
  const raw = String(col.dflt_value);
  if (raw.toUpperCase() === 'CURRENT_TIMESTAMP') return ' DEFAULT CURRENT_TIMESTAMP';
  const m = raw.match(/^'(.*)'$/);
  const val = m ? m[1] : raw;
  const t = String(col.type || '').toLowerCase();
  const numeric = t === 'integer' || t === 'boolean' || t === 'float' || t === 'real' || t.startsWith('decimal');
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
  return `CREATE TABLE \`${table}\` (\n${defs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  let s = String(v).replace(/\/img\/generated\/([A-Za-z0-9_-]+)\.png/g, '/img/generated/$1.webp');
  s = s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  return `'${s}'`;
}

const lines = [];
lines.push('-- GDCU course content restore: rebuilds content tables + loads data');
lines.push(`USE \`${DBNAME}\`;`);
lines.push('SET FOREIGN_KEY_CHECKS=0;');
lines.push('SET NAMES utf8mb4;');
lines.push('');

for (const t of [...TABLES].reverse()) lines.push(`DROP TABLE IF EXISTS \`${t}\`;`);
lines.push('');

let totalRows = 0;
for (const table of TABLES) {
  lines.push(createTableSql(table));
  lines.push('');
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  const rows = db.prepare(`SELECT * FROM "${table}"`).all();
  if (rows.length) {
    totalRows += rows.length;
    const colList = cols.map((c) => `\`${c}\``).join(', ');
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const values = batch
        .map((row) => `(${cols.map((c) => (table === 'courses' && c === 'instructor_id' ? 'NULL' : sqlValue(row[c]))).join(', ')})`)
        .join(',\n');
      lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES\n${values};`);
    }
    lines.push('');
  }
  // eslint-disable-next-line no-console
  console.log(`${table}: ${rows.length} rows`);
}

// Freeze migrations: record every migration file as already applied so the
// app's on-boot migrate.latest() finds nothing pending and never re-runs a
// step that could drop/clobber these restored tables.
const migDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
const migFiles = fs.readdirSync(migDir).filter((f) => f.endsWith('.js')).sort();
lines.push('');
lines.push('CREATE TABLE IF NOT EXISTS `knex_migrations` (`id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(255), `batch` int, `migration_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`));');
lines.push('CREATE TABLE IF NOT EXISTS `knex_migrations_lock` (`index` int unsigned NOT NULL AUTO_INCREMENT, `is_locked` int, PRIMARY KEY (`index`));');
lines.push('DELETE FROM `knex_migrations`;');
const migValues = migFiles.map((f) => `('${f}', 1, NOW())`).join(',\n');
lines.push(`INSERT INTO \`knex_migrations\` (\`name\`, \`batch\`, \`migration_time\`) VALUES\n${migValues};`);
lines.push('UPDATE `knex_migrations_lock` SET `is_locked` = 0;');
lines.push('');
// eslint-disable-next-line no-console
console.log(`knex_migrations: marking ${migFiles.length} migrations as applied`);

lines.push('SET FOREIGN_KEY_CHECKS=1;');
fs.writeFileSync(OUT, lines.join('\n'));
// eslint-disable-next-line no-console
console.log(`\nWrote rebuild + ${totalRows} rows to ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
