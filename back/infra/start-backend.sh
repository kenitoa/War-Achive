#!/bin/sh
set -eu

node pipeline/dist/collection-scheduler.js &
collector_pid=$!
node pipeline/dist/publication-scheduler.js &
publisher_pid=$!
node admin/server.mjs &
admin_pid=$!
node "Discord Bot/monitor.mjs" &
monitor_pid=$!

shutdown() {
  kill "$collector_pid" "$publisher_pid" "$admin_pid" "$monitor_pid" 2>/dev/null || true
}
trap shutdown INT TERM EXIT

echo "[war-archive] collector, publisher and admin dashboard started"
while kill -0 "$collector_pid" 2>/dev/null \
  && kill -0 "$publisher_pid" 2>/dev/null \
  && kill -0 "$admin_pid" 2>/dev/null \
  && kill -0 "$monitor_pid" 2>/dev/null; do
  sleep 10
done

echo "[war-archive] a backend process stopped unexpectedly" >&2
exit 1
