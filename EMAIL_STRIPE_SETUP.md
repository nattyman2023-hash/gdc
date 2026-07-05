# Email & Stripe Production Setup Guide

This guide walks you through configuring transactional email and Stripe payments for the GDCU platform.

---

## 1. Email (SMTP via Nodemailer)

The platform sends transactional emails (application confirmations, interview invites, invoice notifications, support ticket replies, announcements) via SMTP. Without configuration, emails are logged to the Email Outbox (`/admin/emails`) but not actually sent.

### Step 1: Install nodemailer

```bash
npm install nodemailer
```

### Step 2: Choose an SMTP provider

| Provider | Free tier | Notes |
|----------|-----------|-------|
| **Brevo (Sendinblue)** | 300 emails/day | Recommended — generous free tier, good deliverability |
| **Mailgun** | 5,000 emails/month (3 months) | Reliable, good API |
| **SendGrid** | 100 emails/day | Popular, easy setup |
| **Amazon SES** | 62,000 emails/month (if on EC2) | Cheapest at scale |
| **Gmail SMTP** | 500 emails/day | Only for testing — not for production |

### Step 3: Configure `.env`

Add these keys to your `.env` file:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-api-key
SMTP_PASSWORD=your-api-key
MAIL_FROM="Global Diaspora Christian University <admissions@gdcu.edu>"
```

> **Note:** For Brevo, the SMTP user and password are both your API key (not your login email). Generate an SMTP key in the Brevo dashboard.

### Step 4: Verify your sending domain

Whatever provider you choose, verify your sending domain (`gdcu.edu` or `gdc.university`) by adding the SPF, DKIM, and DMARC DNS records they provide. This is critical for email deliverability — without it, your emails will land in spam.

### Step 5: Test

1. Restart the server: `npm run dev`
2. Go to **Admin → Operations → Email Outbox** (`/admin/emails`)
3. You should see `SMTP configured: true`
4. Trigger a test email by:
   - Creating a test application and accepting it (sends a welcome email)
   - Or replying to a support ticket
5. Check the Email Outbox — the status should change from `logged` to `sent`

### Email lifecycle events already wired:

- ✅ New application → staff notification + applicant confirmation
- ✅ Application accepted → student welcome email
- ✅ Interview booked → staff notification
- ✅ Invoice created → student notification
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

### Stripe webhook not working
- Ensure `STRIPE_WEBHOOK_SECRET` is set (not `whsec_xxx`)
- Ensure the webhook URL is accessible (not behind a firewall)
- Check Stripe dashboard → Webhooks → your endpoint → see if events are being received
- The raw body parser for `/webhooks/stripe` is configured in `src/app.js`

### Payments not reflecting
- The webhook marks invoices/fees as paid when `checkout.session.completed` fires
- If the webhook isn't configured, you can manually mark invoices paid in Admin → Finance