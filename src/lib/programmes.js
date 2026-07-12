/**
 * Programme-level access rules: application requirements for degree-level
 * programmes (bachelor/master/doctor), tuition invoicing, and the payment
 * gate that unlocks course content.
 */
const knex = require('../config/db');
const { makeReference } = require('./helpers');

// Ordinal ranking of course.category, low to high. A student who already
// holds an enrollment at or below a target level is presumed to have already
// cleared that level's entry requirements, so they can self-enrol into
// another programme at that level (or below) without re-applying.
const LEVEL_RANK = { certificate: 0, diploma: 1, bachelor: 2, master: 3, doctor: 4 };

// Levels that require an application (+ fee, + admin acceptance) rather than
// instant self-enrolment. Certificate/diploma stay open, as before.
const APPLICATION_REQUIRED_LEVELS = new Set(['bachelor', 'master', 'doctor']);

function rankOf(category) {
  return Object.prototype.hasOwnProperty.call(LEVEL_RANK, category) ? LEVEL_RANK[category] : -1;
}

function requiresApplication(category) {
  return APPLICATION_REQUIRED_LEVELS.has(category);
}

/**
 * Does this student already hold a qualifying enrollment for `targetCategory`
 * — i.e. any existing enrollment whose course category ranks at or below it?
 * If so, they've already cleared that level's (or a higher one's) entry
 * requirements and may self-enrol directly instead of applying again.
 */
async function hasQualifyingLevel(userId, targetCategory) {
  const targetRank = rankOf(targetCategory);
  if (targetRank < 0) return true; // Unknown/unranked category — don't block.
  const categories = await knex('enrollments')
    .join('courses', 'enrollments.course_id', 'courses.id')
    .where('enrollments.user_id', userId)
    .pluck('courses.category');
  return categories.some((c) => rankOf(c) >= 0 && rankOf(c) <= targetRank);
}

/**
 * Ensure a tuition invoice exists for this student + programme, creating one
 * (for the programme's full tuition amount) if none exists yet. Returns null
 * if the programme has no tuition set (treated as free — always unlocked).
 */
async function ensureTuitionInvoice(programId, userId, createdBy) {
  if (!programId) return null;
  const program = await knex('programs').where({ id: programId }).first();
  if (!program || !program.tuition || Number(program.tuition) <= 0) return null;

  const existing = await knex('invoices').where({ user_id: userId, program_id: programId }).first();
  if (existing) return existing;

  const [id] = await knex('invoices').insert({
    reference: makeReference('INV'),
    user_id: userId,
    program_id: programId,
    description: `Tuition — ${program.title}`,
    amount: program.tuition,
    currency: program.tuition_currency || 'GBP',
    status: 'sent',
    created_by: createdBy || null,
  });
  return knex('invoices').where({ id: Array.isArray(id) ? id[0] : id }).first();
}

/**
 * Has this student made at least one payment toward this programme's tuition?
 * A programme with no tuition set is treated as free (always unlocked).
 * Payment plans are separate invoice rows (installment_no/installment_total),
 * so "at least one paid invoice for this programme" is the unlock condition
 * — not full settlement of every instalment.
 */
async function hasPaidTuition(userId, programId) {
  if (!programId) return true;
  const program = await knex('programs').where({ id: programId }).first();
  if (!program || !program.tuition || Number(program.tuition) <= 0) return true;
  const paid = await knex('invoices').where({ user_id: userId, program_id: programId, status: 'paid' }).first();
  return Boolean(paid);
}

module.exports = {
  LEVEL_RANK,
  rankOf,
  requiresApplication,
  hasQualifyingLevel,
  ensureTuitionInvoice,
  hasPaidTuition,
};
