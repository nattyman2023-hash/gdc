/**
 * Shared "an application was just submitted" flow — staff notification,
 * applicant confirmation email, marketing sync, and the application-fee
 * payment step (Stripe checkout if configured, otherwise recorded directly).
 * Used by both the public Apply Now form and the in-portal application form,
 * so the two stay in sync rather than drifting apart.
 */
const knex = require('../config/db');
const { getStripe } = require('./stripe');
const { notifyRoles, email } = require('./notify');
const emailit = require('./emailit');

function withRefParam(url, reference, extra) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}ref=${encodeURIComponent(reference)}${extra || ''}`;
}

/**
 * @param {object} application - the inserted applications row (id, reference, program_id, first_name, last_name, email)
 * @param {string} successUrl - absolute URL to redirect to on success (ref is appended automatically)
 * @param {string} cancelUrl - absolute URL if the applicant cancels Stripe checkout
 * @param {object} req - for req.flash on the no-Stripe path
 * @param {object} res - to issue the redirect
 * @param {string[]} [tags] - emailit contact tags (defaults to ['applicant'])
 */
async function afterApplicationSubmitted({ application, successUrl, cancelUrl, req, res, tags }) {
  const { id: applicationId, reference, first_name, last_name, email: applicantEmail } = application;

  notifyRoles(['admin', 'staff'], {
    type: 'application', title: 'New application received',
    body: `${first_name} ${last_name} — ${reference}`,
    link: `/admin/applications/${applicationId}`,
  });
  email({
    to: applicantEmail, toName: `${first_name} ${last_name}`,
    subject: `We've received your application (${reference})`,
    heading: 'Thank you for applying to GDCU',
    bodyHtml: `<p>Dear ${first_name},</p><p>We have received your application <strong>${reference}</strong> and our admissions team will be in touch shortly.</p><p>You can reply to this email if you have any questions.</p>`,
    relatedType: 'application', relatedId: applicationId,
  });
  emailit.upsertContact({ email: applicantEmail, firstName: first_name, lastName: last_name, tags: tags || ['applicant'] }).catch(() => {});

  const { stripe, isConfigured } = await getStripe();
  if (isConfigured) {
    const amount = Number(process.env.APPLICATION_FEE_AMOUNT || 5000);
    const currency = (process.env.APPLICATION_FEE_CURRENCY || 'gbp').toLowerCase();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: applicantEmail,
      line_items: [{
        price_data: {
          currency,
          product_data: { name: 'GDCU Application Fee', description: `Application ${reference}` },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      metadata: { kind: 'application_fee', application_id: String(applicationId), reference },
      success_url: withRefParam(successUrl, reference, '&session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: withRefParam(cancelUrl, reference),
    });
    await knex('application_fees').insert({
      application_id: applicationId, amount, currency, provider: 'stripe', stripe_session_id: checkout.id, status: 'pending',
    });
    return res.redirect(303, checkout.url);
  }

  req.flash('success', `Your application (ref ${reference}) has been received. Our admissions team will be in touch shortly.`);
  return res.redirect(withRefParam(successUrl, reference));
}

module.exports = { afterApplicationSubmitted };
