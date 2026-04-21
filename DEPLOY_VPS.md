# VIHOLABS DELEGATE PORTAL — DEPLOYMENT INSTRUCTIONS

## CRITICAL AUTH FIX

**Issue:** Cookies not reaching browser on VPS after login
**Root Cause:** `NextResponse.redirect()` was being called before `response.cookies.set()`, causing headers to be lost
**Solution:** Changed auth callback to use `NextResponse.next()` + manual redirect, ensuring cookies are set before redirect

## PREREQUISITES

- Ubuntu 22.04 LTS or similar
- Node.js 20+ installed
- Nginx reverse proxy configured
- SSL certificate (Let's Encrypt recommended)
- Firewall configured (ufw or equivalent)

## STEP 1: PREPARE VPS ENVIRONMENT

```bash
# 1. Create app directory
sudo mkdir -p /var/www/portal
sudo chown $USER:$USER /var/www/portal

# 2. Create log directories
sudo mkdir -p /var/log/pm2 /var/log/nginx
sudo chown nobody:adm /var/log/pm2
sudo chown www-data:www-data /var/log/nginx

# 3. Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Install PM2 globally
sudo npm install -g pm2

# 5. Enable PM2 startup
pm2 startup systemd -u $USER --hp /home/$USER
# Copy and execute the output command shown by PM2
```

## STEP 2: CLONE AND BUILD

```bash
# 1. Clone repository
cd /var/www/portal
git clone https://github.com/viholabs/viholabs-delegate-portal.git .

# 2. Install dependencies (use npm, not pnpm)
npm ci --prefer-offline

# 3. Build production bundle
NODE_ENV=production npm run build

# 4. Verify build success
ls -la .next/
```

## STEP 3: CONFIGURE ENVIRONMENT

```bash
# 1. Create .env file from template
sudo cp .env.production .env

# 2. Edit with production values
sudo nano .env

# Make sure these are set:
# - NEXT_PUBLIC_SUPABASE_URL (no https:// prefix duplicates)
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_URL (both forms required for SEPA endpoint)
# - SUPABASE_SERVICE_ROLE_KEY
# - APP_BASE_URL=https://portal.viholabs.com
# - NEXT_PUBLIC_SITE_URL=https://portal.viholabs.com
# - All other secrets (Holded, SMTP, Shopify)

# 3. Secure permissions
sudo chmod 600 .env
```

## STEP 4: CONFIGURE NGINX

```bash
# 1. Copy Nginx config
sudo cp nginx.conf.vps /etc/nginx/sites-available/portal.viholabs.com

# 2. Enable site
sudo ln -sf /etc/nginx/sites-available/portal.viholabs.com \
  /etc/nginx/sites-enabled/portal.viholabs.com

# 3. Remove default site (optional)
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Test config
sudo nginx -t

# 5. Reload Nginx
sudo systemctl reload nginx
```

## STEP 5: CONFIGURE FIREWALL

```bash
# 1. Enable UFW
sudo ufw enable

# 2. Allow SSH, HTTP, HTTPS only
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 3. Deny direct Next.js access
sudo ufw deny 3000/tcp

# 4. Verify rules
sudo ufw status
```

## STEP 6: START APPLICATION WITH PM2

```bash
# 1. Start the app
cd /var/www/portal
pm2 start ecosystem.config.js

# 2. Verify it's running
pm2 status
pm2 logs portal

# 3. Save PM2 config to persist on reboot
pm2 save
pm2 startup

# Copy and execute the command that PM2 shows
```

## STEP 7: VERIFY DEPLOYMENT

```bash
# 1. Health check (no auth)
curl -sf https://portal.viholabs.com/api/holded/ping | jq .
# Expected: { "ok": true }

# 2. Verify HTTPS redirect
curl -sv http://portal.viholabs.com 2>&1 | grep Location
# Expected: https://portal.viholabs.com

# 3. Check that login page loads
curl -sf https://portal.viholabs.com/login | head -20

# 4. Verify auth internal bearer works (after setting VIHOLABS_INTERNAL_BEARER)
curl -s -H "Authorization: Bearer <INTERNAL_BEARER>" \
  https://portal.viholabs.com/api/holded/poll | jq .

# 5. TEST LOGIN VIA BROWSER
# - Go to https://portal.viholabs.com/login
# - Enter test credentials
# - Check browser DevTools → Application → Cookies
# - Verify supabase-auth-token and other session cookies appear
```

## STEP 8: CONFIGURE SUPABASE

In Supabase Dashboard (https://supabase.com):

1. Go to Project Settings → Authentication
2. Add to Site URLs:
   ```
   https://portal.viholabs.com
   ```
3. Add to Redirect URLs:
   ```
   https://portal.viholabs.com/auth/callback
   ```
4. Save

## STEP 9: CONFIGURE SCHEDULED TASKS

```bash
# 1. Create cron jobs file
sudo tee /etc/cron.d/portal-jobs > /dev/null <<EOF
# Holded sync daily at 02:00 and 14:00 UTC
0 2,14 * * * curl -sf -X POST http://127.0.0.1:3000/api/holded/invoices/import-incremental \
  -H "Content-Type: application/json" \
  -d "{\"month\": \"\$(date +%Y-%m)\", \"preview\": false}" \
  >> /var/log/holded-sync.log 2>&1

# Sync previous month on 1st of month at 03:00 UTC
0 3 1 * * curl -sf -X POST http://127.0.0.1:3000/api/holded/invoices/import-incremental \
  -H "Content-Type: application/json" \
  -d "{\"month\": \"\$(date -d '1 month ago' +%Y-%m)\", \"preview\": false}" \
  >> /var/log/holded-sync.log 2>&1

# Portal health check every 5 minutes
*/5 * * * * curl -sf -H "Authorization: Bearer <INTERNAL_BEARER>" \
  http://127.0.0.1:3000/api/holded/ping >> /dev/null 2>&1 || \
  (echo "[$(date)] PORTAL DOWN" | mail -s "ALERT: Portal Down" lvila@viho.es)
EOF

# 2. Set proper permissions
sudo chmod 644 /etc/cron.d/portal-jobs
```

## STEP 10: LOG ROTATION

```bash
# Create log rotation config
sudo tee /etc/logrotate.d/portal > /dev/null <<EOF
/var/log/pm2/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    postrotate
        pm2 flush
    endscript
}

/var/log/holded-sync.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
}

/var/log/nginx/portal.viholabs.com*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 $(cat /var/run/nginx.pid)
        fi
    endscript
}
EOF
```

## STEP 11: CONFIGURE MONITORING

```bash
# 1. Install UptimeRobot (free tier)
# - Create account at https://uptimerobot.com
# - Add monitor for: https://portal.viholabs.com/api/holded/ping
# - Set frequency to 5 minutes
# - Enable alerts

# 2. Install PM2 Plus (free tier, optional)
pm2 install pm2-auto-pull
pm2 install pm2-logrotate
pm2 save
```

## STEP 12: BACKUP DATABASE

```bash
# Create backup directory
sudo mkdir -p /var/backups/supabase
sudo chown $USER:$USER /var/backups/supabase

# Create backup script
sudo tee /usr/local/bin/backup-supabase.sh > /dev/null <<'EOF'
#!/bin/bash
DB_URL="postgresql://postgres.<ref>:<pass>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
BACKUP_DIR="/var/backups/supabase"
DATE=$(date +%Y%m%d_%H%M%S)

pg_dump "$DB_URL" -Fc -f "$BACKUP_DIR/portal-$DATE.dump"
echo "Backup completed: $BACKUP_DIR/portal-$DATE.dump"

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.dump" -mtime +30 -delete
EOF

sudo chmod +x /usr/local/bin/backup-supabase.sh

# Schedule daily backup at 03:00 UTC
echo "0 3 * * * /usr/local/bin/backup-supabase.sh >> /var/log/backup.log 2>&1" | sudo tee -a /etc/cron.d/portal-jobs
```

## DEPLOY UPDATES

To deploy new code:

```bash
# Method 1: Manual
cd /var/www/portal
git fetch origin main
git reset --hard origin/main
npm ci --prefer-offline
NODE_ENV=production npm run build
pm2 reload portal --update-env

# Method 2: Using deploy script (if set up)
/usr/local/bin/deploy-portal.sh
```

## TROUBLESHOOTING

### Cookies still not appearing

1. Check if Nginx is passing headers:
   ```bash
   curl -vv https://portal.viholabs.com/auth/callback 2>&1 | grep -i set-cookie
   ```

2. Check browser CORS/SameSite policies in DevTools Console

3. Verify auth callback logs:
   ```bash
   pm2 logs portal | grep AUTH
   ```

### Login redirects to login again

1. Check if session was created:
   ```bash
   curl -s -b "cookies.txt" -c "cookies.txt" \
     https://portal.viholabs.com/api/auth/whoami | jq .
   ```

2. Verify Supabase credentials in .env

3. Check Supabase Dashboard → Authentication → Users

### High CPU usage

1. Check if jobs are running:
   ```bash
   pm2 monit
   ```

2. Review PM2 logs for errors:
   ```bash
   pm2 logs portal --err
   ```

## ROLLBACK

If something breaks:

```bash
# 1. Stop the app
pm2 stop portal

# 2. Revert to previous commit
cd /var/www/portal
git log --oneline -5
git reset --hard <previous-commit-hash>

# 3. Rebuild
npm ci --prefer-offline
NODE_ENV=production npm run build

# 4. Restart
pm2 restart portal
```

## NEXT STEPS

1. Configure Bixgrow webhook: set webhook URL in Bixgrow dashboard to `https://portal.viholabs.com/api/webhooks/bixgrow`
2. Test Holded sync with: `curl -s -H "Authorization: Bearer <INTERNAL_BEARER>" -X POST https://portal.viholabs.com/api/holded/incremental -H "Content-Type: application/json" -d '{"month":"2026-04","preview":true}'`
3. Verify SQL functions exist in Supabase (see PHASE 3 of deployment plan)
4. Monitor logs for first week of operation
