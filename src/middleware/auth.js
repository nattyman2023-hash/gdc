/**
 * Authentication / authorisation guards including role-based access control.
 *
 * Roles (hierarchical):
 *   superadmin     → full access, can manage admins
 *   admin          → most admin functions except user management
 *   admissions_officer → manage applications only
 *   finance_officer    → view payments, not edit content
 *   faculty_manager    → manage faculty/staff profiles
 *   content_manager    → manage pages, content, settings
 *   support_staff      → tickets, basic support
 *
 * The `superadmin` role automatically passes ALL permission checks.
 */

const knex = require('../config/db');

/** Simple login check. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please sign in to continue.');
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

/** Restrict by role name(s) — basic role gate. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session && req.session.user && (roles.includes(req.session.user.role) || req.session.user.role === 'superadmin')) {
      return next();
    }
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please sign in to continue.');
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(403).render('errors/403', { pageTitle: 'Access denied' });
  };
}

/**
 * Require a specific permission for the current user.
 * Superadmin bypasses all permission checks.
 *
 * Built-in permission map:
 *   manage_admins       → superadmin only
 *   manage_applications → superadmin, admin, admissions_officer
 *   manage_payments     → superadmin, admin, finance_officer
 *   manage_faculty      → superadmin, admin, faculty_manager
 *   manage_content      → superadmin, admin, content_manager
 *   manage_settings     → superadmin, admin
 *   view_reports        → superadmin, admin, finance_officer
 *   manage_support      → all staff roles
 */
const PERMISSION_ROLES = {
  manage_admins: ['superadmin'],
  manage_applications: ['superadmin', 'admin', 'admissions_officer'],
  manage_payments: ['superadmin', 'admin', 'finance_officer'],
  manage_faculty: ['superadmin', 'admin', 'faculty_manager'],
  manage_content: ['superadmin', 'admin', 'content_manager'],
  manage_settings: ['superadmin', 'admin'],
  view_reports: ['superadmin', 'admin', 'finance_officer'],
  manage_support: ['superadmin', 'admin', 'admissions_officer', 'support_staff'],
};

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Please sign in to continue.');
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    const userRole = req.session.user.role;

    // Superadmin bypasses all
    if (userRole === 'superadmin') return next();

    const allowed = PERMISSION_ROLES[permission];
    if (allowed && allowed.includes(userRole)) return next();

    return res.status(403).render('errors/403', { pageTitle: 'Access denied' });
  };
}

/**
 * Middleware to add permission check helpers to templates.
 * Usage in EJS: if (can('manage_admins')) { ... }
 */
async function permissionLocals(req, res, next) {
  if (req.session && req.session.user) {
    const role = req.session.user.role;
    res.locals.can = (permission) => {
      if (role === 'superadmin') return true;
      const allowed = PERMISSION_ROLES[permission];
      return allowed ? allowed.includes(role) : false;
    };
    res.locals.isSuperadmin = role === 'superadmin';
    res.locals.userRole = role;
  } else {
    res.locals.can = () => false;
    res.locals.isSuperadmin = false;
    res.locals.userRole = null;
  }
  next();
}

module.exports = { requireAuth, requireRole, requirePermission, permissionLocals };
