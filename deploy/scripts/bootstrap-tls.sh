#!/usr/bin/env bash
# Obtain the FIRST Let's Encrypt certificate. Run this once per host, before
# `deploy.sh`, because nginx refuses to start without the certificate files.
#
# Uses certbot's standalone HTTP-01 challenge, so host port 80 must be free.
# Renewals afterwards are handled by the certbot service over the ACME webroot.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DOMAIN:?DOMAIN must be set in .env}"
: "${ACME_EMAIL:?ACME_EMAIL must be set in .env}"

VOLUME="quali_letsencrypt"
STAGING_FLAG=""
if [ "${ACME_STAGING:-0}" = "1" ]; then
  STAGING_FLAG="--staging"
  echo "==> Using Let's Encrypt staging CA (certificates will not be trusted)"
fi

echo "==> Stopping web so port ${HTTP_PORT:-80} is free for the HTTP-01 challenge"
docker compose stop web >/dev/null 2>&1 || true

echo "==> Requesting certificate for ${DOMAIN}"
docker run --rm \
  -p "${HTTP_PORT:-80}:80" \
  -v "${VOLUME}:/etc/letsencrypt" \
  certbot/certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --no-eff-email \
    ${STAGING_FLAG} \
    -m "${ACME_EMAIL}" \
    -d "${DOMAIN}"

echo "==> Certificate issued. Now run: ./deploy/scripts/deploy.sh"
echo "    Renewals are automatic (certbot service, webroot method, every 12h)."
