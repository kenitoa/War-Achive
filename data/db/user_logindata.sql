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

-- 초기 관리자 계정은 환경변수를 통해 생성됩니다.
-- docker-compose 환경변수: ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD_HASH
-- bcrypt 해시 생성: node -e "require('bcrypt').hash('비밀번호',12).then(console.log)"
-- 보안: 절대 평문 해시를 SQL 파일에 하드코딩하지 마세요.
