# GDCU - Production Deployment Guide for Hostinger

## Prerequisites
- Node.js 18+ installed on Hostinger shared hosting
- NPM access
- PM2 process manager (installed globally)
- Git access to your repository

## Step 1: Upload Files

### Option A: Git (Recommended)
```bash
# SSH into your Hostinger account
ssh user@yourdomain.com

# Clone the repository
git clone https://github.com/your-org/gdcu.git ~/gdcu
cd ~/gdcu

# Run deployment script
bash scripts/deploy.sh
```

### Option B: Manual Upload
1. Zip the project (excluding `node_modules/`, `.env`, `data/`, `logs/`)
2. Upload via Hostinger File Manager or FTP to `~/gdcu/`
3. SSH in and run: `cp .env.example .env` then edit `.env`
4. Run: `npm install --production` then `bash scripts/deploy.sh`

## Step 2: Environment Configuration

Edit `.env` file with your production values:

```
NODE_ENV=production
PORT=3000
APP_URL=https://yourdomain.com
SESSION_SECRET=<generate a random 64-char string>

# Database - USE MYSQL FOR PRODUCTION
DB_CLIENT=mysql2
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=gdcu_user
MYSQL_PASSWORD=<strong password>
MYSQL_DATABASE=gdcu_prod

# Stripe (payment processing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=your@email.com
SMTP_PASSWORD=<email password>
MAIL_FROM=no-reply@yourdomain.com
```

## Step 3: Setup Hostinger

### 3a. Create MySQL Database
1. Go to Hostinger hPanel → MySQL Databases
2. Create a new database and user
3. Import the schema: `mysql -u gdcu_user -p gdcu_prod < schema.sql`

### 3b. Configure Domain / Subdomain
1. Create a subdomain (e.g., `lms.yourdomain.com`) or use main domain
2. Point it to the `public_html` or create a Node.js app

### 3c. Setup Reverse Proxy (Hostinger Node.js)
1. Go to Hostinger hPanel → Advanced → Node.js Selector
2. Select your domain
3. Set application path: `/home/u123456/gdcu`
4. Set entry point: `src/server.js`
5. Click "Create"

Or if using Apache:
1. Upload the `.htaccess` file to your domain's document root
2. Ensure `mod_proxy` and `mod_rewrite` are enabled

## Step 4: Run Migrations

```bash
cd ~/gdcu
NODE_ENV=production npx knex migrate:latest
```

## Step 5: Start Application

```bash
# Using PM2 (recommended)
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Verify
pm2 status
curl http://localhost:3000/health
```

## Step 6: Verify HTTPS & Security

- [ ] HTTPS is enforced (auto-redirect from HTTP)
- [ ] Domain shows padlock in browser
- [ ] `/health` returns `{"status":"ok"}`
- [ ] Admin panel accessible and secure

## Step 7: Setup Cron Jobs

Add these to Hostinger cron (hPanel → Advanced → Cron Jobs):

```bash
# Daily database backup at 3 AM
0 3 * * * /home/u123456/gdcu/scripts/backup-db.sh

# Weekly sitemap regeneration
0 5 * * 0 cd /home/u123456/gdcu && node scripts/generate-sitemap.js
```

## Step 8: Post-Deployment Checklist

- [ ] Test student login and course access
- [ ] Test admin panel
- [ ] Test Stripe payments (use test mode first)
- [ ] Test email notifications
- [ ] Verify sitemap at `https://yourdomain.com/sitemap.xml`
- [ ] Submit sitemap to Google Search Console
- [ ] Test all forms (application, contact, support)
- [ ] Run Lighthouse audit for performance
- [ ] Test on mobile devices

## Troubleshooting

**App won't start:**
```bash
# Check logs
pm2 logs gdcu
cat logs/error.log
# Check Node version
node -v
```

**500 Error:**
- Check `.env` values
- Verify database connection
- Run `npm install --production` again

**Static assets not loading:**
- Check `.htaccess` is in the correct directory
- Verify `public/` folder contains assets

**Emails not sending:**
- Verify SMTP settings in `.env`
- Hostinger may block port 25; try 465 (SSL) or 587 (TLS)

## Maintenance

```bash
# Update application
git pull origin main
npm install --production
npm run migrate
pm2 restart gdcu

# View logs
pm2 logs gdcu

# Monitor
pm2 monit
```
