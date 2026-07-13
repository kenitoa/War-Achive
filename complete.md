# War-Achive completed work

## 2026-07-13

### Docker Compose 가상 검증과 운영 preflight

- `DOCKER_COMPOSE_COMMAND` 주입형 preflight를 추가했다.
- `verify:compose:virtual`에서 mock compose 명령으로 strict preflight를 검증한다.
- `verify:ops`는 `verify:secrets -> verify:compose:virtual -> audit:sources` 순서로 바뀌었고 Docker Compose 미설치 경고 없이 통과했다.

### 보안 강화

- `WAR_ARCHIVE_ADMIN_TOKEN`을 필수 관리자 비밀값으로 추가했다.
- 관리자 상태/관리 API는 Bearer token 없이는 접근할 수 없다.
- `verify:secrets`가 `back/.env`의 `GITHUB_FRONT_TOKEN`, `WAR_ARCHIVE_ADMIN_TOKEN` 누락/placeholder 여부를 검사한다.
- 관리자 액션 로그와 API 응답에서 GitHub 토큰 형태 값을 redaction한다.

### 관리자 페이지 재구성

- 토큰 로그인, 상태 모니터링, 수집/발행/롤백/audit 수동 실행을 추가했다.
- 출처 상태, 품질 필터, 사건 군집, 검토 큐, 발행/롤백 이력을 admin 페이지에서 확인할 수 있게 했다.
- GitHub Pages 대상 저장소, branch, content path, public URL을 admin에서 확인할 수 있게 했다.

### 라벨링과 이상치 탐지 보강

- 라벨링을 `rules-v3-trust-filter`로 갱신했다.
- 군집화 알고리즘에 HDBSCAN-style 밀도 안정화와 Isolation Forest-style 이상치 점수를 추가했다.
- 문서별 `qualityScore`, `qualityDecision`, `outlierScore`, `outlierReasons`를 저장한다.
- `rejected` 문서는 공개 정보화 단계에서 제외한다.

### 10분 대량 수집, 1시간 발행, URL 변경 감지

- `PUBLICATION_INTERVAL_MS` 기본값을 1시간(`3600000`)으로 변경했다.
- `COLLECTION_MAX_ITEMS_PER_SOURCE=100`을 추가해 10분 수집 주기마다 API 출처별 더 많은 item을 수집하게 했다.
- 같은 URL에서 같은 내용이 다시 들어오면 skip한다.
- 같은 URL에서 내용이 바뀌면 변경 fragment를 추출하고 기존 raw 문서를 `changeKind=updated`로 덮어쓴다.
- 발행은 기존 archive record ID의 fingerprint가 바뀌면 기존 JSON 항목을 교체한다.

### Discord Bot 모니터링

- `back/Discord Bot/monitor.mjs`를 추가했다.
- 수집 실패, GitHub 인증 실패, GitHub 충돌, rate limit, validation/branch protection, collector/publisher 정지, 품질 이상치 급증, URL 업데이트 감지를 분류한다.
- 각 문제별 가능한 원인과 해결책을 `back/Discord Bot/logs/monitoring.log`에 남긴다.
- `DISCORD_BOT_TOKEN`과 `DISCORD_CHANNEL_ID`가 있으면 Discord 봇 계정으로 경고를 전송한다.
- 봇 토큰 설정이 없으면 기존 `DISCORD_WEBHOOK_URL` 방식도 fallback으로 유지한다.

### 저장소 역할 분리

- `repository-map.json`을 추가해 저장소 책임을 명시했다.
- `back`은 `kenitoa/warachive` 담당으로 기록했다.
- `front`는 `kenitoa/warsachive` 담당으로 기록했다.
- 공개 Pages 데이터 경로를 `front/web/content/archive.json`로 고정했다.
- 루트 저장소에서 nested `front/`를 일반 파일로 add하지 않는 규칙을 남겼다.

### 10분 수집과 공개 출처 확장

- 수집 기본 주기를 10분으로 변경했다.
- `api-json` source kind를 추가해 JSON API 응답 item을 raw document 여러 건으로 저장하게 했다.
- `topics.json`에 공개 역사 API 출처를 확장했다.
- 활성 출처: Library of Congress, Internet Archive, Wikidata Query Service.
- API 키 필요 출처: Smithsonian Open Access, Europeana, Digital Public Library of America.
- `history-source-catalog.json`에 추가 확장 후보와 출처 등록 정책을 기록했다.

### 군집화 알고리즘 보강

- 라벨링 뒤 `clustered/documents.json` 산출물을 만들도록 했다.
- 문장 데이터 수집 단계를 추가했다.
- `vector/sentences.json`, `vector/entity-index.json`, `vector/entity-registry.json` 로컬 벡터 저장소를 만든다.
- 군집화 순서를 `문장 수집 -> DBSCAN -> 계층적 병합 -> K-Means 보강 -> RAG entity resolution`로 구성했다.
- LLM 호출 없이 hashing TF 벡터와 entity registry 검색으로 사건 동일성 판정을 수행한다.
- `eventClusterId`는 registry match, readable slug, 충돌 접미사, 순번 fallback 순서로 결정하게 했다.

### 발행과 롤백

- 같은 사건 ID의 기록이 바뀌면 append가 아니라 기존 `archive.json` 항목을 교체한다.
- 공개 기록에 `documentIds`와 `sentenceIds`를 포함해 `X(a,b) -> X(a,c,d)` 변화를 추적할 수 있게 했다.
- 발행 전후 archive 전체 스냅샷을 `state/publication-history.json`에 저장한다.
- 변경 이력에 추가/삭제된 document/source 목록을 기록한다.
- 발행 후 readback 검증이 실패하면 이전 archive 스냅샷으로 자동 복구를 시도한다.
- `npm run rollback` 수동 롤백 명령을 추가했다.

### 관리자와 운영 검증

- 관리자 상태 API와 화면에 GitHub 대상, 최근 오류, 군집 수, 군집화 문서 수를 표시하게 했다.
- `SCHEDULER_RETRY_MS`를 추가해 수집/발행 실패 시 빠르게 재시도하게 했다.
- `npm start` / `npm run start:all`로 collector, publisher, admin을 함께 실행하는 진입점을 추가했다.
- `warning.md`에 남은 위험과 해결 상태를 정리했다.

### 검증

- `npm test` 통과.
- pipeline 테스트 17개 통과.
- admin 테스트 3개 통과.
- `npm run verify:ops` 통과.
- `audit:sources` 결과: `totalSources=8`, `externalSources=6`.
- `front` 정적 빌드 통과와 `/archive/imjin-war` 생성 확인.

### 아직 운영 환경에서 확인할 항목

- NAS Docker Compose 실제 실행.
- NAS의 `GITHUB_FRONT_TOKEN` fine-grained token 권한 확인.
- GitHub live push, branch protection, Pages Actions 성공 여부.
