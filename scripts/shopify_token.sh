#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/viholabs-delegate-portal

# Carrega variables de .env.local a la sessió
set -a
. ./.env.local
set +a

SHOP="${SHOPIFY_SHOP_DOMAIN:?missing SHOPIFY_SHOP_DOMAIN}"

curl -sS -X POST "https://$SHOP/admin/oauth/access_token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=client_credentials&client_id=$SHOPIFY_CLIENT_ID&client_secret=$SHOPIFY_CLIENT_SECRET"
