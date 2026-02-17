#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}/api/holded/ping"
LOG="/tmp/viho_smoke_holded_ping_dev.log"

echo "[smoke] typecheck..."
pnpm tsc --noEmit >/dev/null

echo "[smoke] start dev server on ${HOST}:${PORT} ..."
: > "${LOG}"
pnpm dev -- -H "${HOST}" -p "${PORT}" >"${LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[smoke] wait for server (max 30s)..."
READY=0
for i in {1..30}; do
  if curl -sS -o /dev/null "${URL}"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "${READY}" -ne 1 ]; then
  echo "FAILED: server not responding at ${URL}"
  echo "---- DEV LOG (last 200 lines) ----"
  tail -n 200 "${LOG}" || true
  exit 1
fi

echo "[smoke] request..."
OUT="$(curl -sS -i "${URL}")"

echo "[smoke] assert content-type json..."
echo "${OUT}" | tr -d '\r' | grep -qi '^content-type: application/json' || {
  echo "FAILED: missing content-type application/json"
  echo "---- RESPONSE ----"
  echo "${OUT}"
  echo "---- DEV LOG (last 200 lines) ----"
  tail -n 200 "${LOG}" || true
  exit 1
}

echo "[smoke] assert 401..."
echo "${OUT}" | tr -d '\r' | head -n 1 | grep -q '401' || {
  echo "FAILED: expected 401"
  echo "---- RESPONSE ----"
  echo "${OUT}"
  echo "---- DEV LOG (last 200 lines) ----"
  tail -n 200 "${LOG}" || true
  exit 1
}

echo "[smoke] assert canonical body..."
echo "${OUT}" | tr -d '\r' | grep -q '"error":"Missing Bearer token"' || {
  echo "FAILED: expected canonical error Missing Bearer token"
  echo "---- RESPONSE ----"
  echo "${OUT}"
  echo "---- DEV LOG (last 200 lines) ----"
  tail -n 200 "${LOG}" || true
  exit 1
}

echo "[smoke] OK: /api/holded/ping stable (no-token path)"
