#!/bin/sh
# The only stdin line is the external backup encryption key. Never enable tracing.
set -eu
umask 077
task_root=${1:?Usage: export-backup.sh dedicated-deployment-root}
case "$task_root" in /|*..*) exit 2;; /*) ;; *) exit 2;; esac
task_root=$(CDPATH= cd -- "$task_root" && pwd -P)
task_docker=/usr/local/bin/docker
[ -x "$task_docker" ] || task_docker=$(command -v docker)
task_uid=$(id -u)
task_gid=$(id -g)
docker_call() { if [ "$task_uid" -eq 0 ]; then "$task_docker" "$@"; else sudo -n "$task_docker" "$@"; fi; }
exec 9> "$task_root/state/update.flock"
flock -w 600 9 || { printf '%s\n' 'Backup could not obtain the deployment lock.' >&2; exit 1; }
task_commit=$(cat "$task_root/state/current-commit")
case "$task_commit" in *[!a-f0-9]*|'') exit 2;; esac
[ "${#task_commit}" -eq 40 ] || exit 2
IFS= read -r BACKUP_ENCRYPTION_KEY
task_id="$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)"
task_stage="$task_root/backups/dr-$task_id"
task_output="$task_root/backups/dr-$task_id.tar.gz.enc"
mkdir "$task_stage"
mkdir "$task_stage/backup" "$task_stage/recovery"
task_compose="$task_root/releases/$task_commit/compose.deploy.json"
dc() { docker_call compose --project-name war-archive --env-file "$task_root/shared/.env" -f "$task_compose" "$@"; }
task_stopped=false
task_phase=key-validation
resume() {
  if [ "$task_stopped" = true ]; then
    dc start api worker publicgateway >/dev/null
    task_wait=0
    while [ "$task_wait" -lt 60 ]; do
      task_ready=true
      for task_service in api worker publicgateway; do
        task_container=$(dc ps -q "$task_service")
        task_health=$(docker_call inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$task_container")
        [ "$task_health" = healthy ] || task_ready=false
      done
      if [ "$task_ready" = true ]; then task_stopped=false; return 0; fi
      sleep 2
      task_wait=$((task_wait + 1))
    done
    printf '%s\n' 'Application services resumed but health verification failed.' >&2
    return 1
  fi
}
finish() {
  task_status=$?
  trap - EXIT HUP INT TERM
  resume || task_status=1
  if [ "$task_status" -ne 0 ]; then printf '{"operation":"backup.export","status":"failed","phase":"%s"}\n' "$task_phase" >&2; fi
  unset BACKUP_ENCRYPTION_KEY
  exit "$task_status"
}
trap finish EXIT
trap 'exit 130' HUP INT TERM
# Validate the key before quiescing live writers or making a large export.
printf '%s\n' "$BACKUP_ENCRYPTION_KEY" | docker_call run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user "$task_uid:$task_gid" --entrypoint node "war-archive-backend:$task_commit" -e 'const k=require("node:fs").readFileSync(0,"utf8").trim();if(!/^[A-Za-z0-9+/]{43}=$/.test(k))process.exit(2)'
task_stopped=true
task_phase=consistent-copy
dc stop -t 35 worker api publicgateway >/dev/null
dc exec -T db pg_dump -U archive -d archive -Fc > "$task_stage/backup/database.dump" </dev/null
dc exec -T db pg_restore --list < "$task_stage/backup/database.dump" > "$task_stage/backup/database-contents.txt"
dc run --rm --no-deps -T --entrypoint tar api -C /var/lib/war-archive -cf - . > "$task_stage/backup/archive-files.tar" </dev/null
dc run --rm --no-deps -T --entrypoint tar api -C /var/lib/war-archive-releases -cf - . > "$task_stage/backup/releases.tar" </dev/null
# The application's existing unprivileged UID reads only its own mounted deploy key.
dc run --rm --no-deps -T --entrypoint tar api -C /run/secrets -cf - github_deploy_key github_known_hosts > "$task_stage/recovery/secrets.tar" </dev/null
cp "$task_root/shared/.env" "$task_stage/recovery/environment.env"
tar -C "$task_root" -czf "$task_stage/recovery/source-and-bootstrap.tar.gz" "releases/$task_commit" deployment state/current.json state/current-commit
(cd "$task_stage/backup" && sha256sum database.dump archive-files.tar releases.tar > SHA256SUMS)
resume
# Large, immutable image export runs after the live services have resumed.
task_phase=runtime-images
docker_call image save "war-archive-backend:$task_commit" "war-archive-gateway:$task_commit" postgres:17-alpine > "$task_stage/recovery/runtime-images.tar"
gzip -1 "$task_stage/recovery/runtime-images.tar"
docker_call image inspect --format '{{.Id}} {{json .RepoTags}}' "war-archive-backend:$task_commit" "war-archive-gateway:$task_commit" postgres:17-alpine > "$task_stage/recovery/image-identities.txt"
task_phase=recovery-manifest
printf '{"version":1,"createdAt":"%s","commit":"%s","scope":"war-archive-application","database":"postgresql-17","keyIncluded":false}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$task_commit" > "$task_stage/manifest.json"
(cd "$task_stage" && sha256sum manifest.json backup/database.dump backup/archive-files.tar backup/releases.tar backup/database-contents.txt backup/SHA256SUMS recovery/environment.env recovery/secrets.tar recovery/source-and-bootstrap.tar.gz recovery/runtime-images.tar.gz recovery/image-identities.txt > SHA256SUMS)
# gzip creates its output asynchronously; an output inside '.' changes that input's
# mtime and GNU tar correctly exits 1 on large backups. Package outside, then move in.
task_bundle="$task_root/backups/.bundle-$task_id.tar.gz"
/usr/bin/python3 "$task_root/deployment/package-backup.py" "$task_stage" "$task_bundle"
mv "$task_bundle" "$task_stage/bundle.tar.gz"
task_plain_hash=$(sha256sum "$task_stage/bundle.tar.gz" | cut -d ' ' -f 1)
task_phase=encryption
printf '%s\n' "$BACKUP_ENCRYPTION_KEY" | docker_call run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user "$task_uid:$task_gid" --mount "type=bind,src=$task_stage,dst=/backup" --mount "type=bind,src=$task_root/deployment/encrypt-backup.mjs,dst=/encrypt-backup.mjs,readonly" --entrypoint node "war-archive-backend:$task_commit" /encrypt-backup.mjs encrypt /backup/bundle.tar.gz /backup/bundle.tar.gz.enc --key-stdin >/dev/null
# AES-GCM authentication and a byte-for-byte round trip are required before marking ready.
task_phase=encryption-roundtrip
printf '%s\n' "$BACKUP_ENCRYPTION_KEY" | docker_call run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user "$task_uid:$task_gid" --mount "type=bind,src=$task_stage,dst=/backup" --mount "type=bind,src=$task_root/deployment/encrypt-backup.mjs,dst=/encrypt-backup.mjs,readonly" --entrypoint node "war-archive-backend:$task_commit" /encrypt-backup.mjs decrypt /backup/bundle.tar.gz.enc /backup/roundtrip.tar.gz --key-stdin >/dev/null
[ "$(sha256sum "$task_stage/roundtrip.tar.gz" | cut -d ' ' -f 1)" = "$task_plain_hash" ]
mv "$task_stage/bundle.tar.gz.enc" "$task_output"
rm "$task_stage/bundle.tar.gz" "$task_stage/roundtrip.tar.gz"
task_cipher_hash=$(sha256sum "$task_output" | cut -d ' ' -f 1)
task_size=$(wc -c < "$task_output" | tr -d ' ')
task_phase=completion-receipt
printf '{"version":1,"status":"encrypted-verified","id":"%s","commit":"%s","remoteFile":"%s","ciphertextSha256":"%s","plaintextSha256":"%s","bytes":%s,"createdAt":"%s"}\n' "$task_id" "$task_commit" "$task_output" "$task_cipher_hash" "$task_plain_hash" "$task_size" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$task_root/state/external-backup-ready.json"
cat "$task_root/state/external-backup-ready.json"
