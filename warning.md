# War-Achive warning

이 문서는 아직 닫히지 않은 위험 요소만 남긴다. 이미 구현과 검증이 끝난 항목은 `complete.md`와 `back/logs/2026-07-13.md`로 옮겼으므로 여기서는 반복하지 않는다.

## 1. 미커밋/미배포 상태

- 루트 저장소에는 `back` 변경 파일과 신규 파일이 아직 다수 남아 있다.
- `front`는 별도 nested Git 저장소이며, `front/web/content/archive.json`과 `front/logs/2026-07-13.md` 변경이 남아 있다.
- 공개 Pages에 반영하려면 `front` 저장소에서 `web/content/archive.json` 변경을 `kenitoa/warsachive`에 commit/push하고 Pages Actions 성공을 확인해야 한다.
- 루트에서는 `front/` 전체가 untracked로 보이므로, 루트 저장소에 public front 파일을 잘못 add하지 않도록 주의해야 한다.

## 2. back 저장소 이름 최종 확인

- 역할 정의는 `back -> kenitoa/warachive`, `front -> kenitoa/warsachive`로 기록했다.
- 현재 로컬 루트 remote는 기존 `kenitoa/War-Achive` 계열 상태였으므로 실제 GitHub 저장소 생성/이동 여부를 확인한 뒤 remote 변경을 해야 한다.
- 이 항목은 사용자가 다시 점검을 요청할 때까지 강제로 변경하지 않는다.

## 3. NAS 실제 운영 검증

- 로컬에서는 `verify:compose:virtual`로 Docker Compose 가상 검증을 통과했다.
- 실제 NAS에서 `docker compose up -d --build --remove-orphans` 실행, container healthcheck, `/api/health`, `/api/status` 응답을 아직 확인하지 못했다.
- 실제 NAS에서 10분 수집 루프와 1시간 발행 루프가 장기 실행되는지 확인해야 한다.
- Docker volume `/data` 권한, 재시작 후 상태 파일 유지, NAS 시간대 `Asia/Seoul` 적용 여부도 운영 장비에서 확인해야 한다.

## 4. GitHub live 발행과 Pages 확인

- 로컬 테스트와 GitHub API mock 검증은 통과했다.
- 실제 `GITHUB_FRONT_TOKEN`으로 `kenitoa/warsachive`의 `web/content/archive.json`을 갱신하는 live push는 아직 운영 환경에서 확인해야 한다.
- branch protection, GitHub Contents API conflict/rate limit, token 만료, Pages Actions 실패는 실제 저장소 상태에서 최종 확인해야 한다.
- Pages 최신 배포가 `https://kenitoa.github.io/warsachive/`에 반영되는지도 commit/push 후 확인해야 한다.

## 5. Discord bot 운영 확인

- `back/Discord Bot/monitor.mjs`는 로컬 1회 실행에서 문제 분류와 로그 기록이 동작했다.
- 현재 `DISCORD_BOT_TOKEN`과 `DISCORD_CHANNEL_ID`가 비어 있으므로 Discord 실제 전송은 확인되지 않았다.
- NAS의 `back/.env`에 봇 토큰과 채널 ID를 넣은 뒤 수집 실패, 발행 실패, collector/publisher 정지 알림이 Discord에 도착하는지 확인해야 한다.
- 봇 토큰 설정이 없을 때만 `DISCORD_WEBHOOK_URL` fallback을 사용할 수 있다.
- `back/Discord Bot/logs/monitoring.log`가 장기간 누적될 수 있으므로 NAS에서 log rotation 또는 정리 정책을 추가로 검토해야 한다.

## 6. 외부 출처 확장과 합법성 검토

- 현재 감사 기준 출처는 `totalSources=8`, `externalSources=6`이다.
- Smithsonian, Europeana, DPLA는 API key가 있어야 활성화된다.
- 추가 역사 사이트를 늘릴 때는 무차별 scraping이 아니라 공식 API, 공개 metadata endpoint, bulk/harvest 경로, robots.txt, 약관, 저작권 조건을 확인해야 한다.
- 기관별 호출 간격, 원문 보존 가능성, 중복 판정 기준은 출처를 추가할 때마다 갱신해야 한다.

## 7. 군집화 정확도 운영 평가

- DBSCAN, HDBSCAN-style density stability, Isolation Forest-style anomaly scoring, K-Means, RAG entity resolution은 구현과 테스트를 통과했다.
- 실제 대량 역사 자료 기준 precision/recall 평가는 아직 없다.
- 오분류를 검증할 gold dataset, 사람이 검토한 사건 묶음, 수동 병합/분리 결과를 기준으로 회귀 테스트를 만들어야 한다.
- 관리자 페이지에는 검토 큐가 있지만, 실제 운영자가 확정한 라벨을 다시 학습/registry에 반영하는 폐쇄 루프는 추가 검토가 필요하다.

## 8. 보안 운영 확인

- `verify:secrets`는 저장소 내 토큰 유출과 `back/.env` 필수 비밀값 존재를 검사한다.
- 실제 NAS에서 `back/.env` 권한이 제한되어 있는지 확인해야 한다.
- `GITHUB_FRONT_TOKEN`은 fine-grained token으로 `kenitoa/warsachive` 하나에만 `Contents: Read and write`를 부여하는 구성이어야 한다.
- 관리자 페이지는 LAN 내부 사용을 전제로 한다. 외부 공개 도메인이나 포트포워딩에 연결하면 상태 정보와 운영 액션이 노출될 수 있다.

## 9. 다음 우선순위

1. `front/web/content/archive.json`을 `kenitoa/warsachive`에 commit/push하고 Pages Actions 성공을 확인한다.
2. NAS에서 Docker Compose 실제 실행과 `/api/status`를 확인한다.
3. NAS에서 `DISCORD_BOT_TOKEN`과 `DISCORD_CHANNEL_ID`를 설정하고 알림 도착을 확인한다.
4. 실제 GitHub token으로 live archive publish와 rollback을 확인한다.
5. 추가 역사 출처를 합법성 검토 후 단계적으로 등록한다.
6. 실제 자료 기준 군집화 정확도 평가 세트를 만든다.
