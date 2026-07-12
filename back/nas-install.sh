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

  umask 077
  {
    echo "COMPOSE_PROJECT_NAME=war-archive"
    echo "TZ=Asia/Seoul"
    echo "COLLECTION_INTERVAL_MS=1800000"
    echo "PUBLICATION_INTERVAL_MS=2400000"
    echo "GITHUB_FRONT_REPOSITORY=$github_repository"
    echo "GITHUB_FRONT_TOKEN=$github_token"
    echo "GITHUB_FRONT_REF=main"
    echo "GITHUB_FRONT_CONTENT_PATH=web/content/archive.json"
  } > .env
  echo "Created .env"
else
  echo "Using existing .env"
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

echo "War Archive collector is running. No public API domain or internet-facing port is required."
echo "Published records will accumulate in the front repository at web/content/archive.json."
echo "Admin dashboard: http://NAS-IP:${ADMIN_PORT:-9231} (LAN access only)"
