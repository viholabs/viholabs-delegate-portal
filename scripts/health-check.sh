#!/bin/bash
# =============================================================================
# health-check.sh — Comprueba que el portal responde
# Cron recomendado (añadir en /etc/cron.d/portal-health):
#
#   */5 * * * * root /var/www/portal/scripts/health-check.sh
# =============================================================================
set -euo pipefail

ALERT_EMAIL="lvila@viho.es"
LOG_FILE="/var/log/portal-health.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

alert() {
  echo "[$TIMESTAMP] ALERTA: $*" | tee -a "$LOG_FILE"
  echo "$*" | mail -s "PORTAL VIHOLABS — ALERTA" "$ALERT_EMAIL" 2>/dev/null || \
    echo "[$TIMESTAMP] (mail no disponible)" >> "$LOG_FILE"
}

# 1. HTTP health check
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -m 10 \
  http://127.0.0.1:3000/api/holded/ping 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" != "200" ]; then
  alert "Portal no responde (HTTP $HTTP_STATUS). Verificar PM2: pm2 list"
  exit 1
fi

# 2. PM2 process check
if ! pm2 list 2>/dev/null | grep -q "portal.*online"; then
  alert "Proceso PM2 'portal' no está online. Ejecutar: pm2 restart portal"
  exit 1
fi

# 3. Memoria del proceso
MEM=$(pm2 list 2>/dev/null | grep portal | grep -o '[0-9]*\.[0-9]* mb\|[0-9]* mb' | head -1 || echo "?")
echo "[$TIMESTAMP] OK — HTTP $HTTP_STATUS — Memoria: $MEM" >> "$LOG_FILE"
