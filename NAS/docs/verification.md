# 구현 및 검증 기록

검증일: 2026-10-18. 이 기록은 로컬·실제 외부 수집·실제 웹 배포와 미검증 운영 환경을 구분한다. 세 앱은 Node.js 22/npm, 각자의 package-lock.json을 사용한다.

실제 NAS 재배포는 진행 중이며 최종 성공은 아직 확인되지 않았다. 설치·접근 경로·업데이트 잠금·SSH 배포 키 구성은 [전용 NAS 배포 문서](../deployment/README.md)를 따른다. 아래 PC에서 확인한 수집·Vercel 배포 이력과 NAS의 최종 운영 결과는 구분한다.

## 구현 연결

| 요구 | 구현 | 검증 범위 |
|---|---|---|
| NAS/Vercel 작업 폴더 분리 | 비밀값·원본·DB는 NAS, 공개 웹만 Vercel | Git 후보/배포 staging 비밀값 검사 |
| 지속 수집 | 출처별 과거·증분·순환 재확인, DB checkpoint/작업 큐 | 실제 Commons 입수, 임대/중복/재시작/변경 회귀 검사 |
| 지속 정제·자료 제작 | 원본 해시·버전·검수 후보·파일 제작/권리 | 실제 텍스트/sharp, HTTP S3 시험 서버, 불가 도구 상태 |
| 지속 자동 업로드 | GitHub 공개본·원격 재조회·Vercel 실제 해시 확인 | 어댑터 회귀, 현재 저장소 Git 연결·실제 배포 |
| 공개 탐색 | 전쟁/검색/자료/사전/모음/지도/연표/서재 | 정적 빌드·로컬 및 실제 배포 Edge 검사 |
| 관리자 운영 | 10개 메뉴·역할·검수·작업·발행·감사·복구 | 실제 로컬 API 브라우저, 서버 권한/CSRF 검사 |
| 계정과 개인 정보 | scrypt·세션 해시·소유자·서재 revision·복구·계정 삭제 | 실제 DB/API 통합 검사. 공개 게이트웨이 미연결 |
| 보존·철회 | 원본 불변 보존·공개본 guard·범위 cleanup | 파일 무결성·권리 취소·S3 삭제/재시도/CDN HTTP 검사 |
| 백업·운영 | 전체 DB/원본 백업·암호화·새 환경 복원·Compose | 로컬 복원/암호화 검사. 실제 NAS/Docker 미검증 |

## 앱 검사

- NAS/back: 로컬 lint·typecheck·test 36건·build 통과. portable 이전 CLI와 원본/DB 이전, 메타데이터 전용 제작물 재생성, 지연 발행 검증 증거, 물리 복구의 세션 무효화, Git 배포 키 회귀 검사를 포함한다. NAS Docker 재빌드 결과는 별도 확인 중이다.
- NAS/admin: lint·typecheck·test 4건·build 통과. 실제 API 9231에서 데스크톱 10개 메뉴, 390px 모바일 7개 메뉴, 자료·원본 목록·이전 개정 조회와 로그인·로그아웃 통과. 자료 쓰기를 수행하지 않았다. 출처 후보 반영은 브라우저 GET에만 격리한 UI 검사다.
- Vercel: lint·typecheck·test 16건·build 140개 경로 통과. 로컬 Edge 11개 핵심 흐름과 390px 주요 9개 경로 통과. JavaScript 런타임 오류 0건. 연결된 회원 API UI는 미검증이며 미연결 안내를 확인했다.
- 공용 계약: `node NAS/scripts/sync-contracts.mjs --check` 통과.
- Portable 이전 회귀 검사: 새로운 PGlite DB와 CLI 기본 경로, ID/checkpoint/철회/서재/원본 보존, 인증 세션 제외, lease 재대기, ingest sequence 보존, 비어 있지 않은 대상/변조 거부 통과.
- 최신 이전 준비 bundle: `NAS/data/transfer/nas-handoff-20261018/`. manifest 기준 4개 출처·230개 자료·597개 개정·415개 보존 원본이다. 로컬 portable 이전 회귀 검사와 이 준비본의 실제 NAS PostgreSQL 가져오기는 구분하며, 후자는 아직 성공을 확정하지 않았다.
- 최종 Git 소스 156개 파일 검사에서 실제 환경 비밀값/토큰 패턴/운영 데이터 유입 0건. NAS/.env·기존 back/.env·DB·원본·이전 bundle·스크린샷은 Git에서 제외했다.

## 실제 수집과 공개 자료

Commons에서 120건 원본 응답을 보존했고 118건을 공개했다. 민감도 검토 자료 2건은 공개본에서 제외했다. 초기 공개본의 전쟁 3개, 모음 3개, 장소 참조 2개, 소장처 메타데이터의 추정 좌표 28건, 별도 귀속/표시 조건을 설정한 미리보기 8건을 확인했다. 이는 사료 전체의 독립적인 역사 검증이나 위치 현장 검증을 뜻하지 않는다. LOC 요청은 403이어서 성공 출처로 세지 않는다.

## 실제 Vercel 배포

- 새 프로젝트 `stock-project1/kenitoa-war-achive`, 프로젝트 ID `prj_C6635Sp3DbNxFO6bROTRe8GpZMG7`.
- 기존 `kenitoa-warsachive` 프로젝트는 변경하지 않았다.
- Git 연결: `kenitoa/War-Achive`, Production Branch `main`, Root Directory `Vercel`.
- 공개 주소: https://kenitoa-war-achive.vercel.app
- 최초 성공 배포: `dpl_8svkTTw4C4ptXDEJiMB3c28pexeY`.
- 실제 원격 빌드에서 npm ci와 lint·typecheck·16 tests·Next 정적 빌드 통과 후 READY.
- `/release.json`의 공개본 `rel-a193ff96-64ab-4fe8-bc1e-6401c68edc52`, SHA-256 `877566900487044f68b6752c9b6b9857769e62f443bce2f63fc45cbce86ede17`이 로컬 기준과 일치했다.
- 주요 페이지 10개 HTTP 200, CSP·nosniff·frame DENY 확인. NAS/.env, /.env, NAS/back/.env, 관리자 설정 경로는 HTTP 404.
- 실제 배포 Edge의 12개 흐름, 모바일 주요 9개 경로, 릴리스 해시와 JavaScript 오류 0건 확인.
- 외부 미리보기 HEAD는 4개 200, 4개 429. 외부 이미지의 지속 가용성을 보장하지 않는다. 카드/상세의 429 대체 표시·출처 이동·재시도와 귀속 정보 보존은 격리된 브라우저 응답 검사 4개로 확인했다.

### 실제 NAS 발행 코드 → GitHub → 자동 Vercel 재배포

기존 PC의 시스템 Git 인증을 프로세스 메모리에서만 사용해 실제 발행 코드를 실행했다. NAS/.env의 인증 비밀값은 바꾸거나 복사하지 않았다.

- 소스 커밋 `eac97f03b975680fad17b81e0cd1cf4c6efbd652`를 현재 저장소 main에 반영했다.
- NAS 발행기가 공개본을 GitHub에 PUT하고 다시 읽어 일치 확인: 커밋 `f763cfaa4b7eb426133d248568ac9e128f0962bb`.
- 이 커밋으로 시작된 Git 소스 배포 `dpl_7rr6z3cCXXiwhTi6NDBwpYGQ3Sj5`가 READY가 됐다.
- 최종 공개본 `rel-77075743-dbe1-4194-8d99-6ff9e2a89efb`, SHA-256 `42eca96064cbb4a8121053e3bf1e52016ca3b3f27afaabaa39185a66eeb3182a`, 공개 자료 118건.
- 실제 /release.json의 ID와 해시 확인 후 DB 발행 상태 published 및 manifest.evidence.verified=true를 확인했다.
- 최종 배포에서 Edge 12개 흐름과 390px 주요 9개 경로, 모의 이미지 429 대응 4개 흐름을 다시 통과했다. JavaScript 런타임 오류 0건.
- 후속 수집을 반영한 최신 NAS 이전 준비본은 `NAS/data/transfer/nas-handoff-20261018/`이다. 4개 출처·230개 자료·597개 개정·415개 보존 원본을 포함하며, 위 PC 발행 이력과 별도로 NAS 이전 결과를 확인한다.

이 증거는 PC에서 실행한 실제 한 차례의 전송·자동 재배포 경로를 검증한 것이다. NAS 상시 운전은 저장소 전용 SSH 배포 키를 사용하는 별도 배포 구성으로 검증 중이다.

Vercel Next.js 프리셋은 기본 .next manifest를 읽은 뒤 정적 export를 처리하므로 Output Directory override를 해제했다. 로컬 산출물 out을 Vercel 어댑터 출력으로 강제하면 manifest 탐색이 실패한다. [공식 Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build#output-directory), [공식 Next 어댑터](https://github.com/vercel/vercel/blob/main/packages/next/src/index.ts).

## 의존성·미검증 경계

NAS/back·NAS/admin 전체 감사와 공개 앱 운영 의존성 감사는 0건이다. 공개 앱 개발용 Next ESLint 경로의 braces 관련 수정 버전 없는 high 경고 5건은 남아 있다. 외부 자료를 glob 입력으로 사용하지 않으며 강제 다운그레이드로 lint를 무력화하지 않았다.

실제 NAS의 최종 이미지 빌드·운영 PostgreSQL 이전·서비스 건강 상태·상시 수집/발행·공개 회원 API gateway는 확인 중이다. 실제 S3/CDN 공급자·물리 모바일 기기·실환경 OTP는 미검증이다. 소스·명령·시험용 HTTP 어댑터 검증을 해당 운영 환경의 성공으로 간주하지 않는다.

NAS/.env의 기존 GitHub 토큰은 API 401 이력이 있으며 비밀값을 보존했다. 현재 전용 NAS 배포는 SSH 배포 키를 사용하므로 개인 액세스 토큰 갱신을 요구하지 않는다. NAS에서의 실제 업로드와 Vercel 반영 성공은 별도 확인한다. 외부 메시지는 발송하지 않았다. 이전 배포 URL·Git 이력·제3자 복제본 삭제는 구현된 파일 cleanup과 별도 운영 범위다.
