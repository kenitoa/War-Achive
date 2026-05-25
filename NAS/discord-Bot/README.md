# War Archive Discord Bot

War Archive 백엔드의 `/health`를 확인하고 Discord 채널에 상태를 알리는 모니터링 봇입니다.

## Discord 앱 준비

1. Discord Developer Portal에서 애플리케이션을 만들고 Bot을 추가합니다.
2. Bot Token을 발급해서 루트 `.env`의 `DISCORD_BOT_TOKEN`에 넣습니다.
3. OAuth2 URL Generator에서 `bot`, `applications.commands` scope를 선택하고, 최소 권한으로 `View Channels`, `Send Messages`, `Embed Links`를 부여해 서버에 초대합니다.
4. 알림을 받을 채널 ID를 복사해서 `DISCORD_STATUS_CHANNEL_ID`에 넣습니다.

`TokenInvalid`가 나오면 Developer Portal의 Bot 화면에서 토큰을 `Reset Token`으로 새로 발급한 뒤 `.env`에 다시 넣어야 합니다. `Client ID`, `Public Key`, OAuth Secret이 아니라 Bot Token 값만 넣습니다.

## 환경변수

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_STATUS_CHANNEL_ID=your_status_channel_id
DISCORD_GUILD_ID=your_test_guild_id
DISCORD_ALERT_ROLE_ID=
WAR_ARCHIVE_HEALTH_URL=http://war-archive:8080/health
WAR_ARCHIVE_BASE_URL=http://war-archive:8080
WAR_ARCHIVE_PUBLIC_URL=http://127.0.0.1:8080
MONITOR_INTERVAL_SECONDS=60
MONITOR_FAILURE_THRESHOLD=1
MONITOR_REQUEST_TIMEOUT_MS=5000
MONITOR_STALE_DATA_HOURS=48
MONITOR_EXTRA_ROUTE_PATHS=
DISCORD_ANNOUNCE_ON_STARTUP=true
DISCORD_STARTUP_PANEL=true
```

`DISCORD_GUILD_ID`를 넣으면 슬래시 명령이 해당 서버에 빠르게 등록됩니다. 비워두면 전역 명령으로 등록되어 반영까지 시간이 걸릴 수 있습니다.

## 실행

로컬에서 봇만 실행:

```powershell
npm --prefix discord-Bot install
npm --prefix discord-Bot start
```

Docker Compose에서 War Archive와 함께 실행:

```powershell
docker compose --profile bot up -d --build
```

## 명령

- `/war-status`: 전체 모니터링 항목을 보여줍니다.
- `/war-issues`: 현재 WARN/FAIL 항목만 보여줍니다.
- `/war-health`: 백엔드 `/health`와 Discord 설정을 보여줍니다.
- `/war-pages`: 주요 페이지와 `/api/auth/me` 상태를 보여줍니다.
- `/war-data`: 프론트 데이터, JSON, 검색 인덱스를 보여줍니다.
- `/war-crawler`: 크롤러 DB와 수집 대상 파일 상태를 보여줍니다.
- `/war-probe path:<경로>`: 특정 내부 경로 하나를 즉시 확인합니다.
- `/war-latency samples:<횟수>`: `/health` 응답 시간을 여러 번 측정합니다.
- `/war-monitor`: 자동 모니터링 주기, 실패 횟수, 마지막 체크 결과를 보여줍니다.
- `/war-watch pause`: 자동 주기 체크를 일시정지합니다.
- `/war-watch resume`: 자동 주기 체크를 다시 시작합니다.
- `/war-watch status`: 자동 주기 체크 상태를 확인합니다.
- `/war-alert-test`: 상태 채널로 테스트 알림을 보냅니다.
- `/war-publish`: 현재 전체 상태를 `DISCORD_STATUS_CHANNEL_ID` 채널에 게시합니다.

## 체크 항목

- 백엔드 `/health`
- 주요 페이지 라우트
- `/api/auth/me` 인증 API의 기대 응답
- `front/data` 카테고리 존재 여부
- 전체 JSON 파싱 가능 여부
- 검색 인덱스 파일 수
- 미정의 사실 상태판 `status-index.json`
- 크롤러 DB `articles.sqlite3` 존재, 크기, 수정 시각
- 크롤링 대상 `target-sites.json`
- Discord 알림 채널/명령 등록 설정

봇은 시작 시 `DISCORD_STARTUP_PANEL`이 켜져 있으면 시작 알림 패널 1개를 보내고, 이후 `MONITOR_INTERVAL_SECONDS`마다 상태를 확인합니다. 장애가 감지되면 지정 채널에 빨간 패널을 보내고, 복구되면 초록 패널을 보냅니다. `MONITOR_EXTRA_ROUTE_PATHS`에는 추가로 확인할 경로를 쉼표로 넣을 수 있습니다.
