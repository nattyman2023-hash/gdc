/**
 * Maintenance mode middleware.
 * When MAINTENANCE_MODE=true in .env, the site shows a maintenance page
 * to non-admin users. Admins can still browse to verify functionality.
 */
module.exports = function maintenance(req, res, next) {
  if (process.env.MAINTENANCE_MODE !== 'true') return next();

  // Allow health checks through
  if (req.path === '/health') return next();

  // Allow admins through
  if (req.session.user && ['admin', 'staff', 'faculty'].includes(req.session.user.role)) {
    return next();
  }

  // Allow login (so admins can sign in)
  if (req.path === '/login' || req.path === '/auth/login') return next();

  res.status(503).render('errors/maintenance', {
    pageTitle: 'Under Maintenance | GDCU',
    layout: 'layouts/base',
  });
};
