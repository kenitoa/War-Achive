#!/bin/bash
# ============================================================
# WAR ARCHIVE - 초기 관리자 계정 생성 스크립트
# docker-compose 실행 후 최초 1회만 실행
# 사용법: docker exec wararchive-backend node -e "$(cat init-admin.js)"
#        또는 docker compose exec backend sh /app/scripts/init-admin.sh
# ============================================================

set -e

: "${ADMIN_USERNAME:?ADMIN_USERNAME 환경변수가 필요합니다}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL 환경변수가 필요합니다}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD 환경변수가 필요합니다}"

echo "=== 초기 관리자 계정 생성 ==="
echo "사용자: ${ADMIN_USERNAME} (${ADMIN_EMAIL})"

# backend 컨테이너에서 bcrypt 해시 생성 및 DB 삽입
docker exec wararchive-backend node -e "
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

(async () => {
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'mysql',
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const [existing] = await conn.query('SELECT user_id FROM user_logindata WHERE email = ?', [process.env.ADMIN_EMAIL]);
  if (existing.length > 0) {
    console.log('관리자 계정이 이미 존재합니다.');
  } else {
    await conn.query(
      'INSERT INTO user_logindata (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [process.env.ADMIN_USERNAME, process.env.ADMIN_EMAIL, hash, 'admin']
    );
    console.log('관리자 계정 생성 완료');
  }
  await conn.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"

echo "=== 완료 ==="
