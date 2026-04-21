#!/bin/bash
# Deploy script for Viholabs Delegate Portal
# Location: /usr/local/bin/deploy-portal.sh
# Usage: deploy-portal.sh [version]

set -e

PORTAL_DIR="/var/www/portal"
INTERNAL_BEARER="${VIHOLABS_INTERNAL_BEARER:-}"

echo "========================================"
echo "DEPLOY VIHOLABS DELEGATE PORTAL"
echo "========================================"

# Step 1: Fetch latest code
echo "[1/6] Fetching latest code from main..."
cd "$PORTAL_DIR"
git fetch origin main
git reset --hard origin/main

# Step 2: Install dependencies
echo "[2/6] Installing dependencies..."
npm ci --prefer-offline

# Step 3: Build
echo "[3/6] Building production bundle..."
NODE_ENV=production npm run build

# Step 4: Reload with PM2
echo "[4/6] Reloading PM2 process..."
pm2 reload portal --update-env

# Step 5: Wait for startup
echo "[5/6] Waiting for app startup (3s)..."
sleep 3

# Step 6: Health check
echo "[6/6] Health check..."
if [ -z "$INTERNAL_BEARER" ]; then
  echo "WARNING: VIHOLABS_INTERNAL_BEARER not set, skipping auth check"
  curl -sf http://127.0.0.1:3000/api/holded/ping | jq .
else
  RESPONSE=$(curl -s -H "Authorization: Bearer $INTERNAL_BEARER" \
    http://127.0.0.1:3000/api/holded/ping)
  
  if echo "$RESPONSE" | jq -e '.ok' > /dev/null; then
    echo "✓ Portal is healthy"
    echo "$RESPONSE" | jq .
  else
    echo "✗ Health check failed!"
    echo "$RESPONSE" | jq .
    exit 1
  fi
fi

echo ""
echo "========================================"
echo "DEPLOY COMPLETE ✓"
echo "========================================"
