-- ============================================================
-- WAR ARCHIVE - 사용자 계정 정보 데이터베이스
-- 파일: user_database.sql
-- 설명: 사용자 프로필, 세션, 활동 기록 등 계정 정보 관리
--       (로그인 인증 정보는 user_logindata.sql에서 관리)
-- 생성일: 2026-04-14
-- ============================================================

-- ── 사용자 프로필 테이블 ──
-- 사용자의 공개 프로필 정보
CREATE TABLE IF NOT EXISTS user_profiles (
    profile_id      BIGINT          PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT          NOT NULL UNIQUE,
    display_name    VARCHAR(100)    NULL,
    bio             TEXT            NULL,
    avatar_url      VARCHAR(500)    NULL,
    favorite_era    VARCHAR(100)    NULL,       -- 관심 시대 (예: 제2차 세계대전)
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 로그인 세션 테이블 ──
-- 동시 로그인 및 세션 관리
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id      BIGINT          PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT          NOT NULL,
    session_token   CHAR(64)        NOT NULL UNIQUE,
    ip_address      VARCHAR(45)     NULL,
    user_agent      VARCHAR(512)    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NOT NULL,
    is_valid        TINYINT(1)      NOT NULL DEFAULT 1,

    INDEX idx_user_id (user_id),
    INDEX idx_token (session_token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 로그인 시도 기록 테이블 ──
-- 보안: 무차별 대입 공격 방지를 위한 로그인 시도 추적
CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id      BIGINT          PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255)    NOT NULL,
    ip_address      VARCHAR(45)     NULL,
    attempted_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success         TINYINT(1)      NOT NULL DEFAULT 0,

    INDEX idx_email_time (email, attempted_at),
    INDEX idx_ip_time (ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 초기 관리자 프로필
-- ============================================================
INSERT INTO user_profiles (user_id, display_name, bio)
VALUES (
    1,
    'kiseno',
    'War Archive 프로젝트 관리자'
);
