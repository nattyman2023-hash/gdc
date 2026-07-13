/**
 * Transactional email. Records every message in `email_log`.
 * Sends via the Emailit API when EMAILIT_API_KEY is set; otherwise falls back
 * to generic SMTP (nodemailer, e.g. Emailit's own SMTP relay or any other
 * provider); otherwise logs only (dev-safe). nodemailer is loaded lazily so
 * it's optional — the app runs without it.
 */
const knex = require('../config/db');
const emailit = require('./emailit');

let transporter = null;
let transportSignature = null;

function senderDomain(from) {
  const value = String(from || '');
  const address = (value.match(/<([^>]+)>/) || [null, value])[1];
  return address && address.includes('@') ? address.split('@').pop().trim().toLowerCase() : 'invalid';
}

function getTransport(config) {
  const host = config.smtpHost;
  const signature = [host, config.smtpPort, config.smtpUser, config.smtpPassword].join('\u0000');
  if (transportSignature === signature) return transporter;
  transportSignature = signature;
  transporter = null;
  if (!host) return null;
  try {
    // eslint-disable-next-line global-require
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    });
  } catch (err) {
    // nodemailer not installed — fall back to logging.
    transporter = null;
  }
  return transporter;
}

/**
 * Send (or log) an email and record it in email_log.
 * @returns {Promise<{status:string}>}
 */
async function sendMail({ to, toName, subject, html, template, relatedType, relatedId }) {
  if (!to) return { status: 'failed' };
  const base = {
    to_email: to, to_name: toName || null, subject,
    body: html || null, template: template || null,
    related_type: relatedType || null, related_id: relatedId || null,
  };
  const recipient = toName ? `"${toName}" <${to}>` : to;
  const config = await emailit.getMailConfig();
  let emailitError = null;

  if (config.emailitConfigured) {
    try {
      // Emailit's "to" is a plain address, not the "Name <email>" form
      // nodemailer/SMTP accepts — send the raw address here.
      await emailit.sendEmail({ from: config.fromEmail, to, subject, html });
      await knex('email_log').insert({ ...base, status: 'sent' });
      return { status: 'sent', provider: 'emailit' };
    } catch (err) {
      // Include the effective domain in the outbox error. This makes a
      // verified-domain mismatch visible without ever logging the API key.
      emailitError = new Error(`${err.message} [sender domain: ${senderDomain(config.fromEmail)}]`);
    }
  }

  // Emailit can be configured while its sending domain is pending verification
  // or temporarily unavailable. If SMTP is configured, use it as a real
  // fallback instead of returning a failed delivery immediately.
  const t = getTransport(config);
  let smtpError = null;
  if (t) {
    try {
      await t.sendMail({ from: config.smtpFrom, to: recipient, subject, html });
      await knex('email_log').insert({ ...base, status: 'sent' });
      return { status: 'sent', provider: 'smtp' };
    } catch (err) {
      smtpError = err;
    }
  }

  if (!t) {
    if (emailitError) {
      await knex('email_log').insert({ ...base, status: 'failed', error: String(emailitError.message).slice(0, 250) });
      return { status: 'failed' };
    }
    await knex('email_log').insert({ ...base, status: 'logged' });
    return { status: 'logged' };
  }

  const errors = [emailitError && `Emailit: ${emailitError.message}`, smtpError && `SMTP: ${smtpError.message}`]
    .filter(Boolean)
    .join('; ');
  await knex('email_log').insert({ ...base, status: 'failed', error: errors.slice(0, 250) });
  return { status: 'failed' };
}

/** Wrap content in a simple branded HTML email shell. */
function emailLayout(heading, bodyHtml) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1c1c18">
    <div style="background:#071d3a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <strong style="font-size:18px">Global Diaspora Christian University</strong>
    </div>
    <div style="border:1px solid #e5e2dc;border-top:none;padding:24px;border-radius:0 0 8px 8px">
      <h2 style="color:#071d3a;margin-top:0">${heading}</h2>
      ${bodyHtml}
      <p style="color:#74777e;font-size:12px;margin-top:24px">Educate · Equip · Empower · Impact the World</p>
    </div>
  </div>`;
}

module.exports = { sendMail, emailLayout };
