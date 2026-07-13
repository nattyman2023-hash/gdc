/**
 * Injects values used by every view: flash messages, current user,
 * the active nav path, current year, and Stripe publishable key.
 */
const knex = require('../config/db');

module.exports = async function locals(req, res, next) {
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info'),
  };
  res.locals.currentUser = req.session.user || null;

  // In-app notifications for the signed-in user (used by header bells).
  res.locals.unreadCount = 0;
  res.locals.recentNotifications = [];
  if (req.session.user) {
    try {
      const row = await knex('notifications').where({ user_id: req.session.user.id, read: false }).count({ c: '*' }).first();
      res.locals.unreadCount = Number(row.c);
      res.locals.recentNotifications = await knex('notifications')
        .where({ user_id: req.session.user.id })
        .orderBy('created_at', 'desc')
        .limit(8);
    } catch (err) { /* notifications table may not exist yet during setup */ }
  }
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();
  res.locals.siteCompany = {
    legalName: 'Global Diaspora Christian University LLC',
    displayName: 'Global Diaspora Christian University',
    addressLine1: '7901 4th St N, Suite 300',
    addressLine2: 'St. Petersburg, FL 33702, USA',
    companyNumber: 'L26000360887',
  };
  res.locals.stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  res.locals.appUrl = process.env.APP_URL || '';
  // Default page meta — individual routes override these.
  res.locals.pageTitle = 'Global Diaspora Christian University';
  res.locals.metaDescription =
    'Global Diaspora Christian University — an online, faith-based university. Educate. Equip. Empower. Impact the world.';
  next();
};
