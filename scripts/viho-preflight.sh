#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspaces/viholabs-delegate-portal"
if [ -d "$ROOT" ]; then
  cd "$ROOT"
elif [ -d "/var/www/viholabs-delegate-portal" ]; then
  cd "/var/www/viholabs-delegate-portal"
else
  echo "FATAL: repo folder not found"
  exit 1
fi

# Load env
set -a
[ -f .env.local ] && source .env.local
set +a

fail=0
need() {
  local k="$1"
  if [ -z "${!k:-}" ]; then
    echo "❌ MISSING: $k"
    fail=1
  else
    echo "✅ $k (len=${#k})"
  fi
}

echo "=== ENV CHECK (presence) ==="
need "HOLDED_API_KEY"
need "SUPABASE_URL"
need "SUPABASE_SERVICE_ROLE_KEY"

echo
echo "=== HOLDED PING ==="
http="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "key: ${HOLDED_API_KEY}" \
  "https://api.holded.com/api/invoicing/v1/documents?page=1&limit=1" || true)"
echo "HTTP=$http"
[ "$http" = "200" ] || { echo "❌ Holded not OK"; fail=1; }

echo
echo "=== SUPABASE URL sanity ==="
case "${SUPABASE_URL:-}" in
  https://*.supabase.co) echo "✅ SUPABASE_URL format OK" ;;
  *) echo "❌ SUPABASE_URL format WRONG: '$SUPABASE_URL'"; fail=1 ;;
esac

echo
if [ "$fail" -eq 1 ]; then
  echo "FATAL: preflight failed"
  exit 1
fi

echo "OK: preflight passed"