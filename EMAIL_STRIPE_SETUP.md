# Email & Stripe Production Setup Guide

This guide walks you through configuring transactional email and Stripe payments for the GDCU platform.

---

## 1. Email (Emailit API, with generic SMTP fallback)

The platform sends transactional emails (application confirmations, interview invites, invoice notifications, support ticket replies, announcements, password resets) via the [Emailit](https://emailit.com) API. Without any configuration, emails are logged to the Email Outbox (`/admin/emails`) but not actually sent.

### Step 1: Create an Emailit account and API key

1. Sign up at <https://app.emailit.com>
2. Verify your sending domain (`gdcu.edu` or `gdc.university`) by adding the SPF, DKIM and DMARC DNS records Emailit gives you — critical for deliverability, without it emails land in spam.
3. Go to **Workspace → API Keys** and create a full-access key, or a sending-scoped key restricted to that verified domain.

### Step 2: Configure `.env`

```env
MAIL_FROM="Global Diaspora Christian University <admissions@gdcu.edu>"
# Must be an address on a domain whose status is Verified in Emailit.
EMAILIT_FROM_EMAIL="Global Diaspora Christian University <admissions@gdcu.edu>"
EMAILIT_API_KEY=your-emailit-api-key
```

That's it — no extra npm packages needed, the API client uses Node's built-in `fetch`.

### Step 3 (optional): Marketing audience sync

If you also want to build a newsletter/marketing list in Emailit, create an **Audience** in the Emailit dashboard, copy its ID, and set:

```env
EMAILIT_AUDIENCE_ID=your-audience-id
```

When set, new leads, applicants and enrolled students are automatically upserted into that audience so staff can send campaigns from the Emailit dashboard without any manual list-building.

### Step 4: Test

1. Restart the server: `npm run dev`
2. Go to **Admin → Operations → Email Outbox** (`/admin/emails`)
3. Trigger a test email by:
   - Creating a test application and accepting it (sends a welcome email)
   - Using **Forgot password** on the login page
   - Or replying to a support ticket
4. Check the Email Outbox — the status should change from `logged` to `sent`

### Alternative: generic SMTP (no Emailit account)

If `EMAILIT_API_KEY` is not set, or an Emailit send fails, the platform uses plain SMTP via `nodemailer`. SMTP values may be entered in Admin → Settings or set in `.env`:

```env
SMTP_HOST=smtp.emailit.com
SMTP_PORT=587
SMTP_USER=your-smtp-credential-user
SMTP_PASSWORD=your-smtp-credential-password
```

> For Emailit SMTP, create an SMTP-type credential in the dashboard (not your login email/password). The SMTP sender must also be accepted by your SMTP provider.

### Email lifecycle events already wired:

- ✅ New application → staff notification + applicant confirmation
- ✅ Application accepted → student welcome email (with account login details)
- ✅ Forgot password → reset link email; password changed → confirmation email
- ✅ New staff/faculty/admin account created → welcome email with login details
- ✅ Admin resets a user's password → confirmation email to that user
- ✅ Interview booked → staff notification
- ✅ Invoice sent (admin clicks "Send") → student email with amount, due date and a Pay Now link
- ✅ Support ticket created/replied → both directions
- ✅ Announcements → enrolled/all students
- ✅ Assignment graded → student notification

---

## 2. Stripe (Payments)

The platform uses Stripe Checkout for three payment flows:
1. **Application fee** — paid when submitting an application
2. **Tuition invoice** — students pay invoices from their portal billing page
3. **Sponsorship contributions** — diaspora sponsorship donations

### Step 1: Get your Stripe API keys

1. Create an account at <https://dashboard.stripe.com>
2. Go to **Developers → API Keys**
3. Copy your **Publishable key** (`pk_...`) and **Secret key** (`sk_...`)

### Step 2: Configure `.env`

```env
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
APPLICATION_FEE_AMOUNT=5000
APPLICATION_FEE_CURRENCY=gbp
```

> `APPLICATION_FEE_AMOUNT` is in the smallest currency unit: `5000` = £50.00

### Step 3: Set up the webhook

1. Go to **Developers → Webhooks** in the Stripe dashboard
2. Click **Add endpoint**
3. URL: `https://yourdomain.com/webhooks/stripe`
4. Events to send: `checkout.session.completed`
5. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`

### Step 4: Test locally

```bash
# Install the Stripe CLI
# https://stripe.com/docs/stripe-cli

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/webhooks/stripe
```

### Step 5: Test the payment flows

1. **Application fee**: Submit a test application → you'll be redirected to Stripe Checkout
2. **Tuition invoice**: Admin creates an invoice → student sees "Pay Now" in `/portal/billing`
3. **Sponsorship**: Generate a sponsorship link → open it → contribute

### Without Stripe keys (local dev)

If `STRIPE_SECRET_KEY` is left as `sk_test_xxx`, the app still works:
- Applications are recorded without taking payment
- Invoices can be marked paid manually from the admin Finance page
- Sponsorship contributions are recorded directly

This is handy for local development and testing.

---

## 3. Quick checklist

- [ ] `npm install nodemailer`
- [ ] SMTP provider account created (Brevo/Mailgun/SendGrid)
- [ ] Sending domain verified (SPF + DKIM + DMARC)
- [ ] `.env` SMTP keys filled in
- [ ] Stripe account created
- [ ] `.env` Stripe keys filled in
- [ ] Stripe webhook endpoint configured
- [ ] `APPLICATION_FEE_AMOUNT` set correctly
- [ ] Test email sent and received
- [ ] Test payment completed
- [ ] Email Outbox shows `sent` status
- [ ] Finance page shows Stripe-paid invoices

---

## 4. Troubleshooting

### Emails not sending
- Check `/admin/emails` — if status is `logged`, SMTP is not configured
- Check `SMTP_HOST` is correct for your provider
- Check that `nodemailer` is installed (`npm list nodemailer`)
- Check server logs for transport errors
- If Emailit reports `Domain not verified`, verify the exact domain used by `EMAILIT_FROM_EMAIL` in Emailit, or change that setting to an address on a domain already marked Verified. This is a provider requirement and cannot be bypassed by changing the API payload.

### Stripe webhook not working
- Ensure `STRIPE_WEBHOOK_SECRET` is set (not `whsec_xxx`)
- Ensure the webhook URL is accessible (not behind a firewall)
- Check Stripe dashboard → Webhooks → your endpoint → see if events are being received
- The raw body parser for `/webhooks/stripe` is configured in `src/app.js`

### Payments not reflecting
- The webhook marks invoices/fees as paid when `checkout.session.completed` fires
- If the webhook isn't configured, you can manually mark invoices paid in Admin → Finance
