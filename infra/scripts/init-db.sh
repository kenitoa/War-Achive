#!/bin/bash
# ============================================================
# WAR ARCHIVE - 데이터베이스 초기화 스크립트
# MySQL 컨테이너 최초 실행 시 자동 실행됨
# (docker-entrypoint-initdb.d에 마운트)
# ============================================================

set -e

echo "=== War Archive DB 초기화 ==="
echo "SQL 파일이 docker-entrypoint-initdb.d에 마운트되어 자동 실행됩니다."
echo "  - user_logindata.sql (인증 테이블)"
echo "  - user_database.sql  (프로필/세션 테이블)"
echo "=== 초기화 완료 ==="
