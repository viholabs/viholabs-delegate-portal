#!/bin/bash
# =============================================================================
# deploy.sh — Deploy del portal en VPS
# Uso: bash /var/www/portal/scripts/deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="/var/www/portal"
LOG_FILE="/var/log/pm2/portal-deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() { echo "[$TIMESTAMP] $*" | tee -a "$LOG_FILE"; }

log "=== DEPLOY INICIADO ==="
cd "$APP_DIR"

# 1. Código
log "Git pull..."
git fetch origin main
git reset --hard origin/main
log "Commit: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# 2. Dependencias
log "Instalando dependencias..."
npm ci --prefer-offline --silent
log "Dependencias OK"

# 3. Build
log "Building..."
NODE_ENV=production npm run build
log "Build OK"

# 4. Restart PM2 (graceful reload — sin downtime)
log "Reiniciando PM2..."
pm2 reload portal --update-env
log "PM2 OK"

# 5. Verificación
sleep 3
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -m 10 http://127.0.0.1:3000/api/holded/ping || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  log "Health check OK (HTTP $HTTP_STATUS)"
else
  log "ALERTA: Health check devolvió HTTP $HTTP_STATUS"
  log "Logs PM2 recientes:"
  pm2 logs portal --lines 20 --nostream >> "$LOG_FILE" 2>&1
  exit 1
fi

log "=== DEPLOY COMPLETADO ==="
