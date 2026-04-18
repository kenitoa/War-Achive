#!/bin/bash
# ============================================================
# WAR ARCHIVE - 백업 스크립트
# 사용법: bash scripts/backup.sh
# cron 등록 예시: 0 3 * * * /path/to/scripts/backup.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BACKUP_DIR="$PROJECT_DIR/backup"
DATE=$(date +%Y%m%d_%H%M%S)

# 환경 변수 로드
source "$(dirname "$SCRIPT_DIR")/.env"

echo "=== War Archive 백업 시작: $DATE ==="

# ── DB 백업 ──
echo "[1/3] MySQL 데이터베이스 백업..."
docker exec wararchive-mysql sh -c \
    'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
    > "$BACKUP_DIR/db/war_archive_$DATE.sql"

# 30일 이상 된 DB 백업 삭제
find "$BACKUP_DIR/db" -name "*.sql" -mtime +30 -delete

# ── 업로드 파일 백업 ──
echo "[2/3] 업로드 파일 백업..."
if [ -d "$PROJECT_DIR/data/uploads" ] && [ "$(ls -A "$PROJECT_DIR/data/uploads" 2>/dev/null)" ]; then
    tar -czf "$BACKUP_DIR/uploads/uploads_$DATE.tar.gz" \
        -C "$PROJECT_DIR/data" uploads/
    # 30일 이상 된 업로드 백업 삭제
    find "$BACKUP_DIR/uploads" -name "*.tar.gz" -mtime +30 -delete
fi

# ── 설정 파일 백업 ──
echo "[3/3] 설정 파일 백업..."
tar -czf "$BACKUP_DIR/settings/settings_$DATE.tar.gz" \
    -C "$PROJECT_DIR" \
    infra/.env \
    infra/docker-compose.yml \
    infra/nginx/default.conf

echo ""
echo "=== 백업 완료: $DATE ==="
echo "위치: $BACKUP_DIR"
