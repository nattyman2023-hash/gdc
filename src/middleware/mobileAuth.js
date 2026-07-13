const crypto = require('crypto');
const knex = require('../config/db');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function mobileError(res, status, message) {
  return res.status(status).json({ error: { code: status === 401 ? 'unauthorized' : 'request_failed', message } });
}

async function requireMobileAuth(req, res, next) {
  try {
    const rawToken = bearerToken(req);
    if (!rawToken) return mobileError(res, 401, 'A mobile access token is required.');

    const token = await knex('mobile_tokens')
      .join('users', 'users.id', 'mobile_tokens.user_id')
      .where('mobile_tokens.token_hash', hashToken(rawToken))
      .whereNull('mobile_tokens.revoked_at')
      .where('users.status', 'active')
      .where('users.role', 'student')
      .select(
        'mobile_tokens.id as token_id',
        'mobile_tokens.expires_at',
        'users.id',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.role'
      )
      .first();

    if (!token || !token.expires_at || new Date(token.expires_at) <= new Date()) {
      return mobileError(res, 401, 'This mobile access token is invalid or has expired.');
    }

    req.mobileTokenId = token.token_id;
    req.mobileUser = {
      id: token.id,
      first_name: token.first_name,
      last_name: token.last_name,
      email: token.email,
      role: token.role,
    };

    // Do not make the app wait for analytics-style token activity updates.
    knex('mobile_tokens').where({ id: token.token_id }).update({ last_used_at: knex.fn.now() }).catch(() => {});
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { hashToken, bearerToken, requireMobileAuth };
