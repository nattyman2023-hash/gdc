/**
 * Seed: a default admin account so the future CRM/admin can be accessed.
 * Change the password immediately after first login in production.
 */
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  await knex('users').del();

  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!2026';
  const hash = await bcrypt.hash(password, 12);
  const staffHash = await bcrypt.hash('Staff!2026', 12);

  await knex('users').insert([
    {
      first_name: 'GDCU',
      last_name: 'Administrator',
      email: process.env.SEED_ADMIN_EMAIL || 'admin@gdc.university',
      password_hash: hash,
      role: 'admin',
      status: 'active',
    },
    {
      first_name: 'Grace',
      last_name: 'Admissions',
      email: 'staff@gdcu.edu',
      password_hash: staffHash,
      role: 'staff',
      status: 'active',
    },
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `\n  Seeded admin: ${process.env.SEED_ADMIN_EMAIL || 'admin@gdc.university'} / ${password}` +
    `\n  Seeded staff: staff@gdcu.edu / Staff!2026\n`
  );
};
