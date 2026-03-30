#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: pnpm -s portal:inc <SINCE_ISO> <UNTIL_ISO> <LIMIT>"
  echo "Example: pnpm -s portal:inc 2026-02-23T00:00:00.000Z 2026-02-24T23:59:59.999Z 300"
  exit 2
fi

SINCE="$1"
UNTIL="$2"
LIMIT="$3"

: "${PORTAL_BEARER_TOKEN:?Missing PORTAL_BEARER_TOKEN}"
: "${PORTAL_BASE_URL:=http://127.0.0.1:3000}"

curl -sS \
  -H "Authorization: Bearer ${PORTAL_BEARER_TOKEN}" \
  -H "Accept: application/json" \
  "${PORTAL_BASE_URL}/api/holded/invoices/import-incremental?since=${SINCE}&until=${UNTIL}&limit=${LIMIT}" | cat
