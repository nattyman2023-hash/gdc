/**
 * Authentication / authorisation guards (used in LMS & CRM phases).
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please sign in to continue.');
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session && req.session.user && roles.includes(req.session.user.role)) {
      return next();
    }
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please sign in to continue.');
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(403).render('errors/403', { pageTitle: 'Access denied' });
  };
}

module.exports = { requireAuth, requireRole };
