#!/bin/bash
# GDCU Production Deployment Script for Hostinger
# Run from the project root on the server after git pull

set -e

echo "=== GDCU Production Deployment ==="

# Load NVM if available (Hostinger usually has Node via NVM)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install production dependencies only
echo "Installing dependencies..."
npm install --production

# Create data directory if using SQLite
mkdir -p data

# Run database migrations
echo "Running migrations..."
NODE_ENV=production npm run migrate

# Create logs directory
mkdir -p logs

# Restart the application via PM2
echo "Starting/Restarting application..."
if command -v pm2 &> /dev/null; then
  pm2 startOrRestart ecosystem.config.js --env production
  pm2 save
else
  echo "WARNING: PM2 not installed. Installing..."
  npm install -g pm2
  pm2 start ecosystem.config.js --env production
  pm2 save
fi

echo ""
echo "=== Deployment complete! ==="
echo "Application should be running at \$APP_URL"
echo "Run 'pm2 status' to verify"
