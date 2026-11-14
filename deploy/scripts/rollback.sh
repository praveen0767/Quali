#!/usr/bin/env bash
# Roll back to a previously built image tag WITHOUT rebuilding.
#
#   ./deploy/scripts/rollback.sh                 # use deploy/.last-good-tag
#   ./deploy/scripts/rollback.sh 20261115-101500 # explicit tag
#
# Images are built locally and tagged per deploy, so the tag must still exist:
#   docker image ls quali-api
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

TAG="${1:-}"
if [ -z "$TAG" ]; then
  if [ -f deploy/.last-good-tag ]; then
    TAG=$(cat deploy/.last-good-tag)
  else
    echo "ERROR: no tag given and deploy/.last-good-tag does not exist." >&2
    exit 1
  fi
fi

if ! docker image inspect "quali-api:${TAG}" >/dev/null 2>&1; then
  echo "ERROR: image quali-api:${TAG} not present on this host." >&2
  echo "Available tags:" >&2
  docker image ls quali-api --format '  {{.Tag}} ({{.CreatedSince}})' >&2
  exit 1
fi

export IMAGE_TAG="$TAG"
echo "==> Rolling back to IMAGE_TAG=${TAG} (no rebuild)"
docker compose up -d --no-build --remove-orphans

for i in $(seq 1 60); do
  api_state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(docker compose ps -q api)" 2>/dev/null || echo starting)
  web_state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(docker compose ps -q web)" 2>/dev/null || echo starting)
  if [ "$api_state" = "healthy" ] && [ "$web_state" = "healthy" ]; then
    echo "==> Rollback complete: IMAGE_TAG=${TAG}"
    exit 0
  fi
  sleep 2
done

echo "ERROR: rollback target did not become healthy; check docker compose logs." >&2
exit 1
