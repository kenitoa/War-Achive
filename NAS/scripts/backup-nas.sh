#!/bin/sh
set -eu
task_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$task_dir"
umask 077
task_id=$(date -u +%Y%m%dT%H%M%SZ)
task_backup="$task_dir/backups/$task_id"
mkdir -p "$task_backup"
# Dump first: immutable originals copied afterwards include all files referenced at dump time.
docker compose exec -T db pg_dump -U archive -d archive -Fc > "$task_backup/database.dump"
docker compose exec -T api tar -C /var/lib/war-archive -cf - . > "$task_backup/archive-files.tar"
docker compose exec -T api tar -C /var/lib/war-archive-releases -cf - . > "$task_backup/releases.tar"
docker compose exec -T db pg_restore --list < "$task_backup/database.dump" > "$task_backup/database-contents.txt"
(cd "$task_backup" && sha256sum database.dump archive-files.tar releases.tar > SHA256SUMS)
printf '%s\n' "Backup created at $task_backup. Encrypt and copy off-site before marking the backup protected."
