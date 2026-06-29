/**
 * Role-scoped profile helpers. One `users` row for auth; one profile row per
 * role table. Admins reuse the staff profile table.
 */
const knex = require('../config/db');

const TABLES = {
  student: 'student_profiles',
  faculty: 'faculty_profiles',
  staff: 'staff_profiles',
  admin: 'staff_profiles',
};

// Allowed (whitelisted) columns per profile table — guards the upsert.
const FIELDS = {
  student_profiles: ['phone', 'date_of_birth', 'country', 'nationality', 'address', 'program_id', 'intake', 'year_of_study', 'student_ref', 'emergency_name', 'emergency_phone', 'bio'],
  faculty_profiles: ['title', 'phone', 'specialism', 'qualifications', 'department', 'bio', 'photo_url', 'public_profile'],
  staff_profiles: ['job_title', 'department', 'phone', 'bio'],
};

function tableFor(role) {
  return TABLES[role] || null;
}

/** Fetch a user's profile row (or {} when none/role unsupported). */
async function getProfile(role, userId) {
  const table = tableFor(role);
  if (!table || !userId) return {};
  try {
    return (await knex(table).where({ user_id: userId }).first()) || {};
  } catch {
    return {};
  }
}

/** Insert/update a user's profile from a request body (whitelisted fields). */
async function upsertProfile(role, userId, body) {
  const table = tableFor(role);
  if (!table || !userId) return;
  const allowed = FIELDS[table];
  const data = {};
  for (const key of allowed) {
    if (key === 'program_id' || key === 'year_of_study') {
      data[key] = body[key] ? Number(body[key]) : null;
    } else if (key === 'public_profile') {
      data[key] = body[key] === 'on' || body[key] === '1';
    } else {
      data[key] = (body[key] != null && String(body[key]).trim() !== '') ? String(body[key]).trim() : null;
    }
  }
  const existing = await knex(table).where({ user_id: userId }).first();
  if (existing) {
    await knex(table).where({ user_id: userId }).update({ ...data, updated_at: knex.fn.now() });
  } else {
    await knex(table).insert({ user_id: userId, ...data });
  }
}

module.exports = { tableFor, getProfile, upsertProfile, FIELDS };
