#!/bin/bash
# ============================================================
# WAR ARCHIVE - 배포 스크립트
# 사용법: bash scripts/deploy.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== War Archive 배포 시작 ==="

cd "$INFRA_DIR"

# 환경 변수 확인
if [ ! -f .env ]; then
    echo "[오류] .env 파일이 없습니다. .env 파일을 생성해주세요."
    exit 1
fi

# Docker Compose 빌드 및 실행
echo "[1/3] Docker 이미지 빌드..."
docker compose build --no-cache

echo "[2/3] 기존 컨테이너 중지..."
docker compose down

echo "[3/3] 컨테이너 시작..."
docker compose up -d

echo ""
echo "=== 배포 완료 ==="
echo "헬스체크: curl http://localhost:8080/health"
echo "API 주소: http://localhost:8080/api/"
