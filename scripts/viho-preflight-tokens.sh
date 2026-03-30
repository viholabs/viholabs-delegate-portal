#!/usr/bin/env bash
set -euo pipefail

red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
ylw() { printf "\033[33m%s\033[0m\n" "$*"; }

need() {
  local name="$1"
  local v="${!name-}"
  if [ -z "${v}" ]; then
    red "NOT_SET: ${name}"
    return 1
  fi
  grn "SET: ${name} (len=${#v})"
  return 0
}

echo "VIHOLABS preflight — tokens/env (no secrets printed)"
echo "----------------------------------------------"

# Defaults (safe)
: "${PORTAL_BASE_URL:=http://127.0.0.1:3000}"
: "${HOLDED_BASE_URL:=https://api.holded.com/api/invoicing/v1/documents}"

echo "PORTAL_BASE_URL=${PORTAL_BASE_URL}"
echo "HOLDED_BASE_URL=${HOLDED_BASE_URL}"

ok=0
need "PORTAL_BEARER_TOKEN" || ok=1
need "HOLDED_API_KEY" || ok=1

if [ "$ok" -ne 0 ]; then
  ylw ""
  ylw "Fix:"
  ylw "  - Set PORTAL_BEARER_TOKEN and HOLDED_API_KEY in your .env.local (recommended) or env."
  ylw "  - Use .env.example as reference."
  exit 1
fi

grn "OK: env looks good"
