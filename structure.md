# War Archive - 프로젝트 구조

## 전체 디렉토리 구조

```
War Archive/
│
├── README.md                       # 프로젝트 소개 및 개요
│
├── front/                          # 프론트엔드 (NAS WebStation)
│   ├── index.html                  # 메인 진입점
│   ├── assets/
│   │   ├── css/                    # 카테고리별 스타일시트
│   │   │   ├── auth/               # 인증 관련 스타일
│   │   │   ├── common/             # 공통 스타일
│   │   │   ├── info/               # 프로젝트 정보 스타일
│   │   │   ├── war overview style/
│   │   │   ├── biography of people style/
│   │   │   ├── strategy and tactics style/
│   │   │   ├── Historical Sources & Documents style/
│   │   │   ├── Battlefield Map style/
│   │   │   ├── Weapons and Equipment Style/
│   │   │   └── Undefine facts style/
│   │   ├── images/                 # 이미지 에셋
│   │   │   └── weapons/            # 무기 이미지
│   │   └── js/                     # 카테고리별 JavaScript
│   │       ├── auth/               # 인증 로직 (로그인/회원가입)
│   │       ├── common/             # 공통 유틸리티
│   │       ├── info/               # 프로젝트 정보 로직
│   │       ├── war overview tech/
│   │       ├── biography of people tech/
│   │       ├── strategy and tactics tech/
│   │       ├── Historical Sources & Documents tech/
│   │       ├── Battlefield Map tech/
│   │       ├── Weapons and Equipment tech/
│   │       └── Undefine facts tech/
│   ├── data/                       # 공개 JSON 데이터 (정적)
│   │   ├── search/                 # 검색 인덱스 JSON
│   │   ├── Battlefield Map data/   # 11개 전투 데이터
│   │   ├── biography of people data/ # 22명 인물 데이터
│   │   ├── Historical Sources & Documents data/ # 17개 사료
│   │   ├── strategy and tactics data/ # 25개 전략·전술
│   │   ├── war overview data/      # 18개 전쟁 개요
│   │   ├── weapons and equipment data/ # 9개 분류
│   │   └── Undefine facts data/    # 미분류 기록
│   └── pages/                      # 카테고리별 HTML 페이지
│       ├── auth/                   # 로그인/회원가입 페이지
│       ├── info/                   # 프로젝트 정보 페이지
│       ├── war overview/
│       ├── biography of people/
│       ├── strategy and tactics/
│       ├── Historical Sources & Documents/
│       ├── Battlefield Map/
│       ├── Weapons and Equipment/
│       └── Undefine facts/
│
├── back/                           # 백엔드 API 서버 (Docker)
│   ├── Dockerfile                  # Node.js 20 Alpine 기반
│   ├── package.json
│   └── src/
│       ├── app.js                  # Express 진입점
│       ├── config/
│       │   ├── index.js            # 환경변수 통합 설정
│       │   └── database.js         # MySQL 커넥션 풀
│       ├── routes/
│       │   ├── index.js            # 라우트 통합 (/api)
│       │   ├── auth.js             # /api/auth (로그인/회원가입/로그아웃)
│       │   ├── users.js            # /api/users (프로필 조회/수정)
│       │   └── data.js             # /api/data (비공개 데이터 CRUD)
│       ├── controllers/
│       │   ├── authController.js   # 인증 요청 처리
│       │   ├── userController.js   # 사용자 요청 처리
│       │   └── dataController.js   # 데이터 요청 처리
│       ├── services/
│       │   ├── authService.js      # 인증 비즈니스 로직
│       │   └── userService.js      # 사용자 비즈니스 로직
│       ├── models/
│       │   ├── User.js             # 사용자 모델
│       │   ├── Profile.js          # 프로필 모델
│       │   └── Session.js          # 세션 모델
│       ├── middleware/
│       │   ├── auth.js             # JWT 인증 미들웨어
│       │   ├── errorHandler.js     # 전역 에러 핸들러
│       │   └── rateLimiter.js      # API 요청 제한
│       └── utils/
│           ├── hash.js             # bcrypt 비밀번호 해싱
│           ├── token.js            # JWT 토큰 생성/검증
│           ├── logger.js           # Winston 로거
│           └── validator.js        # 입력값 검증
│
├── data/                           # 데이터 저장소 (Docker 볼륨 마운트)
│   ├── db/                         # SQL 초기화 스크립트
│   │   ├── user_database.sql       # 프로필/세션/시도 테이블 스키마
│   │   └── user_logindata.sql      # 인증 테이블 스키마 + 시드 데이터
│   ├── logs/                       # 애플리케이션 로그 (Winston)
│   ├── uploads/                    # 사용자 업로드 파일
│   ├── cache/                      # 캐시 데이터
│   └── private-json/               # 비공개 JSON (API 전용)
│
├── infra/                          # 인프라 설정 (Docker)
│   ├── docker-compose.yml          # MySQL + Backend + Nginx 오케스트레이션
│   ├── .env                        # 환경 변수 (Git 제외)
│   ├── nginx/
│   │   └── default.conf            # Nginx 리버스 프록시 설정
│   └── scripts/
│       ├── deploy.sh               # 빌드 + 배포 자동화
│       ├── backup.sh               # DB/업로드/설정 백업
│       ├── init-db.sh              # DB 초기화
│       └── init-admin.sh           # 관리자 계정 생성
│
├── backup/                         # 백업 저장소
│   ├── db/                         # MySQL 덤프 (.sql)
│   ├── uploads/                    # 업로드 파일 아카이브 (.tar.gz)
│   └── settings/                   # 설정 파일 아카이브 (.tar.gz)
│
└── docs/                           # 프로젝트 문서
    ├── structure.md                # 이 파일 - 프로젝트 구조
    ├── api.md                      # REST API 명세
    ├── deploy.md                   # 배포 가이드
    ├── running.md                  # 실행 가이드 및 접속 링크
    └── backup.md                   # 백업/복원 가이드
```

---

## 기술 스택

| 계층 | 기술 | 버전 | 설명 |
|------|------|------|------|
| **프론트엔드** | HTML5 + CSS3 + Vanilla JS | - | 프레임워크 미사용, 정적 사이트 |
| **백엔드** | Node.js + Express | 20.x | REST API 서버 |
| **데이터베이스** | MySQL | 8.0 | 사용자/인증 데이터 |
| **리버스 프록시** | Nginx | Alpine | API 프록시 + 보안 헤더 |
| **컨테이너** | Docker + Docker Compose | - | 서비스 오케스트레이션 |
| **호스팅** | Synology NAS | DSM 7.x | WebStation + Docker |
| **네트워크** | Tailscale | - | VPN 기반 외부 접속 |

### 주요 라이브러리 (Backend)

| 패키지 | 용도 |
|--------|------|
| `express` | HTTP 서버 프레임워크 |
| `mysql2` | MySQL 드라이버 (커넥션 풀) |
| `jsonwebtoken` | JWT 인증 토큰 |
| `bcrypt` | 비밀번호 해싱 |
| `helmet` | 보안 HTTP 헤더 |
| `cors` | 크로스 도메인 요청 허용 |
| `morgan` + `winston` | HTTP/앱 로깅 |
| `express-rate-limit` | API 요청 제한 |
| `dumb-init` | 컨테이너 PID 1 시그널 핸들링 |

---

## 운영 방식

| 구분 | 호스팅 | 설명 |
|------|--------|------|
| **front/** | NAS WebStation | 정적 HTML/CSS/JS 직접 서비스 |
| **back/** | Docker 컨테이너 | Express API 서버 (read-only 파일시스템) |
| **MySQL** | Docker 컨테이너 | 사용자/세션/프로필 데이터 저장 |
| **Nginx** | Docker 컨테이너 | /api/ 리버스 프록시 + 보안 헤더 |
| **data/** | Docker 볼륨 마운트 | 로그, 업로드, 캐시, 비공개 JSON |
| **infra/** | Docker Compose | 서비스 정의 + 스크립트 |
| **backup/** | NAS 로컬 | cron 기반 자동 백업 (30일 보관) |

---

## 네트워크 아키텍처

```
[사용자 브라우저]
       │
       ├── 정적 파일 (HTML/CSS/JS/JSON) ──→ [NAS WebStation] → front/
       │
       └── API 요청 (/api/*) ──→ [Nginx] ──→ [Backend] ──→ [MySQL :3306]
                                      │
                                 wararchive-net (Docker 내부 네트워크)
```

### Docker 컨테이너 구성

| 컨테이너 | 이미지 | 포트 | 메모리 제한 | 보안 설정 |
|-----------|--------|------|-------------|-----------|
| `wararchive-mysql` | `mysql:8.0` | (내부) | 512MB | `no-new-privileges` |
| `wararchive-backend` | 빌드 이미지 | (내부) | 256MB | `read_only`, `no-new-privileges` |
| `wararchive-nginx` | `nginx:alpine` |  | 128MB | `read_only`, `no-new-privileges` |

### 보안 설정

- **read_only 파일시스템**: backend, nginx 컨테이너는 읽기 전용
- **no-new-privileges**: 모든 컨테이너에서 권한 상승 차단
- **tmpfs**: /tmp 등 임시 디렉토리만 쓰기 가능
- **Nginx 보안 헤더**: X-Frame-Options, CSP, HSTS, X-Content-Type-Options 등
- **Rate Limiting**: 로그인 15분당 10회 제한, API 전역 제한
- **JWT 인증**: Bearer Token 기반, production 환경에서 JWT_SECRET 필수

---

## 관련 문서

- [실행 가이드](running.md) — Docker 실행 방법 및 접속 링크
- [배포 가이드](deploy.md) — 초기 배포 및 업데이트 절차
- [API 명세](api.md) — REST API 엔드포인트 상세
- [백업 가이드](backup.md) — 자동/수동 백업 및 복원
