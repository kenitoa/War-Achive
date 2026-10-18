# 공개 사이트 운영

## 책임과 계약

이 앱은 NAS가 발행한 `content/archive.json`만 읽는 정적 공개 사이트다. NAS가 중단되어도 이미 발행한 HTML·검색 데이터로 탐색한다. 계정·제안 접수는 별도 API를 명시적으로 연결했을 때만 사용한다.

`lib/generated-contract.ts`는 NAS의 `back/src/domain/contracts.ts`에서 동기화한다. API 타입을 별도로 고치지 않는다. 공개본이 없으면 실제 빈 상태를 표시하며, 공개본이 존재하지만 형식·참조·공개 범위가 잘못되면 빌드를 실패시킨다. 운영 자료를 흉내 낸 기록은 포함하지 않는다.

## 설치와 검증

Node.js 22 이상, npm 사용:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run preview -- --port 3100
```

`out/`가 정적 배포 산출물이다. 페이지 이동은 네이티브 HTML 링크를 사용하고, 검색·비교의 URL 상태는 공개본 안에서 처리하므로 라이브 RSC 서버에 의존하지 않는다. `npm run dev`는 개발 서버이고, 배포 검증은 `build` 후 정적 미리보기로 한다. 로컬 미리보기는 Vercel의 운영 보안 헤더나 실제 공급자 배포를 증명하지 않는다.

## Vercel

- Root Directory: `Vercel`
- Install: `npm ci`
- Build: `npm run lint && npm run typecheck && npm run test && npm run build`
- Output Directory: Next.js 프리셋 기본값(override 해제). 로컬 정적 내보내기 폴더는 `out`이지만 Vercel Next.js 어댑터의 출력 설정을 `out`으로 덮어쓰지 않는다.
- `vercel.json`에 정적 보안·캐시 헤더를 정의한다. HTML은 재검증, 해시를 포함한 Next 정적 파일은 장기 캐시한다.
- 전체 자료 업로드와 빌드는 NAS 발행 작업이 수행한다. 공개 사이트에서 원본 NAS 경로나 비밀값에 접근하지 않는다.
- 배포 성공 응답 외에 실제 릴리스 ID·페이지·미디어를 확인해야 발행 완료다.
- 철회 시 현재 사이트뿐 아니라 공개 파일, 검색 데이터, CDN, 과거 배포 URL에도 반영해야 한다. 빌드 자체가 과거 배포나 외부 저장소를 삭제하지 않는다.

## 선택적 계정 API

`NEXT_PUBLIC_API_ORIGIN`은 브라우저에 공개되는 HTTPS origin이다. 미설정이면 계정·접수 연결 안내만 표시하며 로컬 서재는 계속 사용할 수 있다. 개발용 localhost HTTP만 허용한다. 비밀키·관리자 URL을 이 값에 넣지 않는다.

Vercel은 배포 생성 시 `vercel.json`을 읽는다. **배포 소스를 업로드하기 전에** 동일 환경 변수로 다음을 실행한다.

```powershell
$env:NEXT_PUBLIC_API_ORIGIN = '운영 API의 HTTPS origin'
npm.cmd run configure:security
npm.cmd run build
```

이 명령은 `connect-src 'self'`에 정확한 API origin만 추가한다. Vercel 프로젝트 빌드 환경에도 같은 값을 설정한다. build는 CSP 누락이나 광범위한 연결 허용을 거부한다. 원격 빌드 도중에만 CSP를 생성하면 이미 읽힌 배포 설정에 반영되지 않을 수 있다.

API 서버는 공개 사이트의 정확한 origin에 대해 CORS와 credentials를 허용해야 한다. 서로 다른 사이트에 배포하면 쿠키 정책의 영향을 받으므로 사용자 정의 같은 사이트 도메인 또는 검증한 프록시 구성을 사용한다. session cookie는 API가 설정하며 localStorage에는 넣지 않는다.

### NAS의 공개 게이트웨이를 같은 출처로 연결

Vercel의 [외부 rewrite](https://vercel.com/docs/routing/rewrites)를 이용하여 브라우저 요청은 공개 사이트 origin에 남기고 NAS의 제한된 HTTPS 게이트웨이로 전달할 수 있다. 배포 소스를 업로드하기 전에 다음을 실행한다.

```powershell
$env:NEXT_PUBLIC_API_ORIGIN = 'https://kenitoa-war-achive.vercel.app'
$env:NAS_PUBLIC_GATEWAY_URL = '검증한 NAS 공개 게이트웨이의 HTTPS 주소'
npm.cmd run configure:gateway
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

`configure:gateway`는 `vercel.json`에 `/api/v1/accounts`, `/api/v1/account`, `/api/v1/account/session`, `/api/v1/account/shelf`, `/api/v1/account/reset`, `/api/v1/requests` 여섯 경로만 추가한다. 포괄적인 `/api/:path*` rewrite를 사용하지 않는다. 계정 응답에는 브라우저·CDN 모두 `no-store`를 적용한다. `NAS_PUBLIC_GATEWAY_URL`은 배포 설정을 생성하는 공개 주소이며 HTTPS origin 또는 `/war-archive-api` prefix를 지원한다. 기존 NAS 호스트의 다른 서비스 경로는 변경하지 않는다. 브라우저 코드에 비밀키를 추가하는 변수가 아니다.

Next.js의 `trailingSlash: true`는 정적 페이지를 `경로/index.html`로 내보내기 위해 유지한다. `skipTrailingSlashRedirect: true`로 API 요청에 자동으로 `/`를 붙이는 리디렉션을 끄며 여섯 API 경로는 요청한 주소 그대로 프록시한다. 기본 리디렉션을 다시 켜면 `/api/v1/account/session`이 308 응답 후 프록시되지 않는 주소로 바뀔 수 있다. 배포 후 해당 API가 리디렉션 없이 401 JSON·`no-store`를 반환하는지 계정 브라우저 검사에서 먼저 확인한다. 롤백은 라우팅 설정과 프록시 변경을 함께 되돌리며 NAS DB나 원본은 변경하지 않는다.

NAS 게이트웨이는 위 경로의 지원 HTTP 메서드만 전달하고 관리자·원본·수집 경로를 거부해야 한다. API의 `PUBLIC_ACCOUNT_API_ENABLED=true`, 정확한 공개 사이트 `ALLOWED_ORIGINS`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`를 함께 설정한다. Vercel 프로젝트의 빌드 환경에도 같은 `NEXT_PUBLIC_API_ORIGIN`을 지정한다. 쿠키는 NAS 응답의 Domain 없는 HttpOnly 쿠키를 프록시를 통해 공개 사이트에 저장하며, 브라우저 저장소에는 인증 토큰을 넣지 않는다.

현재 API는 전달받은 클라이언트 IP 헤더를 신뢰하지 않는다. 따라서 NAS gateway를 거치는 공개 요청은 하나의 주소로 합산되며, 회원가입·자료 접수는 각각 시간당 5회, 회원 로그인은 분당 10회 제한을 공유한다. 이는 초기 운영의 보수적인 한도이며 여러 사용자의 요청으로 429가 발생할 수 있다. 이용자별 제한으로 확장할 때는 신뢰할 수 있는 프록시 식별 경계를 먼저 검증한다. 임의의 `X-Forwarded-For`를 신뢰하거나 제한을 제거하지 않는다.

회원가입은 계정 생성만 수행하고 별도 로그인으로 세션을 시작한다. 실제 배포 후 회원가입 → 로그인 → 서재 저장·재조회 → 로그아웃 → 비인가 조회 거부까지 확인해야 연결을 검증한 것으로 간주한다. 로컬 유닛 테스트와 프록시 설정 생성 성공만으로 실제 NAS·Vercel 왕복을 검증했다고 보고하지 않는다.

`RUN_ACCOUNT_WRITE_TEST=1`과 대상 `BASE_URL`을 명시한 뒤 `npm run test:account`를 실행하면 위 흐름과 CSRF 거부, 검증 계정 삭제까지 실제 브라우저에서 확인한다. 이 검사는 실행 중 만든 일회성 검증 계정과 그 서재에만 쓰며, 임의 비밀번호는 메모리에만 보관한다. 정상 종료 시 해당 계정을 삭제하고 실패 시에도 정리를 시도한다. 다른 운영 계정이나 운영 서재는 변경하지 않는다.

| 작업 | 경로 |
|---|---|
| 회원가입 | `POST /api/v1/accounts` |
| 로그인·조회·로그아웃 | `POST/GET/DELETE /api/v1/account/session` |
| 비밀번호 재설정 | `POST /api/v1/account/reset` |
| 본인 계정·서버 서재 삭제 | `DELETE /api/v1/account` |
| 서재 조회·낙관적 갱신 | `GET/PUT /api/v1/account/shelf` |
| 자료·정정 접수 | `POST /api/v1/requests` |

서재는 서버 revision을 읽은 후 사용자가 병합·업로드를 선택한다. 409 충돌은 서버본 재확인을 요구한다. 비밀번호 재설정은 운영자 발급 일회성 토큰 경로이며 연결되지 않은 이메일 발송을 가장하지 않는다.

## 서재 보존

- `war-archive.shelf.v1`: 현재 서재
- `war-archive.shelf.backup.v1`: 직전 유효 저장본
- 손상된 서재는 자동 덮어쓰기 금지. 원본 내보내기·이전본 복구·명시적 새 시작을 제공한다.
- 파일 가져오기는 2MB·스키마·중복 ID·모음 참조를 검증한다.
- 병합 시 양쪽 메모를 보존하며 충돌한 모음 ID를 재매핑한다.
- 현재 공개본에 없는 자료도 저장한 메모를 보존한다.
- 브라우저 동시 탭의 동시 편집에는 사용자 수준의 충돌 위험이 있으므로 중요한 메모는 내보내기로 백업한다. 서버 동기화는 revision으로 충돌을 감지한다.

## 출처·미디어

공개본의 원문 URL과 권리 표시를 사용한다. 썸네일은 별도의 media.displayAllowed와 전체 귀속 정보가 있을 때만 표시한다. 원본 파일의 표시·다운로드·재사용 권한은 별도로 판단한다. 민감 이미지의 카드 썸네일은 표시하지 않고 상세 열람은 사전 안내 후 선택한다. 제작자·credit·license가 있으면 상세 열람 아래 표시한다. 외부 미디어 가용성·실제 권리 충족은 자료별 검수와 별도로 검증해야 한다.

세계 지도는 public domain인 Natural Earth 육지 윤곽을 사용한다. 자료의 명시된 좌표만 표시한다. 당시 국경·현장 좌표의 정확성을 추정하지 않는다.

## 의존성 검사

2026-10-18 설치 시 운영 의존성에 보고된 취약점은 없었으나, 개발용 `eslint-config-next`의 `fast-glob → micromatch → braces` 경로에 GHSA-vfj7-8cjw-p6xm(수정 버전 없음)이 보고되었다. 신뢰하는 저장소의 고정 lint glob만 실행하며 외부 자료를 glob 입력으로 전달하지 않는다. 임의 강제 다운그레이드를 적용하지 않는다. 배포 전 `npm audit`으로 상태를 다시 확인한다.

## 외부 미디어 연결 실패

공급자의 429·연결 실패 시 카드에는 미리보기 지연 안내를, 상세에는 오류 안내·원 소장처 링크·명시적 재시도를 표시한다. 제작자·라이선스·출처 메타데이터는 유지하며 깨진 이미지 요소를 계속 노출하지 않는다. 자동 반복 다운로드나 원본 복제를 수행하지 않는다. 검증은 npm run test:media의 브라우저 모의 429로 수행할 수 있으며, 실제 외부 공급자의 가용성 검증과 구분한다.

브라우저 검증은 BASE_URL과 BROWSER_ARTIFACT_DIR로 대상과 증거 폴더를 분리할 수 있다. 운영 사이트에서 실행해도 서재 조작은 격리된 브라우저 저장소만 사용하며 서버 계정이나 서버 서재에 쓰지 않는다.
