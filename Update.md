# War Archive Update

작성일: 2026-05-13

## 구현 요약

War Archive에 로그인 기능, MySQL 기반 사용자 데이터 관리, 로그인 모달, 로그인 후 Mypage 진입 버튼, Mypage 기본 화면을 추가했다.

## 백엔드 변경

- `back/server.js`
  - Node 기본 `http` 서버에 인증 API를 추가했다.
  - 추가된 API:
    - `POST /api/auth/register`
    - `POST /api/auth/login`
    - `POST /api/auth/logout`
    - `GET /api/auth/me`
  - MySQL 연결 풀을 추가했다.
  - 서버 시작 또는 인증 API 호출 시 인증 테이블을 자동 생성한다.
  - 생성/보강되는 테이블:
    - `users`
    - `user_sessions`
  - 기존 DB에 `role` 컬럼이 없으면 자동으로 추가한다.
  - 비밀번호는 `crypto.pbkdf2Sync`로 해시해서 저장한다.
  - 세션은 `wa_session` HttpOnly 쿠키로 관리한다.
  - DB에는 세션 원문 토큰이 아니라 HMAC-SHA256 해시만 저장한다.
  - `/mypage`, `/mypage.html` 요청을 `front/pages/account/mypage.html`로 연결한다.
  - 백엔드가 HTML 파일을 제공할 때 공통 인증 CSS/JS를 자동 주입한다.

- `back/package.json`
  - MySQL 드라이버 `mysql2` 의존성을 추가했다.

- `back/package-lock.json`
  - Docker/NAS 환경에서 동일한 의존성 버전을 설치할 수 있도록 lock 파일을 추가했다.

- `back/Dockerfile`
  - `npm ci --omit=dev`로 의존성을 설치하도록 변경했다.

## Docker 및 환경변수 변경

- `docker-compose.yml`
  - `mysql:8.4` 서비스를 추가했다.
  - `war-archive` 서비스가 MySQL healthcheck 이후 시작되도록 설정했다.
  - MySQL 데이터는 `war-archive-mysql-data` 볼륨에 저장된다.
  - 백엔드 컨테이너에 MySQL 및 인증 환경변수를 전달한다.

- `.env.example`
  - 다음 환경변수 예시를 추가했다.
    - `MYSQL_PORT`
    - `MYSQL_DATABASE`
    - `MYSQL_USER`
    - `MYSQL_PASSWORD`
    - `MYSQL_ROOT_PASSWORD`
    - `AUTH_COOKIE_SECRET`
    - `AUTH_COOKIE_SECURE`
    - `ADMIN_NAME`
    - `ADMIN_EMAIL`
    - `ADMIN_PASSWORD`

## 테스트 관리자 계정

테스트 편의를 위해 서버 시작 시 관리자 계정이 자동 생성 또는 갱신되도록 했다.

- 이름: `admin`
- 이메일/로그인 ID: `admi`
- 비밀번호: `admin`
- 권한: `admin`

현재 테스트 요구사항에 맞춰 이메일 형식이 아니어도 로그인 ID로 사용할 수 있게 검증을 완화했다.

## 프론트엔드 변경

- `front/assets/css/common/auth.css`
  - 로그인 버튼, Mypage 버튼, Logout 버튼 스타일을 추가했다.
  - 로그인 모달 스타일을 추가했다.
  - Mypage 기본 화면 스타일을 추가했다.
  - 네비게이션 바 안에 Login/Mypage/Logout이 표시되도록 `.nav-links` 전용 스타일을 추가했다.

- `front/assets/js/common/auth.js`
  - 로그인 상태 확인을 위해 `/api/auth/me`를 호출한다.
  - 로그인 전에는 네비게이션 바에 `Login` 버튼을 표시한다.
  - 로그인 후에는 네비게이션 바에 사용자 이름, `Mypage`, `Logout`을 표시한다.
  - 로그인 모달을 동적으로 생성한다.
  - 로그인/회원가입/로그아웃 요청을 처리한다.
  - Mypage 화면에 계정 정보를 렌더링한다.

- `front/pages/account/mypage.html`
  - Mypage 기본 페이지를 추가했다.
  - 로그인하지 않은 경우 로그인 필요 안내를 표시한다.
  - 로그인한 경우 이름, 이메일/로그인 ID, 가입일, 기본 메뉴 영역을 표시한다.

- `front/index.html`
  - Go Live 같은 정적 서버에서도 로그인 버튼과 모달 UI가 보이도록 `auth.css`, `auth.js`를 직접 연결했다.

## 실행 및 테스트 방법

### UI만 확인하는 경우

VS Code `Go Live`로 `front/index.html`을 열면 로그인 버튼과 로그인 모달 UI는 확인할 수 있다.

단, Go Live는 정적 파일 서버이므로 실제 로그인 API와 MySQL 연동은 동작하지 않는다.

### 실제 로그인까지 확인하는 경우

Docker 또는 NAS 배포 환경에서 백엔드와 MySQL을 함께 실행해야 한다.

```powershell
docker compose up --build -d
```

접속 주소:

```text
http://localhost:8080/
```

테스트 로그인:

```text
이메일/로그인 ID: admi
비밀번호: admin
```

Mypage:

```text
http://localhost:8080/mypage
```

## 검증한 항목

- `npm.cmd run check`
  - `back/server.js` 문법 검사 통과
- `node --check front\assets\js\common\auth.js`
  - 프론트 인증 스크립트 문법 검사 통과
- `docker compose config --services`
  - 서비스 목록 해석 통과
  - 확인된 서비스:
    - `mysql`
    - `war-archive`
    - `history-crawler`

## 현재 주의사항

- 현재 로컬 PC에서는 Docker daemon이 실행 중이 아니어서 실제 컨테이너 구동 테스트는 완료하지 못했다.
- `Go Live`에서는 UI만 확인 가능하고, 실제 로그인은 `http://localhost:8080/` 백엔드 주소에서 확인해야 한다.
- NAS 배포 시 `.env`에는 `.env.example` 값을 그대로 쓰지 말고 `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `AUTH_COOKIE_SECRET`을 실제 값으로 바꾸는 것이 좋다.
