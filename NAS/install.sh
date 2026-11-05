#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v docker >/dev/null 2>&1 || { echo 'Docker is required.' >&2; exit 1; }
docker compose version >/dev/null
umask 077
# A fresh configuration is generated in this folder; existing secrets are preserved.
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:22-bookworm-slim node scripts/configure-nas.mjs --production
chmod 600 .env
docker compose config --quiet
docker compose build
docker compose run --rm --no-deps api node dist/commands/preflight.js --configuration-only
docker compose up -d db
docker compose run --rm api node dist/commands/migrate.js
docker compose run --rm api node dist/commands/seed-sources.js
docker compose up -d api worker gateway
docker compose exec -T api node dist/commands/preflight.js
attempt=0
until docker compose exec -T worker node -e "const f=require('node:fs');const h=JSON.parse(f.readFileSync('/var/lib/war-archive/worker-heartbeat.json'));process.exit(h.workerId&&Date.now()-Date.parse(h.at)<120000?0:1)" >/dev/null 2>&1 && docker compose exec -T gateway node -e "fetch('http://127.0.0.1:8080/healthz',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'API/worker/gateway readiness failed. Inspect docker compose logs. Existing data and containers are preserved.' >&2
    exit 1
  fi
  sleep 2
done
echo 'NAS pipeline installed. Configure HTTPS for private admin and public /blog/ separately. Review source policies and article evidence before publishing.'
