-- ============================================================
-- WAR ARCHIVE - 유저 로그인 인증 데이터
-- 파일: user_logindata.sql
-- 설명: 유저 아이디(이메일), 비밀번호 해시, 권한(권한) 저장
--       (계정 프로필 정보는 user_database.sql에서 관리)
-- 생성일: 2026-04-14
-- ============================================================

CREATE TABLE IF NOT EXISTS user_logindata (
    user_id         BIGINT          PRIMARY KEY AUTO_INCREMENT,
    username        VARCHAR(50)     NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,       -- bcrypt 해시
    role            ENUM('user', 'editor', 'admin') NOT NULL DEFAULT 'user',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 등록된 유저 로그인 데이터
-- (회원가입 시 아래에 INSERT 문이 추가됩니다)
-- ============================================================

-- 초기 관리자 계정 (최초 로그인 후 반드시 비밀번호 변경 필요)
INSERT INTO user_logindata (username, email, password_hash, role)
VALUES ('kiseno', 'kiseno@gmail.com', '45211ab59b6cede2827784ee64e4d3c81f1cceb6dbcd88b7db93cced77241a20', 'admin');
