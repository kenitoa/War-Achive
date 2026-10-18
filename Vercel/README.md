# 전쟁 아카이브 · 공개 사이트

NAS가 수집·정제·승인하여 발행한 자료를 Next.js 정적 사이트로 제공합니다. 원자료·출처·이용 조건·검수 상태를 함께 표시하며 NAS의 실시간 가동 여부와 별개로 공개본을 열람할 수 있습니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

프로덕션 확인은 `npm.cmd run build` 후 `npm.cmd run preview -- --port 3100`으로 실행합니다. Vercel의 Root Directory는 `Vercel`이며 Next.js 프리셋의 Output Directory override는 해제합니다. 로컬 정적 내보내기 산출물은 `out/`입니다.

- `/wars/`: 전쟁별 개요와 연결된 기록
- `/archive/`: URL 기반 검색·필터·페이지
- `/archive/[id]/`: 자료·출처·인용·권리·검수·변경 이력
- `/entities/[id]/`: 사건·인물·장소·조직·장비
- `/collections/`: 편집 모음
- `/explore/`: 지도·연표 연결 탐색
- `/shelf/`: 브라우저 서재·메모·모음·비교·백업·복구
- `/about/`: 수집 범위·공개·권리·개인정보 정책
- `/account/`, `/contribute/`, `/corrections/`: 선택적 API 연결 기능과 미연결 안내

`content/archive.json`은 NAS 발행 산출물이며 `lib/generated-contract.ts`는 NAS와 동기화한 계약입니다. 두 파일을 앱에서 임의로 편집하지 않습니다. 공개본이 없으면 준비 상태를 표시합니다.

`NEXT_PUBLIC_API_ORIGIN`은 선택적 공개 API 주소입니다. 기본값은 미설정이며 로컬 서재·자료 탐색에는 필요하지 않습니다. API를 연결할 경우 배포 시작 전 `npm.cmd run configure:security`로 정확한 origin을 CSP에 반영해야 합니다.

NAS Docker의 공개 계정·서재·접수 API를 Vercel과 같은 출처에서 사용할 때는 `NEXT_PUBLIC_API_ORIGIN`에 공개 사이트 origin을, `NAS_PUBLIC_GATEWAY_URL`에 검증된 NAS HTTPS 게이트웨이 주소를 설정하고 `npm.cmd run configure:gateway`를 실행합니다. 게이트웨이 주소는 HTTPS origin 또는 기존 서비스를 보존하는 `/war-archive-api` prefix를 지원합니다. 이 명령은 여섯 공개 경로의 정확한 rewrite와 비캐시 헤더를 생성합니다. 관리자·수집·원본 파일 API는 연결하지 않습니다. 게이트웨이 자체에서도 허용한 경로와 HTTP 메서드를 검증해야 합니다.

설치·검증·환경 변수·발행·철회·API·복구의 상세 절차는 [운영 문서](docs/operations.md)를 참고하세요. 실제 NAS/Vercel 배포와 외부 API 연결 여부는 별도 증거로 확인해야 합니다.
