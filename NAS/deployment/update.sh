#!/bin/sh
# Invoked by DSM Task Scheduler as the NAS project owner or root. Never enable shell tracing.
set -eu
umask 077
task_root=${1:-/volume3/docker/War_Archive_Server}
case "$task_root" in /|*..*) printf '%s\n' 'A dedicated absolute deployment directory is required.' >&2; exit 2;; /*) ;; *) exit 2;; esac
task_root=$(CDPATH= cd -- "$task_root" && pwd -P)
task_docker=/usr/local/bin/docker
if [ ! -x "$task_docker" ]; then task_docker=$(command -v docker || true); fi
[ -n "$task_docker" ] || { printf '%s\n' 'Docker is required.' >&2; exit 2; }
task_uid=$(id -u)
task_gid=$(id -g)
docker_call() {
  if [ "$task_uid" -eq 0 ]; then "$task_docker" "$@"; else sudo -n "$task_docker" "$@"; fi
}
# The existing Synology sudo rule authorizes the Docker executable only; no generic sudo shell is used.
docker_call compose version >/dev/null
mkdir -p "$task_root/state" "$task_root/shared" "$task_root/backups"
# Keep the lock inode: deleting this file while locked would allow a second updater to bypass it.
# The kernel releases fd 9 after exits/SIGKILL, so same-boot crashes cannot permanently block updates.
exec 9> "$task_root/state/update.flock"
if ! flock -n 9; then printf '%s\n' 'Another deployment holds the update lock; skipped.'; exit 0; fi
task_boot=$(cat /proc/sys/kernel/random/boot_id)
if [ -d "$task_root/state/update.lock" ]; then
  task_legacy_boot=$(cat "$task_root/state/update.lock/boot" 2>/dev/null || true)
  task_legacy_pid=$(cat "$task_root/state/update.lock/pid" 2>/dev/null || true)
  # Old bootstraps use only this directory lock. Never overlap a still-active legacy deployment.
  if [ "$task_legacy_boot" = "$task_boot" ]; then
    case "$task_legacy_pid" in *[!0-9]*|'') printf '%s\n' 'An incomplete legacy lock requires inspection; skipped.'; exit 0;; esac
    if kill -0 "$task_legacy_pid" 2>/dev/null || [ -d "/proc/$task_legacy_pid" ]; then printf '%s\n' 'An active legacy deployment holds the update lock; skipped.'; exit 0; fi
  elif [ -z "$task_legacy_boot" ]; then
    printf '%s\n' 'An unidentified legacy lock requires inspection; skipped.'; exit 0
  fi
  # A confirmed dead PID or different boot can no longer own the legacy markers.
  # Remove only our marker files; unknown contents cause rmdir to fail conservatively.
  rm -f "$task_root/state/update.lock/pid" "$task_root/state/update.lock/boot"
  rmdir "$task_root/state/update.lock"
fi
if ! mkdir "$task_root/state/update.lock" 2>/dev/null; then printf '%s\n' 'Another deployment holds the update lock; skipped.'; exit 0; fi
printf '%s\n' "$$" > "$task_root/state/update.lock/pid"
printf '%s\n' "$task_boot" > "$task_root/state/update.lock/boot"
task_previous=
task_compose=
task_stopped=false
task_done=false
helper() { docker_call run --rm --network "$1" --user "$task_uid:$task_gid" --env HOME=/tmp --mount "type=bind,src=$task_root,dst=/deployment-root" node:22-bookworm-slim node /deployment-root/deployment/controller.mjs "$2" /deployment-root "${3:-}" "${4:-}"; }
# Function argument shifting keeps paths intact even when a DSM shared folder contains spaces.
dc() { task_file=$1; shift; docker_call compose --project-name war-archive --env-file "$task_root/shared/.env" -f "$task_file" "$@"; }
healthy() {
  task_service=$1; task_count=0
  while [ "$task_count" -lt 90 ]; do
    task_container=$(dc "$task_compose" ps -q "$task_service")
    task_health=
    if [ -n "$task_container" ]; then task_health=$(docker_call inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$task_container" 2>/dev/null || true); fi
    if [ "$task_health" = healthy ]; then return 0; fi
    if [ "$task_health" = exited ] || [ "$task_health" = dead ]; then return 1; fi
    sleep 5; task_count=$((task_count + 1))
  done
  return 1
}
finish() {
  task_status=$?
  trap - EXIT HUP INT TERM
  if [ "$task_done" != true ] && [ "$task_stopped" = true ] && [ -n "$task_previous" ]; then
    printf '%s\n' 'Deployment failed; restoring the previous application image. Database migrations and volumes are preserved.' >&2
    task_compose="$task_root/releases/$task_previous/compose.deploy.json"
    if dc "$task_compose" up -d --no-build --force-recreate api worker publicgateway && healthy api && healthy worker && healthy publicgateway; then printf '%s\n' 'Previous application is healthy.'; else printf '%s\n' 'Previous application requires administrator recovery; preserved backup and volumes.' >&2; fi
  elif [ "$task_done" != true ] && [ "$task_stopped" = true ]; then
    dc "$task_compose" stop -t 35 worker api publicgateway || true
    printf '%s\n' 'Initial deployment failed; application writers stopped. Database, originals and backup are preserved.' >&2
  fi
  rm -f "$task_root/state/update.lock/pid" "$task_root/state/update.lock/boot"
  rmdir "$task_root/state/update.lock"
  exit "$task_status"
}
trap finish EXIT
trap 'exit 130' HUP INT TERM
helper bridge fetch "$task_root" "${2:-}"
task_commit=$(cat "$task_root/state/candidate-commit")
case "$task_commit" in *[!a-f0-9]*|'') exit 2;; esac
[ "${#task_commit}" -eq 40 ] || exit 2
task_previous=$(helper none current)
if [ "$task_commit" = "$task_previous" ] && [ "${WAR_ARCHIVE_FORCE_RECREATE:-false}" != true ]; then task_done=true; printf '%s\n' 'Backend source is current; no rebuild or restart.'; exit 0; fi
task_compose="$task_root/releases/$task_commit/compose.deploy.json"
dc "$task_compose" config --quiet
dc "$task_compose" build api publicgateway
dc "$task_compose" up -d db
healthy db || { printf '%s\n' 'Database did not become healthy.' >&2; exit 1; }
# Quiesce application writers before a consistent database/original backup and migration.
task_stopped=true
dc "$task_compose" stop -t 35 worker api publicgateway
task_backup="$task_root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$task_commit"
mkdir "$task_backup"
dc "$task_compose" exec -T db pg_dump -U archive -d archive -Fc > "$task_backup/database.dump"
dc "$task_compose" exec -T db pg_restore --list < "$task_backup/database.dump" > "$task_backup/database-contents.txt"
dc "$task_compose" run --rm --no-deps -T --entrypoint tar api -C /var/lib/war-archive -cf - . > "$task_backup/archive-files.tar"
dc "$task_compose" run --rm --no-deps -T --entrypoint tar api -C /var/lib/war-archive-releases -cf - . > "$task_backup/releases.tar"
(cd "$task_backup" && sha256sum database.dump archive-files.tar releases.tar > SHA256SUMS)
dc "$task_compose" run --rm --no-deps -T api node dist/commands/migrate.js
if [ -d "$task_root/shared/import" ] && [ ! -f "$task_root/state/portable-import-complete" ]; then
  dc "$task_compose" run --rm --no-deps -T --volume "$task_root/shared/import:/import:ro" api node dist/commands/import-portable.js /import /var/lib/war-archive /var/lib/war-archive-releases
  printf '%s\n' "$task_commit" > "$task_root/state/portable-import-complete"
fi
dc "$task_compose" up -d --no-build api worker publicgateway
healthy api && healthy worker && healthy publicgateway || { printf '%s\n' 'Application health checks failed.' >&2; exit 1; }
helper none activate "$task_commit"
task_done=true
# The current shell keeps its original inode; the next invocation uses the validated release scripts.
# A bootstrap refresh failure leaves the healthy activated application running and reports nonzero.
helper none refresh-bootstrap "$task_commit"
printf '%s\n' "Backend deployment complete: $task_commit"
