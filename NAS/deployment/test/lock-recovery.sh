#!/bin/sh
# Run on the NAS: sh deployment/test/lock-recovery.sh
set -eu
umask 077
task_test=$(mktemp -d /tmp/war-archive-flock-test.XXXXXX)
task_child=
finish() {
  if [ -n "$task_child" ]; then kill -KILL "$task_child" 2>/dev/null || true; wait "$task_child" 2>/dev/null || true; fi
  rm -f "$task_test/lock" "$task_test/ready"
  rmdir "$task_test"
}
trap finish EXIT HUP INT TERM
sh -c 'exec 9> "$1/lock"; flock -n 9 || exit 1; printf ready > "$1/ready"; while :; do :; done' sh "$task_test" &
task_child=$!
task_attempt=0
while [ ! -f "$task_test/ready" ] && [ "$task_attempt" -lt 10 ]; do sleep 1; task_attempt=$((task_attempt + 1)); done
[ -f "$task_test/ready" ] || { printf '%s\n' 'Lock holder did not start.' >&2; exit 1; }
if (exec 8> "$task_test/lock"; flock -n 8); then printf '%s\n' 'Concurrent lock unexpectedly acquired.' >&2; exit 1; fi
kill -KILL "$task_child"
wait "$task_child" 2>/dev/null || true
task_child=
(exec 8> "$task_test/lock"; flock -n 8) || { printf '%s\n' 'SIGKILL left the lock blocked.' >&2; exit 1; }
printf '%s\n' 'flock rejects concurrent updates and recovers after same-boot SIGKILL.'
