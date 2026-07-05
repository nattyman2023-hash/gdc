# Hostinger Deployment Troubleshooting

## Why Hostinger isn't picking up your changes

**Hostinger does NOT automatically watch your GitHub repository.** Unlike platforms like Vercel, Netlify, or Render, Hostinger (shared hosting and even VPS) has no built-in GitHub integration that auto-pulls on push. Someone or something has to explicitly tell the server to fetch the new code and restart the app.

There are **three ways** to fix this, from most automatic to most manual.

---

## Option 1: GitHub Actions Auto-Deploy (RECOMMENDED — now set up)

A workflow file has been added at `.github/workflows/deploy.yml`. On every push to `master`, GitHub will SSH into your Hostinger server and run the deploy commands automatically.

### One-time setup (do this once on GitHub):

1. **Get your Hostinger SSH details:**
   - hPanel → Advanced → SSH Access
   - Note: **Host** (your server IP), **Username**, **Port** (usually `65000` on Hostinger)

2. **Generate an SSH key pair** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy"
   ```
   - Save it without a passphrase (or the action can't use it)

3. **Add the public key to Hostinger:**
   - hPanel → Advanced → SSH Access → Public Keys → Add
   - Paste the contents of `~/.ssh/id_ed25519.pub`

4. **Add the private key + details to GitHub as Secrets:**
   - Go to: https://github.com/nattyman2023-hash/gdc/settings/secrets/actions
   - Add these repository secrets:
     | Secret name | Value |
     |-------------|-------|
     | `HOSTINGER_HOST` | Your server IP (e.g. `82.180.xxx.xxx`) |
     | `HOSTINGER_USER` | Your Hostinger SSH username (e.g. `u123456789`) |
     | `HOSTINGER_SSH_KEY` | Contents of the **private** key file (`~/.ssh/id_ed25519`) |
     | `HOSTINGER_PORT` | `65000` (or your Hostinger SSH port) |
     | `HOSTINGER_APP_DIR` | Full path to app, e.g. `/home/u123456789/domains/yourdomain.com/public_html/gdcu` |

5. **Test it:** Push any commit to `master`, then watch the Actions tab:
   https://github.com/nattyman2023-hash/gdc/actions

From now on, **every push to `master` auto-deploys** — no manual steps needed.

---

## Option 2: Manual deploy (do this right now to get the current code live)

SSH into Hostinger and run:

```bash
ssh u123456789@your-server-ip -p 65000
cd ~/gdcu   # or wherever your app lives

# Pull the latest code
git fetch origin
git reset --hard origin/master

# Install dependencies
npm install --omit=dev

# Run migrations
NODE_ENV=production npm run migrate

# Restart the app
pm2 restart gdcu
# OR if not running yet:
pm2 start ecosystem.config.js --env production
pm2 save

# Verify
pm2 status
curl http://localhost:3000/health
```

---

## Option 3: Hostinger Git deployment (hPanel)

Some Hostinger plans have a "Git" tool in hPanel:

1. hPanel → Advanced → **Git**
2. Connect your GitHub repo: `https://github.com/nattyman2023-hash/gdc.git`
3. Set branch: `master`
4. Set deployment path to your app directory
5. Click **Pull / Deploy**

⚠️ **Note:** This only syncs files — it does NOT run `npm install`, migrations, or restart PM2. You'll still need to SSH in afterwards to complete the deploy (see Option 2's last 3 steps).

---

## Common reasons changes don't appear even after deploy

### 1. PM2 is running an old process
```bash
pm2 list
pm2 delete gdcu
pm2 start ecosystem.config.js --env production
pm2 save
```

### 2. Browser/CDN cache
- Hard refresh: `Ctrl + Shift + R`
- Check in an incognito window
- The `.htaccess` sets long cache headers on CSS/JS — you may need to cache-bust by appending `?v=2` to asset URLs or waiting for the 1-month expiry

### 3. Migrations didn't run
```bash
cd ~/gdcu
NODE_ENV=production npx knex migrate:latest
npx knex migrate:currentVersion   # check which version is applied
```

### 4. Wrong directory
Find where the app actually lives:
```bash
pm2 describe gdcu | grep "script path"
# or
pm2 describe gdcu | grep cwd
```

### 5. `.env` is missing or wrong on the server
```bash
cat ~/gdcu/.env   # should exist with production values
# If missing:
cp .env.example .env
nano .env   # fill in production values
```

### 6. Node version mismatch
```bash
node -v   # must be 18+
# If not, and you use nvm:
nvm install 18
nvm use 18
pm2 restart gdcu
```

### 7. The app crashed after restart
```bash
pm2 logs gdcu --lines 50
pm2 status   # look for "errored" or "stopped"
```

---

## Verify the deploy worked

```bash
# App responding?
curl http://localhost:3000/health
# Should return: {"status":"ok"}

# Running the latest commit?
cd ~/gdcu
git log --oneline -1
# Should match what you see on GitHub: https://github.com/nattyman2023-hash/gdc/commits/master

# PM2 healthy?
pm2 status
```

---

## Quick reference: the deploy flow

```
You push to GitHub master
        │
        ▼
GitHub Actions runs (.github/workflows/deploy.yml)
        │
        ▼ SSH into Hostinger
        │
        ▼ git fetch + reset --hard origin/master
        ▼ npm install --omit=dev
        ▼ npm run migrate
        ▼ pm2 restart
        │
        ▼
Site is live ✅
```

If GitHub Actions isn't set up yet, you must run Option 2 manually each time you push.