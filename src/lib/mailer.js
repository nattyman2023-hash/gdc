/**
 * Transactional email. Records every message in `email_log`.
 * Sends via SMTP (nodemailer) when configured; otherwise logs only (dev-safe).
 * nodemailer is loaded lazily so it's optional — the app runs without it.
 */
const knex = require('../config/db');

let transporter = null;
let triedInit = false;

function getTransport() {
  if (triedInit) return transporter;
  triedInit = true;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  try {
    // eslint-disable-next-line global-require
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
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
  const t = getTransport();
  const base = {
    to_email: to, to_name: toName || null, subject,
    body: html || null, template: template || null,
    related_type: relatedType || null, related_id: relatedId || null,
  };

  if (!t) {
    await knex('email_log').insert({ ...base, status: 'logged' });
    return { status: 'logged' };
  }
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || 'GDCU <no-reply@gdcu.edu>',
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      html,
    });
    await knex('email_log').insert({ ...base, status: 'sent' });
    return { status: 'sent' };
  } catch (err) {
    await knex('email_log').insert({ ...base, status: 'failed', error: String(err.message).slice(0, 250) });
    return { status: 'failed' };
  }
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
