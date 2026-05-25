# War Archive

## Deployment layout

This repository is split into two deploy packages:

- `netlify/`: Netlify project root. Deploy this with base directory `netlify` and publish directory `front`.
- `NAS/`: Docker Compose project root. Upload this folder to the NAS/VPS and run `docker compose up -d --build` inside that folder.

Public frontend URL:

```text
https://knowtowars.netlify.app
```

Important: `knowtowars.netlify.app` is the browser-facing Netlify URL. The API proxy target in `netlify/netlify.toml` must be the public NAS backend origin, not the Netlify URL itself.

Path note:

- Browser UI source: `netlify/front`
- NAS Docker backend and crawler source: `NAS/back`
- NAS crawler live data: `NAS/front/data`
- Optional Discord bot source: `NAS/discord-Bot`

War Archive는 전쟁사 자료를 모아 검색하고 탐색하는 디지털 아카이브입니다. 전쟁 개요, 인물, 전투, 무기와 장비, 사료, 전략과 전술, 검증 전 자료를 하나의 홈페이지에서 볼 수 있도록 구성했습니다.

현재 화면은 고문서와 기록 채널 분위기의 `Archive Channel` 디자인을 사용합니다. 메인 페이지는 추천 기록, 시대 연표, 큐레이션 컬렉션, 필터 탐색을 제공하고, 각 상세 페이지는 같은 디자인 톤과 다크 모드를 공유합니다.

## 주요 기능

- 통합 검색: `front/data/search/*.json` 인덱스를 읽어 모든 카테고리 자료를 검색합니다.
- 카테고리 탐색: 전쟁, 인물, 전투, 무기, 사료, 전략, 미확인 자료를 구분해 볼 수 있습니다.
- 추천 카드: JSON 데이터의 이미지 링크를 읽어 카드 배경으로 표시합니다.
- 페이지네이션: 메인 화면의 주요 섹션은 좌우 넘김 방식으로 탐색합니다.
- 다크 모드: 메인 화면과 각 페이지의 카드, 표, 상세 콘텐츠 색상을 다크 테마에 맞춥니다.
- 자동 크롤링: Docker의 `history-crawler` 서비스가 주기적으로 자료를 수집하고 `front/data` 및 검색 인덱스를 갱신합니다.
- 로그인/마이페이지: Node 백엔드와 MySQL 기반 인증 기능을 포함합니다.

## 화면 구성

첫 화면은 `front/index.html`입니다.

- Hero: 검색, 추천 키워드, Archive Channel 스타일 메인 비주얼
- 수록 현황: 전쟁 기록, 전체 자료, 인물 기록, 전투 기록 자동 집계
- 추천 기록: 카테고리별 대표 자료 카드
- 역사 연표: 시대별 빠른 이동
- 큐레이션 컬렉션: 자료 유형별 카테고리 카드
- 필터 탐색: 시대, 지역, 자료 유형, 신뢰도 기준 탐색

## 자료 카테고리

| 카테고리 | 경로 | 설명 |
|---|---|---|
| 전쟁 개요 | `front/data/war overview data` | 주요 전쟁의 원인, 전개, 결과 |
| 인물 열전 | `front/data/biography of people data` | 지휘관, 정치 지도자, 전략가 |
| 전장 지도 | `front/data/Battlefield Map data` | 전투 위치, 지휘관, 전개, 결과 |
| 무기 & 장비 | `front/data/weapons and equipment data` | 항공기, 기갑, 화기, 해군 장비 등 |
| 사료 & 문서 | `front/data/Historical Sources & Documents data` | 조약, 명령서, 연설, 증언 |
| 전략 & 전술 | `front/data/strategy and tactics data` | 작전술, 병법, 전술 개념 |
| 미확인 자료집 | `front/data/Undefine facts data` | 논쟁 자료, 구전, 미확인 문서 |

## 데이터 흐름

```text
history-crawler
→ 원문 수집
→ SQLite 저장
→ 카테고리별 JSON으로 재구성
→ front/data에 게시
→ front/data/search/*.json 인덱스 재생성
→ index.html과 각 페이지가 fetch로 읽음
```

메인 카드 이미지는 각 JSON의 다음 필드 중 가능한 값을 사용합니다.

```text
image
coverImage
portrait
images[0].url
```

## 실행 방법

### Docker로 실행

`NAS/` 폴더에서 실행합니다.

```bash
cd NAS
docker compose up -d --build
```

기본 외부 포트는 `6279`입니다.

```text
http://localhost:6279
```

컨테이너 내부의 웹 서버는 `8080`에서 실행되고, Docker가 호스트 `6279`를 내부 `8080`으로 연결합니다.

```yaml
ports:
  - "${WAR_ARCHIVE_PORT:-6279}:8080"
```

### 환경 변수

외부 공개 환경에서는 프로젝트 루트에 `.env` 파일을 두고 기본 계정과 시크릿을 반드시 바꿔야 합니다.

```env
WAR_ARCHIVE_PORT=6279

MYSQL_DATABASE=war_archive
MYSQL_USER=war_archive
MYSQL_PASSWORD=change-this-db-password
MYSQL_ROOT_PASSWORD=change-this-root-password

AUTH_COOKIE_SECRET=change-this-long-random-secret
AUTH_COOKIE_SECURE=true
ADMIN_NAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-admin-password
```

`.env`는 `.gitignore`에 포함되어 있어 저장소에 올리지 않습니다.

## Synology 배포

Synology NAS에서 Docker Compose로 서비스를 올린 뒤 Reverse Proxy를 사용합니다.

```text
Source:
HTTPS / warachive.synology.me / 443

Destination:
HTTP / 127.0.0.1 / 6279
```

전체 흐름은 다음과 같습니다.

```text
https://warachive.synology.me
→ Synology Reverse Proxy 443
→ 127.0.0.1:6279
→ Docker war-archive 컨테이너 내부 8080
```

공유기에서 직접 열어야 하는 포트는 일반적으로 `80`, `443`입니다. `6279`는 외부에 직접 열지 않고 Synology 내부 Reverse Proxy 대상 포트로만 사용합니다.

KT 장비 뒤에 ASUS 공유기가 있는 환경처럼 ASUS WAN IP가 `192.x.x.x`이고 공인 IP가 다른 경우에는 이중 NAT 상태입니다. 이 경우 KT 장비를 브릿지 모드로 바꾸거나, KT 장비에서 ASUS WAN IP로 `80`, `443`을 한 번 더 포트포워딩해야 합니다.

## 크롤러

`history-crawler` 서비스는 Docker에서 자동 실행됩니다.

기본 설정:

```text
CRAWLING_HOURLY_LIMIT=5
CRAWLING_DAEMON_INTERVAL_SECONDS=3600
CRAWLING_FRONT_DATA_PATH=/app/front/data
```

동작:

```text
컨테이너 시작
→ 즉시 최대 5개 페이지 크롤링
→ front/data에 게시
→ 검색 인덱스 재생성
→ 3600초 대기
→ 반복
```

로그 확인:

```bash
docker compose -f NAS/docker-compose.yml logs -f history-crawler
```

## 검색 인덱스 수동 재생성

프론트 JSON 인덱스만 수동으로 다시 만들 때는 Node.js 스크립트를 사용합니다.

```bash
node netlify/front/assets/js/common/generate-index.js
```

문법 확인:

```bash
node --check netlify/front/assets/js/common/home_index.js
node --check netlify/front/assets/js/common/archive_pages.js
node --check netlify/front/assets/js/common/generate-index.js
```

## 폴더 구조

```text
.
├── README.md
├── Update.md
├── netlify/
│   ├── netlify.toml
│   └── front/
│       ├── index.html
│       ├── assets/
│       ├── data/
│       └── pages/
└── NAS/
    ├── docker-compose.yml
    ├── back/
    ├── discord-Bot/
    └── front/
```

## 운영 전 체크리스트

- `.env`를 프로젝트 루트에 배치했는지 확인
- `ADMIN_PASSWORD`, `AUTH_COOKIE_SECRET`, MySQL 비밀번호 변경
- `AUTH_COOKIE_SECURE=true` 설정
- `docker compose -f NAS/docker-compose.yml config`로 포트와 환경변수 확인
- `http://NAS_IP:6279/health` 내부 접속 확인
- Synology Reverse Proxy `443 → 127.0.0.1:6279` 설정
- Let's Encrypt 인증서 연결
- `docker compose -f NAS/docker-compose.yml logs -f war-archive`와 `history-crawler` 로그 확인
