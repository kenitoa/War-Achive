# 전쟁 역사 아카이브 필수 설정

이 문서는 실제 운영 전에 사용자가 값을 입력하거나 GitHub·NAS에서 설정해야 하는 항목만 정리합니다. 실제 토큰 값은 이 문서나 Git 저장소에 기록하지 마세요.

## 입력해야 하는 값 요약

| 위치 | 이름 | 필수 | 입력 예시 |
| --- | --- | --- | --- |
| NAS `back/.env` | `GITHUB_FRONT_REPOSITORY` | 기본값 설정됨 | `kenitoa/warsachive` |
| NAS `back/.env` | `GITHUB_FRONT_TOKEN` | 필수·비밀 | `github_pat_...` |
| NAS `back/.env` | `WAR_ARCHIVE_ADMIN_TOKEN` | 필수·비밀 | 24자 이상 임의 문자열 |
| GitHub Actions 변수 | `SITE_URL` | 필수 | `https://kenitoa.github.io/warsachive` |
| NAS `back/.env` | `GITHUB_FRONT_REF` | 선택 | `main` |
| NAS `back/.env` | `GITHUB_FRONT_CONTENT_PATH` | 선택 | `web/content/archive.json` |
| NAS `back/.env` | `PROCESSING_DELAY_MS` | 선택 | `600000` |
| NAS `back/.env` | `PUBLICATION_MIN_QUALITY_SCORE` | 선택 | `0.6` |
| NAS `back/.env` | `DISCORD_BOT_TOKEN` | 선택·비밀 | Discord bot token |
| NAS `back/.env` | `DISCORD_CHANNEL_ID` | Discord bot 사용 시 필수 | 대상 채널 ID |
| 로컬 실행 | `WAR_ARCHIVE_FRONT_ARCHIVE_PATH` | 로컬 검증 시 선택 | `../front/web/content/archive.json` |
| 로컬 `front/.env.local` | `NEXT_PUBLIC_SITE_URL` | 로컬 빌드 시 선택 | `https://kenitoa.github.io/warsachive` |

백엔드 API 주소, 백엔드 도메인, `API_BASE_URL`, CORS, HTTPS 인증서와 포트 포워딩 값은 입력하지 않습니다.

## 로컬 폴더에서 실제 반영 확인

NAS와 GitHub 토큰 없이 현재 폴더에서 수집·정보화·공개 JSON 반영을 한 번 검증하려면 다음을 실행합니다.

```powershell
cd back
npm run local:sync
```

이 명령은 `back/.local-data`에 처리 상태를 저장하고 `front/web/content/archive.json`에 새 공개 기록을 누적합니다. 같은 기록 ID가 이미 있으면 중복 추가하지 않습니다.

## 1. front GitHub 저장소 만들기

- [x] GitHub front 저장소는 `kenitoa/warsachive`를 사용합니다.
- [x] 로컬 `front`의 원격은 `https://github.com/kenitoa/warsachive.git`로 연결했습니다.
- [x] 로컬 `front` 변경을 `main`에 push했습니다. 최초 게시 커밋: `3b36ed2`
- [x] GitHub에서 `.github/workflows/pages.yml` 경로를 확인했습니다.
- [x] GitHub에서 `web/content/archive.json` 경로를 확인했습니다.
- [ ] 기본 브랜치를 `main`으로 설정합니다.

저장소 이름 예시:

```text
GitHub 사용자명: kenitoa
front 저장소: warsachive
저장소 전체 이름: kenitoa/warsachive
```

## 2. GitHub Pages 설정

먼저 이 PC의 만료된 GitHub CLI 인증을 갱신합니다.

```powershell
gh auth login -h github.com
gh auth status
```

`gh auth status`에서 `kenitoa` 계정이 정상으로 표시된 후 `front`의 최초 commit과 push를 진행해야 합니다. NAS에서 사용할 Fine-grained token은 이 CLI 로그인과 별도로 4번에서 발급합니다.

front 저장소에서 다음 메뉴로 이동합니다.

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

- [x] Source를 `GitHub Actions`로 설정했습니다.
- [x] `Deploy front to GitHub Pages` 워크플로의 build와 deploy 성공을 확인했습니다.

## 3. SITE_URL 설정

front 저장소에서 다음 메뉴로 이동합니다.

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
```

변수 이름:

```text
SITE_URL
```

프로젝트 Pages 저장소라면 값은 다음과 같습니다.

```text
https://kenitoa.github.io/warsachive
```

저장소 이름 자체가 `username.github.io`인 사용자 Pages라면 다음과 같습니다.

```text
https://username.github.io
```

- [x] `SITE_URL=https://kenitoa.github.io/warsachive`를 등록했습니다.
- [ ] 브라우저에서 실제로 사용할 최종 Pages 주소와 정확히 일치시키세요.

## 4. GitHub Fine-grained token 만들기

GitHub 계정에서 다음 메뉴로 이동합니다.

```text
Settings
→ Developer settings
→ Personal access tokens
→ Fine-grained tokens
→ Generate new token
```

다음과 같이 설정합니다.

- [ ] Resource owner: front 저장소 소유자
- [ ] Repository access: `Only select repositories`
- [ ] 선택 저장소: front 저장소 하나
- [ ] Repository permissions → Contents: `Read and write`
- [ ] 만료일 설정
- [ ] 토큰 생성 후 암호 관리자에 저장

필요하지 않은 권한:

- Actions 쓰기
- Workflows 쓰기
- Administration 쓰기
- Pages 쓰기

NAS는 이 토큰으로 `kenitoa/warsachive` 저장소의 `web/content/archive.json`만 읽고 갱신합니다. 이 토큰은 1시간 발행 주기마다 공개 기록을 누적 커밋하는 필수 운영 설정입니다. 토큰 흐름을 제거하지 말고, 실제 값이 외부에 노출된 경우에만 새 토큰을 발급해 NAS `back/.env`의 값만 교체합니다.

## 5. NAS에 back 폴더 업로드

- [ ] NAS에 Docker Engine 또는 제조사 Container Manager를 설치합니다.
- [ ] NAS 터미널에서 `docker version`을 실행해 성공하는지 확인합니다.
- [ ] `docker compose version`을 실행해 Compose v2가 있는지 확인합니다.
- [ ] 로컬 `back` 폴더 전체를 NAS에 업로드합니다.

예시 경로:

```text
/volume1/docker/war-archive-back
```

NAS에는 공개 도메인이나 수신 포트가 필요하지 않습니다. 컨테이너가 자료 출처와 `api.github.com`에 HTTPS로 나갈 수만 있으면 됩니다.

관제 화면을 볼 PC와 NAS가 같은 내부망에 있어야 하며 NAS 방화벽에서 TCP `9231`을 내부망에만 허용합니다. 공유기의 외부 포트 포워딩은 설정하지 않습니다.

## 6. NAS의 back/.env 입력

방법 A를 권장합니다. 설치 명령이 `.env`를 자동으로 만들며 토큰을 Git에 남기지 않습니다.

### 방법 A: 설치 명령으로 자동 생성

```bash
cd /volume1/docker/war-archive-back

GITHUB_FRONT_TOKEN='실제_토큰' \
sh nas-install.sh
```

다음 두 부분을 실제 값으로 바꿉니다.

```text
실제_토큰
kenitoa/warsachive
```

### 방법 B: .env 직접 작성

`back/.env.example`을 `back/.env`로 복사한 후 아래처럼 입력합니다.

```dotenv
COMPOSE_PROJECT_NAME=war-archive
TZ=Asia/Seoul
ADMIN_PORT=9231

ADMIN_PORT=9231
WAR_ARCHIVE_ADMIN_TOKEN=긴_임의_관리자_토큰

COLLECTION_INTERVAL_MS=600000
PROCESSING_DELAY_MS=600000
PUBLICATION_INTERVAL_MS=3600000
COLLECTION_MAX_ITEMS_PER_SOURCE=100
PUBLICATION_MIN_QUALITY_SCORE=0.6
MONITOR_INTERVAL_MS=60000
MONITOR_FAILURE_THRESHOLD=3
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_WEBHOOK_URL=

GITHUB_FRONT_REPOSITORY=kenitoa/warsachive
GITHUB_FRONT_TOKEN=실제_토큰
GITHUB_FRONT_REF=main
GITHUB_FRONT_CONTENT_PATH=web/content/archive.json
SMITHSONIAN_API_KEY=
EUROPEANA_API_KEY=
DPLA_API_KEY=
```

반드시 바꿔야 하는 값:

```dotenv
GITHUB_FRONT_REPOSITORY=kenitoa/warsachive
GITHUB_FRONT_TOKEN=실제_토큰
```

기본값을 그대로 사용해도 되는 값:

```dotenv
COMPOSE_PROJECT_NAME=war-archive
TZ=Asia/Seoul
COLLECTION_INTERVAL_MS=600000
PROCESSING_DELAY_MS=600000
PUBLICATION_INTERVAL_MS=3600000
COLLECTION_MAX_ITEMS_PER_SOURCE=100
PUBLICATION_MIN_QUALITY_SCORE=0.6
MONITOR_INTERVAL_MS=60000
MONITOR_FAILURE_THRESHOLD=3
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_WEBHOOK_URL=
GITHUB_FRONT_REF=main
GITHUB_FRONT_CONTENT_PATH=web/content/archive.json
SMITHSONIAN_API_KEY=
EUROPEANA_API_KEY=
DPLA_API_KEY=
```

이전에 만들었던 `.env`에 `API_DOMAIN`, `PAGES_ORIGIN`, `HTTP_PORT`, `HTTPS_PORT`가 있다면 기존 파일을 백업한 뒤 현재 `.env.example` 기준으로 새로 작성하세요.

## 7. NAS 실행

`.env`를 직접 작성했다면 다음을 실행합니다.

```bash
cd /volume1/docker/war-archive-back
sh nas-install.sh
```

상태 확인:

```bash
docker compose ps
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
docker compose logs --tail=200 backend
```

로컬 또는 NAS 업로드 전 점검:

```bash
npm run verify:ops
```

NAS에서 Docker까지 포함해 엄격하게 확인하려면 다음을 실행합니다.

```bash
npm run preflight:strict
```

브라우저에서 다음 주소를 확인합니다.

```text
http://NAS-IP:9231
```

정상 로그 예시:

```text
[war-archive] collector and static publisher started
[collector] maximum registered source sweep every 600000ms
[publisher] one processed record every 3600000ms
```

## 8. GitHub Pages 최초 배포 확인

- [ ] front 저장소의 Actions 탭을 엽니다.
- [ ] `Deploy front to GitHub Pages`를 수동 실행합니다.
- [ ] build와 deploy 작업이 모두 성공하는지 확인합니다.
- [ ] Settings → Pages에 표시되는 주소를 엽니다.
- [ ] 메인 화면, 기록 상세 페이지, `sitemap.xml`이 열리는지 확인합니다.

프로젝트 Pages 예시:

```text
https://kenitoa.github.io/warsachive/
https://kenitoa.github.io/warsachive/archive/imjin-war/
https://kenitoa.github.io/warsachive/sitemap.xml
```

## 9. 자동 누적 발행 확인

NAS가 10분마다 등록된 모든 출처에서 가능한 한 많은 item을 수집하고 10분 가공 구간에서 사건 제목 연관성 기준으로 X(a,b), Y(c,d) 형태의 군집을 만든 뒤, 1시간 발행 주기마다 품질 점수 기준을 넘은 가공 완료 기록 최대 한 건을 다음 파일에 누적합니다.

```text
front 저장소/web/content/archive.json
```

확인 순서:

- [ ] `archive: publish 기록ID` 형식의 새 커밋이 생기는지 확인합니다.
- [ ] 커밋에서 기존 기록이 유지되고 새 사건은 추가되며, 기존 사건에 새 문서가 붙은 경우 같은 ID 항목이 갱신되는지 확인합니다.
- [ ] 해당 push로 Pages Actions가 자동 실행되는지 확인합니다.
- [ ] 배포 후 `/archive/기록ID/` 페이지가 열리는지 확인합니다.

이미 같은 기록 ID가 `archive.json`에 있고 내용도 같으면 발행기는 중복 커밋하지 않습니다. 같은 사건 군집의 문서 묶음이 늘어나면 기존 항목을 갱신해 다시 발행합니다.

## 10. 오류별 확인 위치

| 오류 | 확인할 내용 |
| --- | --- |
| GitHub `401` | 토큰 오타, 만료, 취소 여부 |
| GitHub `403` | front 저장소 선택 여부, Contents Read and write 권한 |
| GitHub `404` | `owner/repository`, 브랜치명, 파일 경로 |
| GitHub `409` | 같은 파일이 동시에 수정됐는지 확인 후 다음 주기 재시도 |
| GitHub `422` | `main` 브랜치 존재 여부, `archive.json` JSON 형식 |
| Pages 빌드 실패 | Actions 로그, `SITE_URL`, `archive.json` 형식 |
| 컨테이너 재시작 반복 | `docker compose logs --tail=200 backend` 확인 |
| 토큰 노출 우려 | `npm run verify:secrets`로 저장소 내 유출 여부를 확인하고, 실제 값이 노출된 경우 NAS `back/.env`의 값만 새 토큰으로 교체 |
| Docker health 미통과 | `docker compose ps`의 health 상태와 `/api/health` 확인 |

## 완료 체크

- [x] front가 별도 GitHub 저장소의 루트로 업로드됨
- [x] GitHub Pages Source가 GitHub Actions로 설정됨
- [x] Actions 변수 `SITE_URL` 입력 완료
- [ ] Fine-grained token의 front 저장소 Contents 권한 설정 완료
- [ ] NAS `back/.env`에 저장소와 토큰 입력 완료
- [ ] Docker 컨테이너 실행 확인
- [ ] `npm run verify:ops` 또는 NAS `sh nas-install.sh` healthcheck 성공 확인
- [x] Pages 최초 자동 배포 성공
- [ ] 새 역사 기록의 누적 커밋과 자동 Pages 배포 확인
