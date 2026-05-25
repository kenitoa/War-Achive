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

---

# War Archive Update

작성일: 2026-05-25

## 구현 및 검증 요약

메인 화면을 `Archive Channel` 스타일로 재구성하고, 다크 모드, 섹션별 페이지네이션, 각 카테고리 페이지 공통 디자인, JSON 이미지 기반 카드 렌더링, Docker 크롤러 자동 반영 구조를 점검했다. 사용자가 요청한 "한 번 엄격하게 검증해줘. 실제로 반영되는지."까지의 검증 결과도 이 문서에 정리한다.

## 메인 화면 변경

- `front/index.html`
  - 고문서/아카이브 채널 느낌의 첫 화면으로 전면 개편했다.
  - 네비게이션을 `Home`, `Episodes`, `Timeline`, `Collections`, `About` 흐름으로 정리했다.
  - 다크 모드 버튼을 헤더에 추가했다.
  - 추천 기록, 역사 연표, 큐레이션 컬렉션, 필터 탐색 섹션을 구성했다.

- `front/assets/css/common/home_clean.css`
  - 새 메인 화면 레이아웃, 카드, 연표, 다크 모드 색상, 페이지네이션 스타일을 추가했다.
  - 카드 섹션과 상세 페이지에서 다크 모드일 때 어긋나던 밝은 배경/밝은 글자 조합을 정리했다.
  - 화면에서 글자 겹침과 과도한 크기 문제를 줄이도록 카드/헤더/섹션 치수를 조정했다.

- `front/assets/js/common/home_index.js`
  - 섹션별 페이지네이션을 추가했다.
  - 추천 카드와 컬렉션 카드가 JSON의 이미지 링크를 읽어 배경 이미지로 사용하도록 했다.
  - 검색/필터/추천/통계가 `front/data/search/*.json` 인덱스를 기준으로 동작하도록 유지했다.

## 카테고리 페이지 공통 디자인

- `front/assets/css/common/archive_common.css`
  - `front/pages` 하위 HTML이 메인 화면과 같은 아카이브 톤을 공유하도록 공통 스타일을 추가했다.
  - 상세 페이지의 섹션, 표, 스펙 테이블, 카드가 다크 모드에서 통일된 색상 체계를 쓰도록 정리했다.

- `front/assets/js/common/archive_pages.js`
  - 페이지별 다크 모드 초기화와 공통 동작을 묶었다.

- `front/pages/**/*.html`
  - 각 페이지에서 공통 디자인/스크립트를 읽도록 연결했다.

## JSON 이미지 반영

- `front/assets/js/common/generate-index.js`
  - 검색 인덱스를 만들 때 `image`, `coverImage`, `portrait`, `images[0].url`을 읽어 `image` 필드로 내보내도록 했다.

- `back/crowling/crowling_core/front_index.py`
  - 크롤러가 `front/data/search/*.json`을 다시 생성할 때도 이미지 필드가 사라지지 않도록 `first_image()` 추출 함수를 추가했다.
  - 지원 필드:
    - `image`
    - `coverImage`
    - `portrait`
    - `images[].url`
    - `images[].source_url`

## 크롤링 자동화 구조 확인

- `docker-compose.yml`
  - `history-crawler` 서비스가 Docker에서 `daemon` 모드로 실행되도록 구성되어 있음을 확인했다.
  - 기본 크롤링 설정:
    - `CRAWLING_HOURLY_LIMIT=5`
    - `CRAWLING_DAEMON_INTERVAL_SECONDS=3600`
    - `CRAWLING_FRONT_DATA_PATH=/app/front/data`
  - `CRAWLING_RECENT_ARTICLE_DAYS`는 코드에서 읽지 않는 이름이라 `CRAWLING_RECENT_DAYS`로 수정했다.

- `back/crowling/crowling_core/cli.py`
  - `daemon` 명령이 시작 즉시 아래 순서로 동작하는 것을 확인했다.
    - `crawler.run(limit=5, refine=True)`
    - `publish_front_data(...)`
    - `generate_front_search_indexes(...)`
    - `time.sleep(3600)`

## Docker 포트 설정 수정

NAS에서 `8080` 포트 충돌이 발생해 외부 호스트 포트를 `6279`로 쓰도록 정리했다.

수정 전 문제:

```yaml
ports:
  - "${WAR_ARCHIVE_PORT:-6279}:6279"
environment:
  PORT: 8080
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:6279/health"]
```

앱은 컨테이너 내부에서 `8080`으로 실행되는데 Docker가 내부 `6279`로 연결하고 있어 healthcheck와 포트 매핑이 맞지 않았다.

수정 후:

```yaml
ports:
  - "${WAR_ARCHIVE_PORT:-6279}:8080"
environment:
  PORT: 8080
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/health"]
```

Discord 봇의 컨테이너 내부 접근 주소도 내부 포트 기준으로 되돌렸다.

```yaml
WAR_ARCHIVE_HEALTH_URL: http://war-archive:8080/health
WAR_ARCHIVE_BASE_URL: http://war-archive:8080
```

Synology Reverse Proxy 대상은 다음과 같이 잡으면 된다.

```text
Source:
HTTPS / warachive.synology.me / 443

Destination:
HTTP / 127.0.0.1 / 6279
```

## 검증한 항목

### 검색 인덱스 재생성

명령:

```powershell
node front\assets\js\common\generate-index.js
```

결과:

```text
biography of people search.json: 21건
Battlefield Map search.json: 10건
war overview search.json: 17건
Historical Sources & Documents search.json: 16건
strategy and tactics search.json: 24건
weapons and equipment search.json: 26건
Undefine facts search.json: 26건
```

### 이미지 필드 반영 확인

검색 인덱스의 `image` 필드 존재 여부를 확인했다.

```text
Battlefield Map search.json: total=10, withImage=10
biography of people search.json: total=21, withImage=21
Historical Sources & Documents search.json: total=16, withImage=16
strategy and tactics search.json: total=24, withImage=24
war overview search.json: total=17, withImage=17
weapons and equipment search.json: total=26, withImage=26
Undefine facts search.json: total=26, withImage=0
```

`Undefine facts`는 원본 데이터에 이미지가 비어 있어 `withImage=0`이 정상이다. 다만 모든 항목에 `image` 속성 자체는 생성된다.

### 프론트 JS 문법 검사

명령:

```powershell
node --check front\assets\js\common\home_index.js
node --check front\assets\js\common\archive_pages.js
node --check front\assets\js\common\generate-index.js
```

결과:

```text
통과
```

### HTTP 정적 응답 확인

임시 Node HTTP 서버로 `front` 폴더를 열어 주요 리소스가 응답되는지 확인했다.

확인 대상:

```text
/
/assets/js/common/home_index.js
/assets/css/common/home_clean.css
/data/search/war overview search.json
/data/search/biography of people search.json
/data/search/Battlefield Map search.json
/data/search/weapons and equipment search.json
/data/search/Historical Sources & Documents search.json
/data/search/strategy and tactics search.json
/data/search/Undefine facts search.json
```

결과:

```text
모두 HTTP 200
```

### Docker Compose 설정 확인

명령:

```powershell
docker compose config --format json
```

확인 결과:

```text
history-crawler 서비스 존재
CRAWLING_HOURLY_LIMIT=5
CRAWLING_DAEMON_INTERVAL_SECONDS=3600
CRAWLING_FRONT_DATA_PATH=/app/front/data
war-archive 포트 매핑: published=6279, target=8080
war-archive healthcheck: http://127.0.0.1:8080/health
```

## 실제 컨테이너 실행 검증 제한

로컬 Windows 환경에서는 Docker daemon이 실행 중이 아니어서 실제 컨테이너 기동까지는 검증하지 못했다.

실패 메시지:

```text
failed to connect to the docker API at npipe:////./pipe/docker_engine
The system cannot find the file specified.
```

따라서 로컬에서 완료한 검증 범위는 다음과 같다.

- Compose 구성 해석
- 프론트 인덱스 재생성
- 이미지 필드 유지 확인
- JS 문법 검사
- 정적 HTTP 응답 확인
- 크롤러 daemon 코드 경로 확인

NAS에서는 다음 명령으로 실제 실행 상태를 확인해야 한다.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f war-archive
docker compose logs -f history-crawler
```

## 배포 과정에서 확인한 네트워크 이슈

`warachive.synology.me`를 Synology DDNS 테스트 도메인으로 사용하려 했다. ASUS GS-BE7200X 공유기의 WAN IP가 `192.x.x.x`이고 외부 IP 확인 사이트의 공인 IP가 `110.x.x.x`로 달라 이중 NAT 상태임을 확인했다.

의미:

```text
인터넷
→ KT 장비, 공인 IP 110.x.x.x
→ ASUS 공유기, WAN IP 192.x.x.x
→ Synology NAS
```

해결 방향:

- KT 장비를 브릿지 모드로 변경
- 또는 KT 장비에서 ASUS WAN IP로 `80`, `443`을 포트포워딩
- 또는 독립 도메인 구매 후 Cloudflare Tunnel 사용

## 현재 권장 운영 설정

`.env`는 프로젝트 루트, 즉 `docker-compose.yml`과 같은 폴더에 `.env` 이름으로 둔다.

중요 환경변수:

```env
WAR_ARCHIVE_PORT=6279
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SECRET=긴_랜덤_문자열
ADMIN_EMAIL=관리자_이메일
ADMIN_PASSWORD=강한_관리자_비밀번호
WAR_ARCHIVE_PUBLIC_URL=https://warachive.synology.me
```

기본값 `admin/admin`, `change-this-war-archive-secret` 상태로 외부 공개하면 안 된다.
# War Archive Update

작성일: 2026-05-25

## Netlify / NAS 역할 분리

이번 작업의 핵심은 Netlify와 NAS가 같은 full-stack 복사본처럼 보이지 않도록 목적을 명확히 나누는 것이었다.

- `netlify/front`
  - 프론트엔드 전용 배포 위치로 정리했다.
  - HTML, CSS, JS, 이미지 등 화면 파일만 담당한다.
  - `netlify/front/data`는 제거했고, Netlify는 자체 JSON 원본을 들고 있지 않는다.

- `NAS/back`
  - 백엔드 전용으로 정리했다.
  - 더 이상 `index.html` 같은 프론트 화면을 서빙하지 않는다.
  - 담당 라우트는 `/health`, `/api/auth/*`, `/data/*`로 제한했다.

- `NAS/back/crowling`
  - 크롤러 전용으로 유지했다.
  - 크롤러가 생성하거나 갱신하는 공개 JSON은 `NAS/data`에 쓰도록 정리했다.

- `NAS/data`
  - NAS가 소유하는 데이터 원본 위치로 분리했다.
  - 검색 인덱스와 상세 JSON을 이 폴더에서 관리한다.

## Netlify와 NAS 연결 방식

사용자는 `https://knowtowars.netlify.app`에 접속하고, 프론트는 같은 origin 기준의 상대 경로를 호출한다.

```text
/api/auth/* -> NAS backend
/data/*     -> NAS data endpoint
```

`netlify/netlify.toml`에는 다음 역할의 프록시를 둔다.

```toml
[[redirects]]
  from = "/api/auth/*"
  to = "https://warachive.synology.me/api/auth/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/data/*"
  to = "https://warachive.synology.me/data/:splat"
  status = 200
  force = true
```

프론트 JS는 NAS 주소를 직접 호출하지 않고 `/api/auth/*`, `/data/*`만 호출한다. 로그인 쿠키도 Netlify 도메인 흐름에서 유지되도록 하기 위한 구조다.

## NAS Docker 설정 변경

`NAS/docker-compose.yml`은 더 이상 `./front`를 backend에 마운트하지 않는다.

- backend:
  - `DATA_DIR=/app/data`
  - `./data:/app/data:ro`

- crawler:
  - `CRAWLING_FRONT_DATA_PATH=/app/public-data`
  - `./data:/app/public-data`

- discord bot:
  - `FRONT_DATA_DIR=/app/data`
  - `./data:/app/data:ro`

즉 backend는 `NAS/data`를 읽고, crawler는 같은 `NAS/data`를 갱신한다.

## NAS backend 변경

- `NAS/back/server.js`
  - 프론트 정적 파일 서빙 로직을 제거했다.
  - HTML 자동 주입 로직을 제거했다.
  - `/` 요청에는 backend 정보와 사용 가능한 라우트만 JSON으로 반환하도록 했다.
  - `/data/*` 요청은 `DATA_DIR` 아래 파일만 안전하게 읽도록 했다.
  - `/health`에는 backend 상태, frontend origin, data directory 정보를 포함했다.

- `NAS/back/Dockerfile`
  - `COPY front ./front`를 제거했다.
  - `COPY data ./data`와 `DATA_DIR=/app/data` 기준으로 변경했다.

- `NAS/back/package.json`
  - 설명을 static backend가 아니라 API/data backend에 맞게 수정했다.

## Cookie secret 생성기 추가

`AUTH_COOKIE_SECRET`에 사용할 랜덤 문자열 생성기를 추가했다.

- `NAS/back/generate-cookie-secret.js`
  - Node 기본 `crypto.randomBytes`를 사용한다.
  - 기본 64 bytes를 `base64url` 문자열로 출력한다.
  - 외부 패키지 없이 실행된다.

실행:

```powershell
npm.cmd --prefix NAS\back run secret --silent
```

출력값은 `NAS/.env`의 `AUTH_COOKIE_SECRET`에 넣는다.

## Tailscale Funnel 사용 방향

이중 NAT 때문에 `warachive.synology.me`를 직접 NAS로 연결하기 어렵다면 Tailscale Funnel을 NAS backend 공개 주소로 사용할 수 있다.

NAS에서 backend가 `127.0.0.1:6279`로 동작 중일 때:

```bash
sudo tailscale funnel --bg --https=443 http://127.0.0.1:6279
tailscale funnel status
```

Funnel 주소가 예를 들어 다음처럼 나온다면:

```text
https://nas-device.tailnet-name.ts.net
```

`netlify/netlify.toml`의 프록시 대상만 이 주소로 바꾸면 된다.

```toml
[[redirects]]
  from = "/api/auth/*"
  to = "https://nas-device.tailnet-name.ts.net/api/auth/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/data/*"
  to = "https://nas-device.tailnet-name.ts.net/data/:splat"
  status = 200
  force = true
```

사용자는 계속 `https://knowtowars.netlify.app`만 접속한다.

## 검증한 항목

- `netlify/front/index.html` 존재 확인
- `netlify/front/data` 제거 확인
- `NAS/front` 제거 확인
- `NAS/data` 존재 확인
- `NAS/back/server.js` 존재 확인
- `NAS/back/crowling` 존재 확인
- `NAS/data/search/*.json` 총 140건 정상 파싱 확인
- `NAS/data` 전체 JSON 147개 파싱 확인
- BOM이 있던 JSON 100개를 표준 UTF-8 JSON으로 정리
- `node --check NAS/back/server.js` 통과
- `node --check NAS/discord-Bot/bot.js` 통과
- `node --check netlify/front/assets/js/common/home_index.js` 통과
- `node --check netlify/front/assets/js/common/auth.js` 통과
- `docker compose -f NAS/docker-compose.yml config --services` 통과

Docker 명령에서는 Windows Docker 설정 파일 접근 경고가 출력되었지만, Compose 설정 해석 자체는 성공했다.

## 현재 운영 체크 순서

NAS 또는 Funnel 배포 후 다음 순서로 확인한다.

```text
1. NAS Docker 실행
2. NAS backend /health 확인
3. NAS backend /data/search/war%20overview%20search.json 확인
4. Netlify 배포
5. https://knowtowars.netlify.app/data/search/war%20overview%20search.json 확인
6. https://knowtowars.netlify.app 에서 로그인 테스트
```

이 순서가 통과하면 Netlify는 프론트만 담당하고, NAS는 로그인/API/크롤러/JSON 데이터를 담당하는 구조가 된다.

---
