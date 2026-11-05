# NAS 단독 수집·분석·정제·블로그 발행

## 실행 경계

`NAS/` 폴더가 설치 단위다. `Vercel/` 또는 PC 실행 상태 없이 PostgreSQL/API/worker/관리자/공개 gateway를 구성한다. 외부 CMS나 유료 API 없이 자체 블로그를 운영한다. 기존 GitHub/Vercel 아카이브 JSON 발행은 선택 기능이다.

```text
출처 등록·정책 검토 → 수집·해시 보존·중복 방지
→ 정규화·원본 판독/제작 → 승인 자료 분석·자동 초안
→ 원고 편집·문단별 근거·내용/권리 검수
→ 즉시/예약 승인 → 파일 무결성 확인·DB 발행 확정
→ /blog/·RSS 공개 → 근거 변경/철회 시 공개 차단·재검수
```

## 분석·자동화 범위

- 규칙 기반 `catalogue-analysis-v1`이 자료의 시기·언어·주제·출처·권리·검수 상태를 정리하고 날짜/언어 미상, 소장처 설명, 재사용 미확인 경고를 남긴다. 범용 LLM 역사 연구·진위 판정·자동 번역 완료를 주장하지 않는다.
- 초안은 자료 메타데이터와 근거 링크로 만든다. 원문을 무제한 복제하거나 역사적 사실을 지어내지 않는다. 편집실에서 본문을 수정하고 문단별 근거를 지정한다. 승인 없는 초안은 공개되지 않는다.
- 5초 주기당 최대 `EDITORIAL_BATCH_SIZE`개의 새 자료 개정에 대해 초안을 만든다. `자료 ID:개정` 고유 키로 중복을 차단한다. 같은 자료 개정에서 검토·반려·철회한 자동 초안은 재생성하지 않는다.
- OCR/PDF/이미지·영상 제작은 제공·업로드된 원본에 적용한다. 메타데이터 수집은 원본 파일 확보와 다르며 재게시 권한 없는 원본을 임의로 내려받지 않는다. Docker에는 영어·한국어 OCR 데이터가 설치되며 현재 OCR 호출 기본 언어는 영어다.
- 여러 자료를 묶은 원고 및 여러 문단을 지원한다. 공개 승인된 비민감 자료만 근거로 사용한다.

## 단독 설치

필수: Linux NAS, Docker Engine/Compose v2, 이미지·패키지·출처에 접근 가능한 네트워크, 디스크 공간. 호스트의 Node/npm 설치는 필요 없다. Docker 실행 권한을 가진 사용자로 실행한다.

```sh
cd /your/path/NAS
sh install.sh
```

설치 순서: 누락된 `.env` 기본값·강한 비밀값 생성 → Compose 검사 → 테스트 포함 이미지 빌드 → 도구/언어 데이터/저장소 사전 점검 → DB 시작·추가형 마이그레이션 → 중복 없는 초기 분류/출처 등록 → API/worker/gateway 시작 → DB·편집 스키마·worker heartbeat·gateway 응답 점검. 준비 상태 확인 실패 시 성공으로 표시하지 않으며 DB와 컨테이너를 보존한다. 기존 비밀값·자료·분류·출처를 덮어쓰거나 DB를 초기화하지 않는다.

초기 수집 출처의 공개 정책은 미승인이다. 관리자에서 정책·권리를 검토하고 자료를 승인해야 블로그 초안의 근거가 된다. 설치기가 출처·원고를 대신 승인하지 않는다.

## 접속·공개 경계

- 관리자: NAS loopback `127.0.0.1:${ADMIN_PORT:-9231}/admin/`. VPN/비공개 HTTPS 역방향 프록시로 연결한다.
- 공개 gateway: loopback `127.0.0.1:${PUBLIC_PORT:-9232}`. 공개 도메인의 `/blog/`를 이 gateway로 전달하며 경로·쿼리를 보존한다.
- 주소: `/blog/`, `/blog/post-<UUID>/`, `/blog/feed.xml`. 루트 도메인에서 이 경로를 유지한다. 비공개 관리자 API를 통째로 공개하지 않는다.
- `.env`의 `ALLOWED_ORIGINS`에 관리자 HTTPS origin을 정확히 입력한다. 변경 후 `docker compose up -d --force-recreate api worker`로 재적용한다.
- 관리자 토큰은 `.env`에서 비공개로 확인한다. 편집은 editor/admin, 승인·반려·철회·재시도는 publisher/admin 권한과 CSRF 검사를 요구한다. MFA는 기존 설정을 따른다.
- 공개 gateway는 블로그 GET과 기존 명시된 공개 API만 전달한다. 편집·감사·복구 API는 차단하며 블로그 요청의 인증정보/쿠키는 전달하지 않는다.

## 설정

| 키 | 기본값 | 의미 |
| --- | --- | --- |
| EDITORIAL_PIPELINE_ENABLED | true | worker 편집 파이프라인 실행 |
| EDITORIAL_AUTO_DRAFT_ENABLED | true | 승인 자료 새 개정 자동 초안 |
| EDITORIAL_BATCH_SIZE | 5 | 주기당 최대 초안 수, 1~50 |
| PUBLIC_PORT | 9232 | loopback 공개 gateway 포트 |

`AUTO_PUBLISH_ENABLED`는 기존 아카이브 snapshot 설정이며 블로그 검수를 생략하지 않는다. PostgreSQL은 운영 필수 DB다. 외부 분석 API 비밀키는 기본 동작에 필요 없다. `.env.example`은 키 목록이며 새 설치는 설치기가 생성한 `.env`를 사용한다.

## 편집실·상태

**분석·블로그 편집실**에서 상태·경고·근거를 확인하고 제목·요약·문단·근거 연결을 저장한다. 내용/권리 확인과 사유 입력 후 즉시 또는 예약 승인한다. 예약 입력은 브라우저 시간대이며 ISO UTC로 전달된다. 원고 목록은 최대 100건씩 이동한다. 근거 선택기는 제목 검색·20건 단위 페이지 이동을 지원하고 검색·페이지를 바꿔도 최대 20개 선택을 유지한다.

편집하면 이전 승인을 해제한다. 편집·승인은 expectedRevision으로 충돌을 감지한다. 발행 중에는 편집을 막고 철회는 허용한다. 발행 확정/철회는 공통 publication guard로 직렬화한다. 공개 글 수정본을 저장하면 재승인까지 기존 글도 숨긴다.

## 재시도·철회·백업

- `FOR UPDATE SKIP LOCKED` 작업 임대, 3분 만료 회수, 지수 지연·최대 5회 재시도, 승인된 실패 원고의 수동 재시도를 지원한다.
- `EXPORT_DIR/blog/<article-id>/r<revision>/article.json`을 원자 저장·해시 재확인한다. 이 폴더는 정적 웹 루트로 직접 노출하지 않는다. 공개 경계는 DB 발행 상태와 유효한 근거다.
- DB에 원고/개정/발행 snapshot/감사를 보존한다. 검수자 식별정보·운영 메모를 공개 HTML에 노출하지 않는다.
- 근거 개정·철회·민감도·출처 정책을 공개 조회에서도 확인해 worker를 기다리지 않고 숨긴다. 다음 대조에서 재검토로 돌린다. 공개 응답은 no-store이며 프록시도 `/blog/`를 캐시하지 않는다.
- 전체 DB 백업과 portable export/import에 원고·개정·발행이 포함된다. portable 복원은 빈 대상과 동일 마이그레이션/해시에서만 허용한다. 이전 bundle은 이전 코드로 복원 후 007 적용·재export한다.
- 007은 추가형 마이그레이션이다. 롤백은 `EDITORIAL_PIPELINE_ENABLED=false`로 새 작업을 멈추고 호환 이미지로 복귀하며 새 테이블을 삭제하지 않는다. 이전 portable exporter를 새 DB에 사용하지 않는다.

## 검증

```sh
node scripts/sync-contracts.mjs --nas-only --check
cd back
npm ci
npm run lint
npm run typecheck
npm test
npm run build
cd ../admin
npm ci
npm run lint
npm run typecheck
npm test
npm run build
node scripts/editorial-browser-smoke.mjs
cd ../gateway
npm run lint
npm test
```

브라우저 검사는 설치된 Microsoft Edge와 격리된 임시 DB를 사용하며 외부 NAS에 접속하지 않는다. 컨테이너 안 실제 도구·DB·파일 시스템은 설치기의 preflight로 확인한다. 소스 테스트 통과만으로 실물 NAS/Docker 설치 성공을 주장하지 않는다.
