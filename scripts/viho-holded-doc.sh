#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: pnpm -s holded:doc <DOC_NUMBER>"
  echo "Example: pnpm -s holded:doc F260030"
  exit 2
fi

DOC="$1"

: "${HOLDED_API_KEY:?Missing HOLDED_API_KEY}"
: "${HOLDED_BASE_URL:=https://api.holded.com/api/invoicing/v1/documents}"

# Holded auth: APIKEY header (NOT Bearer)
curl -sS \
  -H "accept: application/json" \
  -H "key: ${HOLDED_API_KEY}" \
  "${HOLDED_BASE_URL}/invoice/${DOC}" | cat
