#!/bin/sh
set -eu

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is not installed or is not available in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [ ! -f .env ]; then
  github_repository="${1:-${GITHUB_FRONT_REPOSITORY:-kenitoa/warsachive}}"
  github_token="${GITHUB_FRONT_TOKEN:-}"
  admin_token="${WAR_ARCHIVE_ADMIN_TOKEN:-}"

  if [ -z "$github_repository" ]; then
    echo "Usage: GITHUB_FRONT_TOKEN=token sh nas-install.sh [owner/repository]" >&2
    echo "Or copy .env.example to .env and edit it before running this script." >&2
    exit 1
  fi

  case "$github_repository" in
    */*) ;;
    *)
      echo "ERROR: GitHub repository must use owner/repository format." >&2
      exit 1
      ;;
  esac

  if [ -z "$github_token" ]; then
    echo "ERROR: Set GITHUB_FRONT_TOKEN to a fine-grained token with Contents write permission." >&2
    exit 1
  fi

  if [ -z "$admin_token" ]; then
    if command -v openssl >/dev/null 2>&1; then
      admin_token="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
    else
      admin_token="$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')"
    fi
  fi

  umask 077
  {
    echo "COMPOSE_PROJECT_NAME=war-archive"
    echo "TZ=Asia/Seoul"
    echo "ADMIN_PORT=9231"
    echo "WAR_ARCHIVE_ADMIN_TOKEN=$admin_token"
    echo "COLLECTION_INTERVAL_MS=600000"
    echo "PROCESSING_DELAY_MS=600000"
    echo "PUBLICATION_INTERVAL_MS=3600000"
    echo "COLLECTION_MAX_ITEMS_PER_SOURCE=100"
    echo "PUBLICATION_MIN_QUALITY_SCORE=0.6"
    echo "SCHEDULER_RETRY_MS=60000"
    echo "MONITOR_INTERVAL_MS=60000"
    echo "MONITOR_FAILURE_THRESHOLD=3"
    echo "DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN:-}"
    echo "DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID:-}"
    echo "DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL:-}"
    echo "GITHUB_FRONT_REPOSITORY=$github_repository"
    echo "GITHUB_FRONT_TOKEN=$github_token"
    echo "GITHUB_FRONT_REF=main"
    echo "GITHUB_FRONT_CONTENT_PATH=web/content/archive.json"
    echo "SMITHSONIAN_API_KEY="
    echo "EUROPEANA_API_KEY="
    echo "DPLA_API_KEY="
  } > .env
  chmod 600 .env 2>/dev/null || true
  echo "Created .env"
else
  echo "Using existing .env"
  chmod 600 .env 2>/dev/null || true
fi

echo "Validating Docker Compose configuration..."
docker compose config --quiet

echo "Building and starting War Archive collector..."
docker compose up -d --build --remove-orphans

echo "Checking scheduler container..."
attempt=0
until [ "$(docker compose ps --status running --services | grep -c '^backend$' || true)" -eq 1 ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "ERROR: Backend scheduler container is not running. Recent logs:" >&2
    docker compose logs --tail=100 backend >&2
    exit 1
  fi
  sleep 2
done

echo "Checking backend health..."
attempt=0
while :; do
  container_id="$(docker compose ps -q backend)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || echo unknown)"
  if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
    break
  fi
  attempt=$((attempt + 1))
  if [ "$health" = "unhealthy" ] || [ "$attempt" -ge 30 ]; then
    echo "ERROR: Backend healthcheck did not become healthy. Current status: $health. Recent logs:" >&2
    docker compose logs --tail=100 backend >&2
    exit 1
  fi
  sleep 2
done

echo "War Archive collector is running. No public API domain or internet-facing port is required."
echo "Published records will accumulate in the front repository at web/content/archive.json."
echo "Admin dashboard: http://NAS-IP:${ADMIN_PORT:-9231} (LAN access only)"
echo "Admin token is stored only in back/.env as WAR_ARCHIVE_ADMIN_TOKEN."
