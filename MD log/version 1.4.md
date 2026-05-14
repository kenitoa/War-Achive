# version 1.4

## 로그인과 MySQL 기반 사용자 관리가 추가된 버전

`version 1.4`는 기존 정적 아카이브 중심 구조에 사용자 인증 기능을 붙인 버전입니다. `version 1.3`이 화면 디자인과 카테고리별 탐색 경험을 정리한 버전이었다면, 이번 버전은 Docker/NAS 실행 환경에서 실제 계정 데이터를 MySQL로 관리하고 로그인 이후 개인 페이지로 이동할 수 있는 기본 흐름을 구현한 것이 핵심입니다.

이번 버전의 목표는 "War Archive를 단순 정적 사이트에서 로그인 가능한 웹 서비스 형태로 확장하는 것"입니다.

## 이번 버전의 성격

- MySQL 기반 로그인 기능 추가 버전
- Docker Compose에서 웹 서버와 MySQL을 함께 실행하는 버전
- 로그인 모달과 네비게이션 바 로그인 버튼이 추가된 버전
- 로그인 이후 `Mypage` 버튼과 기본 Mypage 화면이 추가된 버전
- 테스트 관리자 계정이 자동 생성되는 버전
- Go Live UI 확인과 Docker 실제 로그인 테스트 경로가 구분된 버전

## 주요 변경 사항

### 1. 백엔드 인증 API 추가

`back/server.js`에 인증 API가 추가되었습니다.

추가된 API는 다음과 같습니다.

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

기존 백엔드는 정적 파일 제공이 중심이었지만, 이번 버전부터는 사용자 계정 생성, 로그인, 로그아웃, 현재 로그인 상태 확인을 처리할 수 있습니다.

### 2. MySQL 데이터 관리 추가

사용자 데이터와 세션 데이터는 MySQL로 관리합니다.

자동 생성 또는 보강되는 테이블은 다음과 같습니다.

- `users`
- `user_sessions`

`users` 테이블에는 사용자 이름, 이메일 또는 로그인 ID, 권한, 비밀번호 해시가 저장됩니다. `user_sessions` 테이블에는 로그인 세션 토큰의 해시값과 만료 시간이 저장됩니다.

비밀번호는 원문으로 저장하지 않고 Node `crypto.pbkdf2Sync`를 사용해 해시 처리합니다. 세션 쿠키도 원문 토큰을 DB에 저장하지 않고 HMAC-SHA256 해시로 저장합니다.

### 3. Docker Compose에 MySQL 서비스 추가

`docker-compose.yml`에 `mysql:8.4` 서비스가 추가되었습니다.

주요 구성은 다음과 같습니다.

- `mysql` 컨테이너 추가
- `war-archive` 컨테이너가 MySQL healthcheck 이후 시작되도록 설정
- MySQL 데이터 볼륨 `war-archive-mysql-data` 추가
- 백엔드 컨테이너에 MySQL 연결 환경변수 전달

이제 Docker 또는 NAS 환경에서는 아래 명령으로 웹 서버와 MySQL을 함께 실행할 수 있습니다.

```powershell
docker compose up --build -d
```

### 4. 로그인 모달과 네비게이션 버튼 추가

`front/assets/js/common/auth.js`와 `front/assets/css/common/auth.css`가 추가되었습니다.

주요 동작은 다음과 같습니다.

- 로그인 전 네비게이션 바에 `Login` 버튼 표시
- `Login` 버튼 클릭 시 로그인 모달 표시
- 로그인 성공 시 사용자 이름, `Mypage`, `Logout` 표시
- 로그아웃 시 다시 `Login` 버튼 상태로 복귀

처음에는 백엔드가 HTML 응답에 인증 CSS/JS를 자동 주입하도록 구성했지만, VS Code Go Live에서도 UI가 바로 보이도록 `front/index.html`에 `auth.css`, `auth.js`를 직접 연결했습니다.

### 5. Mypage 기본 화면 추가

`front/pages/account/mypage.html` 파일이 추가되었습니다.

Mypage에서는 다음 내용을 표시합니다.

- 로그인하지 않은 경우 로그인 필요 안내
- 로그인한 경우 계정 정보
  - 이름
  - 이메일 또는 로그인 ID
  - 가입일
- 이후 저장한 자료, 열람 기록, 기여 내역 등을 확장할 수 있는 기본 메뉴 영역

백엔드에서는 `/mypage`, `/mypage.html` 요청을 모두 Mypage HTML로 연결합니다.

### 6. 테스트 관리자 계정 추가

테스트 편의를 위해 서버 시작 시 관리자 계정이 자동 생성 또는 갱신되도록 했습니다.

테스트 관리자 계정은 다음과 같습니다.

- 이름: `admin`
- 이메일/로그인 ID: `admi`
- 비밀번호: `admin`
- 권한: `admin`

이번 버전에서는 테스트 요구사항에 맞춰 `admi`처럼 이메일 형식이 아닌 값도 로그인 ID로 허용합니다. 비밀번호도 테스트 계정 `admin`을 사용할 수 있도록 최소 길이를 4자로 완화했습니다.

## version 1.3과의 차이

`version 1.3`은 화면 디자인, 카테고리 정리, 공통 CSS 구조, 검색/탐색 경험 정리에 집중한 프론트엔드 중심 버전이었습니다.

`version 1.4`는 그 위에 실제 서비스 기능을 얹은 버전입니다.

가장 큰 차이는 다음과 같습니다.

- `version 1.3`: 정적 아카이브 화면 중심
- `version 1.4`: 로그인 가능한 웹 서비스 구조 추가
- `version 1.3`: 프론트엔드 화면 정리와 인덱스 탐색 강화
- `version 1.4`: 백엔드 인증 API와 MySQL 저장소 추가
- `version 1.3`: 사용자 계정 개념 없음
- `version 1.4`: 사용자 계정, 관리자 계정, 세션 쿠키, Mypage 흐름 추가
- `version 1.3`: Docker/NAS 실행 구조는 웹 제공 중심
- `version 1.4`: Docker Compose에서 MySQL까지 함께 실행하는 구조

즉, `version 1.4`는 단순한 UI 수정 버전이 아니라 War Archive가 사용자별 기능을 가질 수 있도록 백엔드와 데이터베이스 기반을 만든 버전입니다.

## 주요 파일

- `back/server.js`: 인증 API, MySQL 연결, 세션 처리, Mypage 라우팅
- `back/package.json`: `mysql2` 의존성 추가
- `back/package-lock.json`: 의존성 잠금 파일 추가
- `back/Dockerfile`: `npm ci --omit=dev` 기반 빌드로 변경
- `docker-compose.yml`: MySQL 서비스 및 백엔드 환경변수 추가
- `.env.example`: MySQL, 인증, 관리자 계정 환경변수 추가
- `front/assets/css/common/auth.css`: 로그인 UI, 모달, Mypage 스타일
- `front/assets/js/common/auth.js`: 로그인 상태 확인, 모달, 로그인/로그아웃 처리
- `front/pages/account/mypage.html`: Mypage 기본 화면
- `front/index.html`: Go Live에서도 인증 UI가 보이도록 인증 CSS/JS 직접 연결
- `Update.md`: 이번 작업 전체 요약 문서

## 실행 방식 차이

### Go Live

Go Live로 `front/index.html`을 열면 로그인 버튼과 로그인 모달 UI는 확인할 수 있습니다.

하지만 Go Live는 정적 파일 서버이므로 실제 로그인 API와 MySQL 연동은 동작하지 않습니다.

### Docker 또는 NAS 실행

실제 로그인, 세션, MySQL 저장, Mypage 확인은 Docker 또는 NAS 백엔드 주소에서 해야 합니다.

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

## 검증

이번 버전에서 확인한 명령은 다음과 같습니다.

- `npm.cmd run check`
- `node --check front\assets\js\common\auth.js`
- `docker compose config --services`

확인된 Docker Compose 서비스는 다음과 같습니다.

- `mysql`
- `war-archive`
- `history-crawler`

현재 로컬 PC에서는 Docker daemon이 실행 중이 아니어서 실제 컨테이너 구동 테스트는 완료하지 못했습니다. 다만 Compose 설정 해석과 Node 문법 검사는 통과했습니다.

## 기록

- 버전: `version 1.4`
- 작성일: 2026-05-13
- 주요 방향: 로그인 기능, MySQL 사용자 관리, 관리자 테스트 계정, Mypage 기본 화면, Docker/NAS 실행 기반 강화
- 테스트 관리자 계정: `admin / admi / admin`
