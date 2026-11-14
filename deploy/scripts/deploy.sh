#!/usr/bin/env bash
# Build and start the Quali stack on the host, then wait for both services to
# report healthy. Safe to re-run: it is the normal deploy and upgrade command.
set -euo pipefail

cd "$(dirname "$0")/../.."   # -> newi-main/

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env and fill it in." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DOMAIN:?DOMAIN must be set in .env}"
: "${ALLOWED_ORIGINS:?ALLOWED_ORIGINS must be set in .env}"

# Tag images by time (or caller-provided value) so a previous build can be
# restored with deploy/scripts/rollback.sh.
export IMAGE_TAG="${IMAGE_TAG_OVERRIDE:-$(date -u +%Y%m%d-%H%M%S)}"
echo "==> Building images with IMAGE_TAG=${IMAGE_TAG}"
docker compose build

echo "==> Starting stack"
docker compose up -d --remove-orphans

echo "==> Waiting for api and web to become healthy (max 120s)"
for i in $(seq 1 60); do
  api_state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(docker compose ps -q api)" 2>/dev/null || echo starting)
  web_state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(docker compose ps -q web)" 2>/dev/null || echo starting)
  if [ "$api_state" = "healthy" ] && [ "$web_state" = "healthy" ]; then
    echo "$IMAGE_TAG" > deploy/.last-good-tag
    echo "==> Deployed IMAGE_TAG=${IMAGE_TAG}"
    echo "    Health: https://${DOMAIN}/healthz"
    echo "    Rollback: ./deploy/scripts/rollback.sh ${IMAGE_TAG}"
    exit 0
  fi
  sleep 2
done

echo "ERROR: stack did not become healthy (api=${api_state:-unknown} web=${web_state:-unknown})." >&2
echo "Inspect logs with: docker compose logs --tail=100 api web" >&2
exit 1
