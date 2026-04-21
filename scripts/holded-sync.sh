#!/bin/bash
# =============================================================================
# holded-sync.sh — Sync incremental de facturas Holded
# Cron recomendado (añadir en /etc/cron.d/holded-sync):
#
#   # Sync mes actual a las 02:00 y 14:00 UTC
#   0 2,14 * * * root /var/www/portal/scripts/holded-sync.sh >> /var/log/holded-sync.log 2>&1
#
#   # Sync mes anterior el día 1 (facturas de pago tardío)
#   0 3 1 * * root /var/www/portal/scripts/holded-sync.sh prev >> /var/log/holded-sync.log 2>&1
# =============================================================================
set -euo pipefail

BEARER=$(grep VIHOLABS_INTERNAL_BEARER /var/www/portal/.env | cut -d= -f2)
BASE_URL="http://127.0.0.1:3000"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# "prev" como argumento sincroniza el mes anterior
if [ "${1:-}" = "prev" ]; then
  MONTH=$(date -d "1 month ago" '+%Y-%m')
else
  MONTH=$(date '+%Y-%m')
fi

echo "[$TIMESTAMP] Iniciando Holded sync para $MONTH"

RESULT=$(curl -sf -X POST "$BASE_URL/api/holded/invoices/import-incremental" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BEARER" \
  -d "{\"month\": \"$MONTH\", \"preview\": false}" \
  --max-time 300 2>&1) || {
    echo "[$TIMESTAMP] ERROR: curl falló (exit $?)"
    exit 1
  }

echo "[$TIMESTAMP] Resultado: $RESULT"

# Extraer conteo de documentos procesados si está en la respuesta
ACCEPTED=$(echo "$RESULT" | grep -o '"accepted_count":[0-9]*' | grep -o '[0-9]*' || echo "?")
echo "[$TIMESTAMP] Documentos aceptados: $ACCEPTED"
echo "[$TIMESTAMP] Sync completado"
