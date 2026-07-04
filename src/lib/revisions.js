/**
 * Version history for course-builder content (modules, lessons, quizzes,
 * assignments). Call snapshot() with the row's state right before a mutating
 * write, so there's always something to restore.
 */
const knex = require('../config/db');

// Never let a version-history write block the real edit/delete it's guarding —
// e.g. if the table hasn't reached production yet on a given deploy. Errors
// are logged, not thrown.
async function snapshot({ entityType, entityId, courseId, action, actorId, data }) {
  try {
    await knex('content_revisions').insert({
      entity_type: entityType,
      entity_id: entityId,
      course_id: courseId || null,
      action,
      snapshot_json: JSON.stringify(data),
      actor_user_id: actorId || null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`revisions.snapshot failed (${entityType} #${entityId}, ${action}):`, err.message);
  }
}

module.exports = { snapshot };
