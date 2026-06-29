/**
 * Notification service — creates in-app notifications and optionally emails.
 * All functions are fire-and-forget safe (errors are swallowed/logged so a
 * notification failure never breaks the main request).
 */
const knex = require('../config/db');
const { sendMail, emailLayout } = require('./mailer');

/** Create an in-app notification for a single user. */
async function notifyUser(userId, { type = 'info', title, body = null, link = null }) {
  if (!userId || !title) return;
  try {
    await knex('notifications').insert({ user_id: userId, type, title, body, link });
  } catch (err) { console.error('notifyUser failed:', err.message); }
}

/** Notify every active user with one of the given roles. */
async function notifyRoles(roles, payload) {
  try {
    const ids = await knex('users').whereIn('role', roles).andWhere({ status: 'active' }).pluck('id');
    for (const id of ids) await notifyUser(id, payload);
  } catch (err) { console.error('notifyRoles failed:', err.message); }
}

/** Send a transactional email (records to outbox). */
async function email({ to, toName, subject, heading, bodyHtml, relatedType, relatedId }) {
  try {
    return await sendMail({ to, toName, subject, html: emailLayout(heading || subject, bodyHtml), relatedType, relatedId });
  } catch (err) { console.error('email failed:', err.message); return { status: 'failed' }; }
}

/** Record an audit-trail entry for a CRM record (fire-and-forget). */
async function logActivity(entityType, entityId, actor, action, detail = null) {
  try {
    await knex('activity_log').insert({
      entity_type: entityType, entity_id: entityId,
      actor_id: actor ? actor.id : null, actor_name: actor ? actor.name : null,
      action, detail,
    });
  } catch (err) { console.error('logActivity failed:', err.message); }
}

module.exports = { notifyUser, notifyRoles, email, logActivity };
