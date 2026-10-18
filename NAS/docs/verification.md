# 구현 및 검증 기록

최종 검증일: 2026-10-19(한국 시각). NAS의 개별 작업 증거는 기록한 UTC 시각을 따른다. 이 기록은 로컬·실제 외부 수집·실제 웹 배포와 미검증 운영 환경을 구분한다. 세 앱은 Node.js 22/npm, 각자의 package-lock.json을 사용한다.

실제 NAS에서 PostgreSQL 이전, Docker 이미지 빌드, 네 서비스의 정상 상태, 후속 자동 재배포, 수집·정제·제작·GitHub 발행·Vercel 공개본 검증을 확인했다. 설치·접근 경로·업데이트 잠금·SSH 배포 키 구성은 [전용 NAS 배포 문서](../deployment/README.md)를 따른다. 사용자가 승인한 공개 회원 API의 HTTPS 경로 설정은 DSM 관리자 일회성 작업으로 적용했고 실제 외부 gateway 검사 6건과 Vercel 프록시를 거치는 운영 계정 검사 9건을 통과했다.

## 구현 연결

| 요구 | 구현 | 검증 범위 |
|---|---|---|
| NAS/Vercel 작업 폴더 분리 | 비밀값·원본·DB는 NAS, 공개 웹만 Vercel | Git 후보/배포 staging 비밀값 검사 |
| 지속 수집 | 출처별 과거·증분·순환 재확인, DB checkpoint/작업 큐 | 실제 NAS Commons 수집 40건 추가, 임대/중복/재시작/변경 회귀 검사 |
| 지속 정제·자료 제작 | 원본 해시·버전·검수 후보·파일 제작/권리 | 실제 NAS 원본 455개와 제작 파일 810개 SHA-256 전수 일치, OCR/PDF/영상 도구 설치 확인 |
| 지속 자동 업로드 | GitHub 공개본·원격 재조회·Vercel 실제 해시 확인 | 실제 NAS worker 발행 작업 완료, GitHub 커밋과 Vercel 공개 릴리스 일치 |
| 공개 탐색 | 전쟁/검색/자료/사전/모음/지도/연표/서재 | 정적 빌드·로컬 및 실제 배포 Edge 검사 |
| 관리자 운영 | 10개 메뉴·역할·검수·작업·발행·감사·복구 | 로컬 API 브라우저 검사, 실제 NAS 비공개 API 인증·권한·CSRF 검사 |
| 계정과 개인 정보 | scrypt·세션 해시·소유자·서재 revision·복구·계정 삭제 | DB/API 통합 검사, 실제 NAS Funnel·공개 HTTPS 6건, 운영 웹 계정 검사 9건 통과 |
| 보존·철회 | 원본 불변 보존·공개본 guard·범위 cleanup | 파일 무결성·권리 취소·S3 삭제/재시도/CDN HTTP 검사 |
| 백업·운영 | 전체 DB/원본 백업·암호화·새 환경 복원·Compose | 로컬 복원/암호화, 실제 NAS 자동 백업 3개 파일 해시·dump 목록 검사. NAS 전체 복원과 외부 보관 미검증 |

## 앱 검사

- NAS/back: 로컬 및 실제 NAS Linux Docker 빌드에서 lint·typecheck·test 36건·build 통과. portable 이전 CLI와 원본/DB 이전, 메타데이터 전용 제작물 재생성, 지연 발행 검증 증거, 물리 복구의 세션 무효화, Git 배포 키 회귀 검사를 포함한다.
- NAS/admin: lint·typecheck·test 4건·build 통과, 실제 NAS Docker 이미지 빌드에서도 통과. 기존 로컬 API 9231의 브라우저 검사에서 데스크톱 10개 메뉴, 390px 모바일 7개 메뉴, 자료·원본 목록·이전 개정 조회와 로그인·로그아웃을 확인했다. 자료 쓰기를 수행하지 않았다. 출처 후보 반영은 브라우저 GET에만 격리한 UI 검사다. 실제 NAS 관리자 페이지 HTTP 200과 비공개 API는 확인했으나 원격 관리자 브라우저 조작은 미검증이다.
- Vercel: 최신 NAS 공개본 93건과 API 프록시·계정 초기 폼 보호를 반영한 로컬 lint·typecheck·test 22건·build 115개 경로가 통과했다. 소스 `6584311bb763d07ed887c6661eb7b5cf6b0d8764`의 실제 공개 배포에서 운영 계정 검사 9건과 일반 공개 탐색 Edge 12개 흐름·390px 주요 9개 경로를 모두 통과했고 JavaScript 런타임 오류는 0건이었다. 최종 일반 검사 결과는 `Vercel/artifacts/final-connected-production-20261019/browser-results.json`이며 실행 종료 코드는 0이다. 결과에는 외부 이미지 요청 1건의 `net::ERR_ABORTED`가 남아 있으므로 모든 외부 네트워크 요청의 성공을 주장하지 않는다.
- 배포 구성: 공개 게이트웨이 HTTP 검사 7건, 배포 컨트롤러 검사 8건, Python Funnel 설정 검사 12건 통과. NAS Linux에서 컨트롤러와 실행 중 파일의 원자적 교체를 확인했고, 커널 flock의 동시 실행 거부와 강제 종료 후 잠금 해제를 확인했다.
- 이전 전체 로컬 검사에서 backend 36건·admin 4건·당시 frontend 21건과 각 앱 lint·typecheck·build, 게이트웨이 7건·컨트롤러 8건·Python 12건을 끝까지 실행했다. 개별 검사는 통과했으나 PowerShell 로그 리디렉션 래퍼가 Fastify deprecation의 stderr 출력을 `NativeCommandError`로 표시해 외부 종료 코드 1을 반환했다. 이를 전체 래퍼 종료 코드 0으로 기록하지 않는다. 후속 직접 실행에서는 최신 프론트엔드 22건·lint·typecheck·build와 Python 검사의 종료 코드 0을 확인했다.
- 공용 계약: `node NAS/scripts/sync-contracts.mjs --check` 통과.
- Portable 이전 회귀 검사: 새로운 PGlite DB와 CLI 기본 경로, ID/checkpoint/철회/서재/원본 보존, 인증 세션 제외, lease 재대기, ingest sequence 보존, 비어 있지 않은 대상/변조 거부 통과.
- NAS 이전 bundle: `NAS/data/transfer/nas-handoff-20261018/`. manifest 기준 4개 출처·230개 자료·597개 개정·415개 보존 원본이다. 실제 NAS PostgreSQL 가져오기를 완료했고, 후속 수집 및 재배포 뒤의 전수 검증 결과는 아래에 기록했다.
- NAS/.env·기존 back/.env·DB·원본·이전 bundle·스크린샷은 Git에서 제외한다. 이전 소스 검사에서는 비밀값/토큰 패턴/운영 데이터 유입이 없었으며, 최종 변경분에 대한 검사는 별도 완료 결과를 따른다.

## 실제 NAS 운영

- 전용 설치 경로는 `/volume3/docker/War_Archive_Server`, Compose 프로젝트는 `war-archive`다. 기존 NAS의 다른 서비스와 데이터를 유지했다.
- 최초 배포 `5be636d03f4f2d2c5614b4d9faf386c7faeed35a` 이후 DSM의 5분 주기 작업이 소스 `892c6dc41d2dc45690f50c224d301d9f95c712b8`을 자동으로 가져와 백업·빌드·마이그레이션·서비스 교체·bootstrap 갱신을 완료했다. 후속 소스 `4a46ade2a5ef1463678fba29b5085bafcfc23fbc`의 자동 재배포도 확인했다.
- 실제 `db`, `api`, `worker`, `publicgateway` 네 서비스 모두 healthy를 확인했다. API와 공개 게이트웨이는 NAS loopback 9231/9232에만 바인딩하며 PostgreSQL은 호스트 포트를 공개하지 않는다.
- 2026-10-18 13:45:00.738 UTC의 읽기 전용 재검증에서 마이그레이션 6개, 자료 270개, 개정 637개, 보존 원본 455개를 확인했다. 원본 파일 455개 전부와 제작 파일 810개 전부의 SHA-256이 일치했고, 메타데이터 전용 자료 270개 모두 제작 완료 상태였다. 이 검사는 후속 자동 재배포 후 수행해 볼륨 지속성도 확인했다.
- 실제 NAS 수집 작업 `job-0f7580b2-0feb-4c8b-9dcf-5ba6ca74e792`으로 Commons 자료 40건을 추가했다. 최종 자료 수가 이전 bundle의 230개에서 270개로 증가했다.
- 실제 NAS 비공개 API와 도구 검사 14건이 통과했다. 비인증 관리자/서재 접근 차단, 공개 게이트웨이의 관리자 경로 차단, 미허용 Origin 거부, 관리자 로그인·조회·로그아웃·세션 폐기, 잘못된 CSRF 거부, PostgreSQL 및 저장소 한정 발행 설정, 한국어/영어 OCR·PDF 추출·영상 처리 도구 설치를 확인했다. 도구 설치 확인을 모든 미디어 형식의 실제 처리 성공으로 해석하지 않는다.
- DSM 관리자 일회성 작업으로 `stock-platform.tail498403.ts.net:443`의 `/war-archive-api` 경로를 적용했다. `configure-funnel.py` 실행 결과는 `status=applied`, `attempts=1`, `priorConfigurationPreserved=true`로 기존 HTTPS 구성을 보존한 설정 반영을 확인했다. 후속 Vercel 경유 운영 계정 검증은 아래 별도 항목을 따른다.
- 2026-10-18 14:45:31.899 UTC의 실제 공개 gateway HTTPS 검사 6건이 통과했다. prefix 아래 health는 200, 비인증 회원 세션·서재는 401, 관리자 로그인·관리자 페이지는 404, 미허용 Origin의 회원가입은 403이며 no-store 응답도 확인했다. Vercel Production의 `NEXT_PUBLIC_API_ORIGIN`은 공개 사이트 자체 origin으로 설정했다.
- 자동 재배포 백업 `backups/20261018T132136Z-892c6dc41d2dc45690f50c224d301d9f95c712b8`의 `database.dump`, `archive-files.tar`, `releases.tar` 세 파일 모두 SHA-256 검사를 통과했고 dump 목록도 읽을 수 있었다. 이 백업을 사용한 NAS 전체 복원과 NAS 외부 보관은 확인하지 않았다.
- worker는 매분 작업을 확인하고, 승인된 Commons 출처의 수집 간격은 6시간, 자동 발행 묶음 간격은 2시간이다. 이번 검증은 실제 작업 실행과 재배포를 확인한 것이며 장기간 무장애 운전을 보장하지 않는다.

## 초기 PC 수집과 공개 자료 이력

초기 PC 운영 시 Commons에서 120건 원본 응답을 보존했고 118건을 공개했다. 민감도 검토 자료 2건은 공개본에서 제외했다. 초기 공개본의 전쟁 3개, 모음 3개, 장소 참조 2개, 소장처 메타데이터의 추정 좌표 28건, 별도 귀속/표시 조건을 설정한 미리보기 8건을 확인했다. 이는 현재 공개 자료 수가 아니며 사료 전체의 독립적인 역사 검증이나 위치 현장 검증을 뜻하지 않는다. LOC 요청은 403이어서 성공 출처로 세지 않는다.

## 실제 Vercel 배포

- 새 프로젝트 `stock-project1/kenitoa-war-achive`, 프로젝트 ID `prj_C6635Sp3DbNxFO6bROTRe8GpZMG7`.
- 기존 `kenitoa-warsachive` 프로젝트는 변경하지 않았다.
- Git 연결: `kenitoa/War-Achive`, Production Branch `main`, Root Directory `Vercel`.
- 공개 주소: https://kenitoa-war-achive.vercel.app
- 최초 성공 배포: `dpl_8svkTTw4C4ptXDEJiMB3c28pexeY`.
- 최초 원격 빌드에서 npm ci와 lint·typecheck·16 tests·Next 정적 빌드 통과 후 READY.
- 최초 `/release.json` 공개본 `rel-a193ff96-64ab-4fe8-bc1e-6401c68edc52`, SHA-256 `877566900487044f68b6752c9b6b9857769e62f443bce2f63fc45cbce86ede17`이 당시 로컬 기준과 일치했다. 최신 NAS 발행 결과는 아래 별도 항목을 따른다.
- 주요 페이지 10개 HTTP 200, CSP·nosniff·frame DENY 확인. NAS/.env, /.env, NAS/back/.env, 관리자 설정 경로는 HTTP 404.
- 실제 배포 Edge의 12개 흐름, 모바일 주요 9개 경로, 릴리스 해시와 JavaScript 오류 0건 확인.
- 외부 미리보기 HEAD는 4개 200, 4개 429. 외부 이미지의 지속 가용성을 보장하지 않는다. 카드/상세의 429 대체 표시·출처 이동·재시도와 귀속 정보 보존은 격리된 브라우저 응답 검사 4개로 확인했다.

### 실제 공개 사이트 → Vercel 프록시 → NAS 회원·서재

2026-10-19(한국 시각), 소스 `6584311bb763d07ed887c6661eb7b5cf6b0d8764`의 Production 배포 `dpl_HvjoSYdg6nAKEXp2ECq3g7xNtuHQ`가 READY인 실제 공개 사이트에서 아래 9건이 통과했다. 검증 로그 `Vercel/artifacts/final-connected-account-20261018.log`의 실행 종료 코드는 0이다.

1. 비로그인 계정 API가 리디렉션 없이 JSON 401·no-store로 응답했다.
2. hydration 전 계정 입력·버튼이 비활성화되고 폼은 `method=post`로 비밀번호의 GET 전송을 방지했다.
3. 실제 NAS 회원가입이 201을 반환하고 별도 로그인을 안내했다.
4. 로그인 세션 쿠키의 HttpOnly·Secure·Path=/api/v1과 비캐시 응답을 확인했다.
5. 브라우저 서재를 실제 NAS에 revision 1로 저장하고 GET 재조회에서 메모 일치를 확인했다.
6. 잘못된 CSRF 토큰의 서재 갱신은 403으로 거부했다.
7. 로그아웃 후 비인증 서버 서재 조회는 401로 거부했다.
8. 재로그인한 검증용 계정과 해당 서버 서재를 삭제해 200을 확인했고 폐기된 세션은 401로 거부했다. 다른 계정이나 자료는 삭제하지 않았다.
9. 브라우저 JavaScript 런타임 오류는 0건이었다.

검사 후 실제 NAS DB를 읽기 전용으로 조회해 `ownSmokeAccountsRemaining=0`을 확인했다. 생성한 검증용 회원이 NAS에 남지 않았다는 별도 DB 증거다.

Next의 정적 페이지 trailing slash는 유지하며 `skipTrailingSlashRedirect=true`로 API의 308 리디렉션을 막았다. 실제 공개 사이트와 같은 origin의 6개 허용 API 경로만 프록시하고 관리자 API는 공개하지 않는다. 이 검증은 실제 회원·서재 저장과 세션 흐름의 성공을 확인한 것으로, 전체 NAS 복원이나 장기간 가용성 검증과 구분한다.

### 초기 PC 실행 발행 코드 → GitHub → 자동 Vercel 재배포 이력

기존 PC의 시스템 Git 인증을 프로세스 메모리에서만 사용해 실제 발행 코드를 실행했다. NAS/.env의 인증 비밀값은 바꾸거나 복사하지 않았다.

- 소스 커밋 `eac97f03b975680fad17b81e0cd1cf4c6efbd652`를 현재 저장소 main에 반영했다.
- NAS 발행기가 공개본을 GitHub에 PUT하고 다시 읽어 일치 확인: 커밋 `f763cfaa4b7eb426133d248568ac9e128f0962bb`.
- 이 커밋으로 시작된 Git 소스 배포 `dpl_7rr6z3cCXXiwhTi6NDBwpYGQ3Sj5`가 READY가 됐다.
- 당시 공개본 `rel-77075743-dbe1-4194-8d99-6ff9e2a89efb`, SHA-256 `42eca96064cbb4a8121053e3bf1e52016ca3b3f27afaabaa39185a66eeb3182a`, 공개 자료 118건.
- 실제 /release.json의 ID와 해시 확인 후 DB 발행 상태 published 및 manifest.evidence.verified=true를 확인했다.
- 당시 배포에서 Edge 12개 흐름과 390px 주요 9개 경로, 모의 이미지 429 대응 4개 흐름을 다시 통과했다. JavaScript 런타임 오류 0건.
- 후속 수집을 반영한 NAS 이전 bundle은 `NAS/data/transfer/nas-handoff-20261018/`이다. 4개 출처·230개 자료·597개 개정·415개 보존 원본을 포함하며 실제 NAS PostgreSQL로 이전했다.

이 항목은 PC에서 실행한 전송·자동 재배포 이력이다. 실제 NAS worker의 발행 결과와 구분한다.

### 실제 NAS worker → GitHub → 자동 Vercel 재배포

- NAS는 저장소 `kenitoa/War-Achive`에 한정한 쓰기 가능 SSH 배포 키와 고정 known hosts를 사용한다. PC의 개인 액세스 토큰을 NAS나 Vercel로 복사하지 않았다.
- 최초 NAS 공개본 `rel-16b86f0b-5a1c-475e-9e6c-a677099aa93a`는 자료 54건으로, GitHub 커밋 `b273218a5c4666ee46aa191959d9062f1134c140`을 생성했다. Vercel 배포 `dpl_HcgqhFmmVS9LoX8FzaPR9FdpMAHK`가 production READY가 되고 공개 `/release.json`이 일치한 뒤 NAS DB에서 발행 완료를 확인했다. 이 54건은 이전 bundle의 공개 상태를 반영한 수이며 원본이나 비공개 검토 자료의 손실을 뜻하지 않는다.
- 후속 실제 worker 발행 작업 `job-b541ee82-3cb4-4a6e-aa83-7f1a1b8967c7`은 시도 1회로 완료했다. 공개본 `rel-fa0d3710-8961-47d5-ad08-85640b3b9df4`, 공개 자료 93건, GitHub 커밋 `d2731a02dc9bcd6578bee581cf0c28d81368dc30`을 확인했다.
- 2026-10-18 13:26:38.752 UTC에 NAS가 실제 Vercel 공개 릴리스를 검증하고 발행 완료 상태와 검증 증거를 기록했다. 이 검증 시점의 공개 자료는 93건이며 NAS 전체 보존 자료 270건과 구분한다.
- 이 93건 공개 배포의 Edge 12개 흐름과 390px 주요 9개 경로가 통과했고 JavaScript 런타임 오류는 0건이었다.
- 후속 실제 정기 발행의 최신 확인 릴리스는 `rel-727e3b95-1253-4702-889c-18e56c8e7e3d`, 자료 93건, 커밋 `c3bc7b58f8ed51608c5e2da89c7d04eacfe5482d`, SHA-256 `c00afd65f8ca10e919ef7039c9bb95b100693f634aebbd8c1b3feefa4d57c0f0`다. 2026-10-18 14:17:43.050 UTC의 실제 사이트 검증 후 NAS DB 상태 published와 검증 증거를 확인했다.

Vercel Next.js 프리셋은 기본 .next manifest를 읽은 뒤 정적 export를 처리하므로 Output Directory override를 해제했다. 로컬 산출물 out을 Vercel 어댑터 출력으로 강제하면 manifest 탐색이 실패한다. [공식 Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build#output-directory), [공식 Next 어댑터](https://github.com/vercel/vercel/blob/main/packages/next/src/index.ts).

## 의존성·미검증 경계

NAS/back·NAS/admin 전체 감사와 공개 앱 운영 의존성 감사는 0건이다. 공개 앱 개발용 Next ESLint 경로의 braces 관련 수정 버전 없는 high 경고 5건은 남아 있다. 외부 자료를 glob 입력으로 사용하지 않으며 강제 다운그레이드로 lint를 무력화하지 않았다.

실제 NAS의 이미지 빌드·운영 PostgreSQL 이전·네 서비스의 healthy 상태·수집과 worker 발행·자동 재배포를 확인했다. 공개 회원 API 게이트웨이의 Funnel 적용·외부 HTTPS 6건·Vercel 프록시를 통한 실제 회원가입·로그인·서재 동기화·로그아웃·검증 계정 삭제를 포함한 운영 계정 검사 9건을 통과했다. SSH 포워딩이 NAS 정책으로 거부되어 실제 NAS 관리자 화면의 원격 브라우저 검사는 완료하지 않았다. 관리자 API를 공개 경로로 확장하지 않는다.

실제 NAS 전체 백업 복원·NAS 외부 백업 보관·S3/CDN 공급자·물리 모바일 기기·실환경 OTP는 미검증이다. Tailscale 인증 키의 현재 만료 시각은 2026-10-30 14:13:55 UTC(한국 시각 23:13:55)이며 만료 전 갱신이 필요하다. 소스·명령·시험용 HTTP 어댑터 검증을 해당 운영 환경의 성공으로 간주하지 않는다.

현재 공개 gateway를 거친 요청은 API에서 같은 gateway IP의 속도 제한을 공유한다. 회원가입과 제보 접수는 각각 해당 IP당 시간당 5회이므로 여러 이용자의 합산 요청이 제한에 도달할 수 있다. 실제 클라이언트 IP를 구분하려면 신뢰할 수 있는 프록시 경계와 전달 헤더 검증을 별도로 설계해야 한다.

NAS/.env의 기존 GitHub 토큰은 API 401 이력이 있으며 비밀값을 보존했다. 현재 실제 NAS 발행은 저장소 전용 SSH 배포 키로 성공했으므로 개인 액세스 토큰 갱신을 요구하지 않는다. 외부 메시지는 발송하지 않았다. 이전 배포 URL·Git 이력·제3자 복제본 삭제는 구현된 파일 cleanup과 별도 운영 범위다.
