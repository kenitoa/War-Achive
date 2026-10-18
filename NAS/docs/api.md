# API 계약

기본 경로 `/api/v1`, 성공 `{data, error:null}`, 오류 `{data:null,error:{code,message}}`. 목록은 `{items,total,page,pageSize}`이며 `page>=1`, `pageSize<=200`. 자료 목록은 `status`와 `q`, 출처 목록은 `q`를 지원한다. 목록은 DB에서 페이지를 나누며 비공개 응답은 no-store다.

## 관리자

| 목적 | 메서드·경로 | 쓰기 권한 |
|---|---|---|
| 세션 교환·조회·종료 | POST/GET/DELETE `/session` | 로그인 토큰, 설정 시 TOTP |
| 대시보드 | GET `/overview` | 로그인 |
| 출처 목록·등록·수정 | GET/POST `/sources`, PATCH `/sources/:id` | editor |
| 수집 요청 | POST `/sources/:id/collect` | editor |
| 자료 목록·상세·편집 | GET `/records`, GET/PATCH `/records/:id` | 편집 editor |
| 버전 조회 | GET `/records/:id/versions` | 로그인 |
| 자료 승인/보류 | POST `/records/:id/review` | reviewer |
| 자료 철회 | POST `/records/:id/withdraw` | reviewer 또는 publisher |
| 원본 목록·업로드 | GET/POST `/records/:id/assets` | 업로드 editor |
| 파일 권리 승인·취소 | PATCH `/records/:id/assets/:assetId/rights` | reviewer |
| 비공개 원본 다운로드 | GET `/records/:id/assets/:assetId/download` | 로그인·감사 기록 |
| 제작 요청 | POST `/records/:id/produce` | editor |
| 큐·재시도 | GET `/jobs`, POST `/jobs/:id/retry` | 재시도 editor 또는 publisher |
| 발행 목록·요청 | GET/POST `/publications` | 발행 publisher |
| 정정/제보 조회·처리 | GET `/requests`, PATCH `/requests/:id` | 처리 reviewer 또는 editor |
| 전쟁·기록 사전·모음·주장 | GET/POST `/catalog/:kind` | 쓰기 reviewer |
| 감사·설정·메타데이터 백업 | GET `/audit`, `/settings`, `/backup/export` | 감사 reviewer/publisher, 백업 admin |
| 회원 검색·복구 토큰 발급 | GET `/members`, POST `/members/:id/reset` | admin |

admin은 모든 역할을 포함한다. 쓰기는 세션 쿠키 외에 로그인 응답의 `csrfToken`을 `X-CSRF-Token`으로 제출해야 한다. 자료 편집·검수·철회에는 `expectedRevision`이 필요하고 충돌은 409다. 로그아웃/서버 재시작 시 관리자 세션이 폐기된다.

원본 업로드 body: `{data:<base64>,mimeType,filename,rightsAttestation,publishDerivatives:false}`. 16MiB 한도, 실제 MIME 검증, 20자 이상의 권리 근거가 필요하다. 업로드와 동시에 공개 파생물 허용을 설정하려면 editor와 reviewer 권한을 모두 가진 admin이어야 한다. 역할을 나누면 editor가 비공개 업로드하고 reviewer가 별도 rights PATCH를 수행한다.

## 선택적 공개 API

`PUBLIC_ACCOUNT_API_ENABLED=true`일 때만 활성화한다. 외부 HTTPS 게이트웨이에서 아래 경로와 `/healthz`만 허용한다. `/admin`, 관리자 `/session`, `/records`, `/sources`, `/jobs`, `/backup` 등을 인터넷에 노출하지 않는다.

| 목적 | 경로 |
|---|---|
| 회원가입 | POST `/accounts` |
| 로그인·세션 조회·로그아웃 | POST/GET/DELETE `/account/session` |
| 서재 조회·낙관적 저장 | GET/PUT `/account/shelf` |
| 비밀번호 복구 | POST `/account/reset` |
| 계정 삭제 | DELETE `/account` (현재 비밀번호 필요) |
| 제보·정정 접수 | POST `/requests` |

쿠키는 HttpOnly이며 변경 요청에는 회원 세션의 CSRF 토큰이 필요하다. 공개 제보 응답은 연락처를 반환하지 않는다. 회원 세션/서재는 소유자를 서버에서 확인한다. 재설정 토큰은 관리자가 발급한 30분 일회성 토큰으로 기존 세션을 폐기한다. 이메일 발송·이메일 소유 인증은 구현된 흐름으로 주장하지 않는다.

회원가입과 제보·정정 접수는 연결 IP별로 각각 시간당 100회까지 허용하고 101번째 시도부터 `429 RATE_LIMITED`를 반환한다. 잘못된 입력도 시도 횟수에 포함하며 첫 시도부터 60분 뒤 해당 한도가 초기화된다. 두 경로의 횟수는 서로 독립적이다. 전달된 `X-Forwarded-For`·`Forwarded` 헤더로 한도를 우회할 수 없도록 실제 연결 IP를 사용한다. 현재 공개 게이트웨이를 통한 요청은 동일한 게이트웨이 IP로 집계되므로 공개 사이트 전체에서 각각 시간당 100회의 한도를 공유한다. 카운터는 API 프로세스 메모리에 저장되어 API 재시작 시 초기화된다. 기존 전체 API 분당 240회, 관리자 로그인 분당 5회, 회원 로그인 분당 10회, 비밀번호 재설정 분당 5회 한도는 유지한다.

## 공개 발행 계약

단일 기준은 `back/src/domain/contracts.ts`의 Zod 스키마다. `node NAS/scripts/sync-contracts.mjs`로 Vercel과 관리자 계약을 동기화한다. 수정 시 `--check`, 세 앱 타입 검사·테스트·빌드를 통과해야 한다. 내부 모델은 `models.ts`이며 공개 record와 구분한다. 공개본에는 원본 경로·원문 응답·권리 근거 원문·계정·연락처·운영 메모를 넣지 않는다.
