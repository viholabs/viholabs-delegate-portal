#!/usr/bin/env bash
set -e

echo "[smoke] typecheck..."
pnpm tsc --noEmit >/dev/null

echo "[smoke] start dev server..."
pnpm dev >/tmp/viho_smoke_dev.log 2>&1 &
PID=$!

echo "[smoke] wait for server..."
sleep 5

echo "[smoke] request..."
HTTP_CODE=$(curl -s -o /tmp/viho_smoke_resp.txt -w "%{http_code}" http://127.0.0.1:3000/api/holded/poll)

echo "[smoke] assert 401..."
if [ "$HTTP_CODE" != "401" ]; then
  echo "FAILED: expected 401 got $HTTP_CODE"
  cat /tmp/viho_smoke_resp.txt
  kill $PID
  exit 1
fi

echo "[smoke] OK"
kill $PID
