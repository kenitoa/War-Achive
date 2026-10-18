# 운영·배포·복구

최종 검증일: 2026-10-19(한국 시각). NAS의 개별 작업 증거는 아래에 기록한 UTC 시각을 따른다.

## 책임과 데이터 흐름

NAS가 원본·DB·계정·검수·큐를 소유한다. 공개 웹은 공개 스키마를 통과한 snapshot만 읽는다. Vercel의 로컬 파일 시스템에 운영 DB를 두지 않는다.

`출처 API → 원본 해시/원문 보존 → 수집 checkpoint → 정규화/버전 → 검수 → 자료 제작 → 공개 snapshot/manifest → GitHub → Vercel → 실제 release.json 확인`

초기 수집과 증분 수집은 페이지 크기·위치를 저장한다. 별도의 일일 순환 재확인이 알려진 식별자의 출처 변경·삭제를 확인한다. 출처 삭제는 원본을 지우지 않고 검토 상태와 경고로 기록한다. 사람이 검수한 설명은 새 원문으로 자동 덮어쓰지 않고 변경 후보로 남긴다.

## 첫 NAS 배포

현재 `/volume3/docker/War_Archive_Server`의 자동 배포는 [전용 NAS 배포 문서](../deployment/README.md)를 따른다. 실제 운영 설정은 해당 경로의 `shared/.env`이며 PC의 `NAS/.env`와 구분한다. 저장소 전용 SSH 배포 키를 읽기 전용으로 마운트하고 API·관리자는 loopback 9231, 공개 gateway는 loopback 9232에 바인딩한다. 아래 루트 Compose 명령은 별도의 수동 구성·복구 참고 절차이므로 전용 자동 배포 절차와 구분한다.

1. `NAS/.env`, 기존 DB·원본을 비공개 백업한다. 비밀값을 Git에 추가하지 않는다.
2. NAS에 `NAS/`만 복사하고 `node scripts/configure-nas.mjs --production`으로 비어 있는 초기 설정을 생성한다. Docker Engine/Compose와 Node.js 22 이상이 필요하다.
3. `docker compose config --quiet`와 `docker compose build`를 실행한다. 실제 `.env`가 포함된 `docker compose config` 전체 출력은 공유하지 않는다.
4. `docker compose up -d db`로 DB를 준비하고 건강 상태를 확인한다.
5. **API/worker를 올리기 전** `docker compose run --rm api node dist/commands/migrate.js`를 한 번 실행한다. 마이그레이션은 번호순 추가형이며 같은 DB에 여러 마이그레이션 프로세스를 동시에 실행하지 않는다.
6. `docker compose up -d api worker` 후 `/healthz`, 관리자 로그인, worker heartbeat, 큐, 로그를 확인한다.
7. 출처의 범위·주기·공개 정책을 검토하고 작은 배치로 실제 수집·검수·발행을 확인한다.

Compose는 PostgreSQL 볼륨, 원본/제작물 볼륨, 공개 릴리스 볼륨을 분리한다. API/worker는 비루트 사용자이며 관리자 포트는 NAS loopback에만 연다. `docker compose down -v`, DB 초기화, 볼륨 삭제는 운영 절차에 포함하지 않는다.

수동 Compose의 컨테이너 내부 포트는 4310이며 관리자 외부 포트는 NAS/.env의 ADMIN_PORT다. 현재 전용 배포의 관리실은 Tailscale에 연결한 PC에서 `https://stock-platform.tail498403.ts.net:8446/admin/`로 접속한다. API 자체는 NAS loopback 9231에 유지하고 Tailscale 내부 HTTPS 8446만 연결했다. 해당 포트에 Funnel 권한은 없으며 기존 다른 서비스 설정도 보존했다. 정확한 HTTPS origin을 ALLOWED_ORIGINS에 추가한 뒤 원격 브라우저의 10개 메뉴 조회를 소스 `a0273a4`에서 확인했고, 최종 앱 소스 `95293fc`에서도 2026-10-18 16:14:40 UTC에 Chrome 로그인과 현황 조회를 확인했다. SSH TCP forwarding 차단 정책은 변경하지 않았으며 공개 gateway에는 관리자 페이지나 관리자 API를 전달하지 않는다.

### 실제 NAS 운영 확인 — 2026-10-18

- DSM의 `War Archive auto deploy` 작업은 일반 NAS 사용자로 5분마다 실행한다. `main`의 NAS 소스가 바뀌면 빌드·검증·백업·마이그레이션·건강 확인 후 활성화한다. 실행 잠금은 중복 배포를 막고, 활성화된 소스로 bootstrap을 교체한다.
- 커밋 `892c6dc41d2dc45690f50c224d301d9f95c712b8`에 이어 소스 `4a46ade2a5ef1463678fba29b5085bafcfc23fbc`의 자동 재배포를 확인했다. `war-archive` 프로젝트의 PostgreSQL·API·worker·publicgateway 네 컨테이너가 모두 healthy이며 기존 다른 NAS 서비스는 유지했다.
- 최종 앱 소스 `95293fc2751b7b66e690f3f0f7b4f2bad0f0042e`는 2026-10-18 16:17:13 UTC의 읽기 전용 검사에서 활성 상태·실제 이미지 일치와 네 서비스 healthy를 확인했다. 기존 NAS 서비스 10개와 기존 HTTPS 경로·포트는 유지됐고 검증용 회원은 0개였다. 가입·접수 각각 시간당 100회와 proxy 헤더 비신뢰도 실제 배포의 컴파일된 API에서 확인했다. 이후 배포·백업 도구 변경은 해당 도구 검사와 구분한다.
- 후속 배포·백업 도구 소스 `d1a91a1`도 실제 NAS의 활성 상태와 `state/bootstrap.json`의 보조 파일 7개 반영을 확인했다. 2026-10-18 16:31 UTC에 네 서비스 healthy를 재확인했고, 컨트롤러 10건은 운영 데이터와 분리한 NAS Linux 검사에서 통과했다. 앱 기능의 전체 검증 기준 소스는 위 `95293fc`로 유지한다.
- 2026-10-18 13:45:00.738 UTC의 실제 PostgreSQL 읽기 전용 재검사에서 마이그레이션 6개, 자료 270개, 개정 637개를 확인했다. 보존 원본 455개 전부와 인용·출처 설명·메타데이터 제작 파일 810개 전부의 SHA-256이 일치했다. 메타데이터 제작 완료 자료는 270개다. 이는 후속 자동 재배포 이후에도 영속 볼륨의 데이터와 파일이 유지된 결과다.
- NAS에서 실제 Commons 수집을 실행해 이전 자료 230개에 새 자료 40개가 추가됐다. 현재 승인된 Commons 출처의 수집 간격은 6시간, 발행 배치 간격은 2시간, worker의 스케줄 확인 간격은 1분이다. 출처의 승인·활성 상태와 checkpoint에 따라 실행하며 검수 대기 자료는 자동 공개하지 않는다.
- PC의 PGlite worker는 종료했고 로컬 `LOCAL_WORKER_ENABLED=false`로 두었다. 운영 수집·정제·제작·발행의 실행 주체는 NAS worker다. VS Code 수정 → `main` push 후 NAS는 DSM 작업으로 백엔드 변경을 감지해 업데이트하고, Vercel은 Git 연결로 공개 웹을 배포한다.
- NAS 내부 API 검사 14건에서 비로그인 관리자·서재 접근 차단, 공개 gateway의 관리자 차단, 허용하지 않은 Origin 차단, 관리자 로그인·현황 조회·CSRF·로그아웃 후 세션 차단과 미디어 도구 설치를 확인했다. 이 API 검사와 별도로 위 Tailscale 내부 HTTPS의 원격 Chrome 검증을 완료했다.

사용자가 승인한 DSM 관리자 일회성 작업으로 `stock-platform.tail498403.ts.net:443`의 `/war-archive-api` 경로 설정을 적용했다. 검증된 `configure-funnel.py` 결과는 `status=applied`, `attempts=1`, `priorConfigurationPreserved=true`다. 기존 HTTPS 설정을 보존하며 공개 gateway로 전달할 해당 경로만 추가했다. 2026-10-18 14:45:31.899 UTC의 실제 공개 HTTPS 검사 6건에서 health 200, 비인증 회원 세션·서재 401, 관리자 로그인·페이지 404, 미허용 Origin의 회원가입 403과 no-store 응답을 확인했다. Vercel Production의 `NEXT_PUBLIC_API_ORIGIN`은 공개 웹 자체 origin으로 설정했다.

2026-10-19(한국 시각)에 실제 공개 사이트의 배포 소스 `6584311bb763d07ed887c6661eb7b5cf6b0d8764`, Vercel 배포 `dpl_HvjoSYdg6nAKEXp2ECq3g7xNtuHQ`가 READY인 상태에서 운영 계정 검사 9건을 통과했다. 회원가입 201과 별도 로그인, HttpOnly·Secure·Path=/api/v1 세션 쿠키, NAS 서재 저장 revision 1과 메모 재조회, 잘못된 CSRF 403, 로그아웃 후 401, 재로그인 후 검증용 계정·해당 서재 삭제 200과 세션 폐기를 확인했다. 브라우저 런타임 오류는 0건이며 검증용 계정은 정리했다. 실제 결과는 `Vercel/artifacts/final-connected-account-20261018.log`에 비공개로 보관한다.

API의 자동 trailing slash 리디렉션은 `skipTrailingSlashRedirect=true`로 방지하고 정적 페이지의 trailing slash 설정은 유지한다. 비로그인 API가 리디렉션 없이 JSON 401·no-store로 응답하는지 확인했다. 계정 폼은 hydration 전 입력·버튼이 비활성화되며 `method=post`를 사용해 비밀번호의 GET 전송을 막는다. 운영 회원 동기화는 공개 사이트 → Vercel의 6개 허용 API 경로 → NAS 공개 gateway → PostgreSQL 순서로 처리한다.

### 현재 Windows 자료를 새 NAS PostgreSQL로 이전

폴더 복사만으로 Windows PGlite의 행이 PostgreSQL에 들어가지는 않는다. `NAS/data/transfer/nas-handoff-20261018/`의 portable 논리 bundle은 4개 출처·230개 자료·597개 개정·415개 보존 원본을 포함하며, 실제 새 NAS PostgreSQL 가져오기를 완료했다. 이후 NAS 수집으로 증가한 수량은 위 운영 확인 기록을 따른다. 이 bundle은 공개 Git에서 제외하며 회원/연락처 등이 포함될 수 있으므로 비공개로 보호한다. 이미 운영 중인 NAS에 다시 가져오지 않는다.

다음 명령은 향후 별도의 새 NAS를 준비할 때만 사용한다. 새 DB를 생성·마이그레이션한 뒤, API와 worker를 시작하기 전에 실행한다. 대상 DB는 마이그레이션만 적용한 빈 DB이고 `/var/lib/war-archive` 볼륨은 비어 있어야 한다. bundle에는 컨테이너 UID 1000의 읽기 권한만 필요한 범위로 부여하고 전체 공개 권한을 주지 않는다.

```sh
docker compose run --rm --no-deps -T --volume "$PWD/data/transfer/nas-handoff-20261018:/import:ro" api node dist/commands/import-portable.js /import /var/lib/war-archive /var/lib/war-archive-releases
```

가져오기는 테이블/열 허용 목록과 migration 파일 해시, 원본 해시, 경로, 행 수를 검사한다. 원본 경로를 NAS로 바꾸고 ID·출처 checkpoint·개정·철회를 보존한다. 로그인 세션과 비밀번호 재설정 토큰은 이전하지 않는다. 실행 중 lease는 다시 대기 상태로 만들고 파생 파일을 재제작한다. 기존 운영 DB/파일은 덮어쓰지 않는다. 이번 NAS 이전과 재제작 후 파일 해시 검사를 통과했다.

새 bundle 생성은 API/worker를 종료한 뒤 `NAS/back`에서 `node dist/commands/export-portable.js <존재하지 않는 새 bundle 경로>`로 수행한다. 로컬 시험 가져오기는 `node dist/commands/import-portable.js <bundle 경로> <새 데이터 경로> <새 발행 경로>`다. 마지막 경로를 생략하면 `<새 데이터 경로>/releases`를 사용하므로 발행 볼륨이 별도인 NAS에서는 반드시 명시한다. v2는 모든 과거 제작 파일과 발행본을 함께 보존하고, v1은 원본 중심의 이전 형식이므로 이력 파일 보존 여부를 결과에 표시한다. 자세한 검증은 [이관 이력 보존](PORTABLE_HISTORY.md)을 따른다. 서로 다른 저장 엔진을 이전하는 portable 형식, PGlite 물리 백업, NAS dump/tar 백업은 구분한다.

## 자동 발행 연결

확정 대상은 `kenitoa/War-Achive`, `main`, `Vercel/content/archive.json`이다. 이전 `kenitoa/warsachive`와 기존 Vercel `kenitoa-warsachive`는 이 프로젝트의 대상이 아니다.

1. 전용 NAS 배포에서는 저장소 쓰기 권한의 SSH 배포 키와 검증한 GitHub 호스트 키를 준비한다. `shared/.env`의 `GITHUB_FRONT_SSH_KEY_PATH`, `GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH`가 읽기 전용 secret 마운트를 가리키도록 한다. 이 방식에는 `GITHUB_FRONT_TOKEN`이 필요 없다. 키 준비와 권한은 [전용 배포 문서](../deployment/README.md)를 따른다.
2. Vercel 프로젝트의 Git 연결이 위 저장소를 가리키고 Production Branch가 `main`, Root Directory가 `Vercel`인지 확인한다.
3. 실제 배포의 `https://<도메인>/release.json`을 `PUBLIC_ARCHIVE_VERIFY_URL`로 설정한다.
4. `REMOTE_PUBLISH_ENABLED=true`로 바꾸고 API/worker를 재시작한다. 작은 공개 변경으로 GitHub 커밋과 실제 사이트 릴리스 ID·SHA-256을 확인한다.
5. GitHub 업로드 성공과 실제 배포 확인을 구분한다. 배포 대기 상태는 주기적으로 재확인하고 실패 작업은 관리자에서 원인 확인 후 재시도한다.

GitHub 파일 갱신은 현재 파일 SHA를 사용하며 충돌을 덮어쓰지 않는다. 재시도는 동일 릴리스의 고정 snapshot을 사용한다. 철회와 발행은 DB guard로 순서를 맞춰 이전 공개본의 재전송을 방지한다. 배포가 실패하면 마지막 정상 공개본이 유지되며 새 릴리스 완료로 표시하지 않는다.

실제 NAS의 첫 SSH 발행은 커밋 `b273218a5c4666ee46aa191959d9062f1134c140`, 릴리스 `rel-16b86f0b-5a1c-475e-9e6c-a677099aa93a`의 공개 자료 54개를 전송했다. GitHub를 통한 Vercel Production 배포와 공개 `release.json`의 ID·해시 일치를 확인해 published로 완료했다. 이어 NAS worker가 실제 발행 작업 `job-b541ee82-3cb4-4a6e-aa83-7f1a1b8967c7`을 한 번에 완료했다. 릴리스 `rel-fa0d3710-8961-47d5-ad08-85640b3b9df4`의 공개 자료 93개, 커밋 `d2731a02dc9bcd6578bee581cf0c28d81368dc30`은 2026-10-18 13:26:38 UTC에 실제 사이트 검증까지 통과했다.

후속 정기 발행의 최신 확인 릴리스는 `rel-727e3b95-1253-4702-889c-18e56c8e7e3d`, 공개 자료 93개, 커밋 `c3bc7b58f8ed51608c5e2da89c7d04eacfe5482d`다. 2026-10-18 14:17:43.050 UTC에 실제 공개본을 검증하고 published로 완료했다. SHA-256은 `c00afd65f8ca10e919ef7039c9bb95b100693f634aebbd8c1b3feefa4d57c0f0`이다. 공개 자료 수와 비공개 검수 대기를 포함한 DB 전체 자료 수는 구분한다.

PC에서 후속 작업을 push하기 전에는 NAS 발행기가 추가한 공개본 커밋을 먼저 가져온다. 로컬 변경을 보존하고 공개본을 오래된 파일로 덮어쓰지 않는다. 실제 공개 사이트는 [kenitoa-war-achive.vercel.app](https://kenitoa-war-achive.vercel.app)이며 배포 증거는 [release.json](https://kenitoa-war-achive.vercel.app/release.json)에서 확인한다.

검증용 수동 배포는 `node NAS/scripts/stage-vercel.mjs`를 사용해 공개 소스만 별도 staging에 복사한다. `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`는 검증한 프로젝트 식별자를 사용한다. `.env`·NAS·로컬 원본·DB는 staging에 포함하지 않는다. Vercel CLI의 기존 인증을 사용하고 비밀 토큰을 명령 인자로 전달하지 않는다.

## 미디어 제작·철회

관리자는 권리 근거를 기록해 16MiB 이하 원본을 비공개 업로드한다. 파일 확장자 대신 실제 MIME·크기·해시를 검증한다. 편집자는 기본 비공개 업로드, 검수자는 별도 권리 승인·취소를 수행한다. 공개 thumbnail은 자료 공개 상태·사람의 내용 검수·민감도·파일별 권리 승인·저장소 설정이 모두 충족되어야 한다.

텍스트·인용·출처 설명과 sharp thumbnail은 실제 제작한다. PDF 텍스트 추출, OCR, 영상 프레임/정보는 도구가 있을 때 실행하며 사용할 수 없으면 해당 단계가 unavailable로 남는다. 성공을 가장한 텍스트나 번역은 만들지 않는다. 실제 NAS 이미지 빌드와 Poppler·Tesseract(한국어/영어)·FFmpeg 설치 확인은 통과했다. 도구 설치와 각 실제 미디어의 변환 성공은 구분하며, 파일별 제작 상태와 해시를 확인한다.

선택적 S3 저장소는 전용 bucket/prefix와 최소 권한을 사용한다. 업로드 전에 제작물 inventory를 저장하고 PUT 후 HEAD로 확인한다. 철회·권리 취소·출처 정책 취소는 범위를 지정한 cleanup 큐로 이어진다. 보존 원본을 삭제하지 않고 해당 공개 파생 파일만 삭제한다. S3 삭제의 404는 멱등적 성공이며 임시 오류는 재시도한다.

Cloudflare를 사용하는 경우 정확한 zone purge URL과 제한 토큰을 설정한다. 지정 파일 URL만 purge하고 전체 캐시 purge를 하지 않는다. purge 접수와 실제 공개 URL의 404/410 확인은 별도 단계다. GitHub 이력·이전 Vercel 배포 URL·외부 사본은 이 파일 정리만으로 제거되지 않는다. 권리 철회가 있으면 대상 프로젝트의 이전 배포와 검색 색인을 별도로 조사하고 필요한 삭제를 수행한다.

## 백업과 복원

- 관리자의 JSON 백업은 메타데이터만 포함한다. 원본 바이너리·전체 DB·환경 설정의 복구 수단이 아니다.
- 로컬: API를 종료한 뒤 `NAS/back`에서 `npm run backup -- <새 백업 경로>`를 실행한다. DB dump·원본·해시 manifest를 만든다.
- NAS: `sh scripts/backup-nas.sh`로 PostgreSQL dump를 먼저 만들고 원본·릴리스를 복사한다. 파일 체크섬과 `pg_restore --list`를 기록한다. `.env`는 별도로 비공개 암호화 백업한다.
- `BACKUP_ENCRYPTION_KEY`는 별도로 보관한 base64 32바이트 키다. NAS/.env에 키를 둔 경우 NAS 폴더에서 `node --env-file=.env scripts/encrypt-backup.mjs encrypt <입력 파일> <새 출력 파일>`로 파일을 AES-256-GCM 암호화한다. 별도 process 환경 주입도 가능하다. 압축 등 묶기 작업은 별도 수행한다. 원본을 자동 삭제하지 않는다.
- 복호화는 `node --env-file=.env scripts/encrypt-backup.mjs decrypt <암호화 파일> <새 출력 파일>`이다. 인증 태그 확인 전에는 완성 출력 파일을 만들지 않는다. 키를 잃으면 복구할 수 없다.
- 로컬 호환 복원: `npm run restore -- <백업 디렉터리> <새 데이터 경로>`. 실제 PostgreSQL 복원은 새 빈 DB를 `RESTORE_DATABASE_URL`로 명시한다. 기존 경로/DB 덮어쓰기는 거부한다.
- 복원 후 원본 해시·자료 수·계정/세션 정책·출처 checkpoint·큐를 확인한다. 파생 파일은 보존 원본에서 재생성하고 공개 경로를 재검증한다. 운영 전환은 복원 검증 후 실시한다.

### NAS Compose 백업 복원

`backup-nas.sh`의 dump/tar 형식은 위 `npm run restore`의 manifest 형식과 다르다. 서로 교차 사용하지 않는다. 아래는 **아직 존재하지 않는 별도 Compose 프로젝트와 새 볼륨**에 복원하는 절차다. 현재 운영 프로젝트에 적용하지 않는다.

1. 새 NAS/복구 디렉터리에 코드와 별도 비공개 `.env`를 준비한다. `docker compose -p <새 프로젝트> ps -a`와 `docker volume ls --filter label=com.docker.compose.project=<새 프로젝트>`가 모두 비어 있음을 확인한다. 기존 대상이 있으면 중단하고 다른 이름을 사용한다.
2. 백업 디렉터리에서 `sha256sum -c SHA256SUMS`를 통과시킨다. `tar -tf`로 두 tar의 경로를 검사해 절대 경로·상위 경로·의도하지 않은 링크가 없는 자체 생성 백업인지 확인한다.
3. 새 프로젝트 이미지 빌드 후 `docker compose -p <새 프로젝트> up -d db`를 실행한다. PostgreSQL healthy 이후 아래 명령을 사용한다. 새 DB에는 별도 마이그레이션을 먼저 실행하지 않는다.

```sh
docker compose -p <새 프로젝트> exec -T db pg_restore -U archive -d archive --exit-on-error --no-owner < <백업>/database.dump
docker compose -p <새 프로젝트> run --rm --no-deps -T api tar -C /var/lib/war-archive -xf - < <백업>/archive-files.tar
docker compose -p <새 프로젝트> run --rm --no-deps -T api tar -C /var/lib/war-archive-releases -xf - < <백업>/releases.tar
docker compose -p <새 프로젝트> run --rm api node dist/commands/migrate.js
docker compose -p <새 프로젝트> exec -T db psql -U archive -d archive -v ON_ERROR_STOP=1 -c "BEGIN; DELETE FROM member_sessions; DELETE FROM member_reset_tokens; UPDATE jobs SET state='queued',owner=NULL,lease_until=NULL,run_at=now() WHERE state='running'; COMMIT;"
```

`<...>`는 실제 경로/이름으로 바꾼다. 마지막 명령은 **새 복원 DB에서만** 실행해 과거에 폐기한 세션·복구 토큰이 백업 복원으로 살아나지 않도록 무효화한다. 회원·서재·자료는 삭제하지 않는다. 관리자는 다시 로그인해야 한다. 관리자 포트를 운영과 다르게 설정하고 REMOTE_PUBLISH_ENABLED=false로 둔 상태에서 새 API만 시작한다. 원본 해시·DB·자료·권리 상태를 확인한 후 worker와 발행을 순서대로 활성화한다. 운영 볼륨이나 이전 백업을 삭제하지 않는다. 실제 Docker 복원 검증은 [격리 복원 도구](RESTORE_REHEARSAL.md)로 수행하며, 모든 과거 제작 파일과 발행본까지 검사한다. 개발용 PostgreSQL 백업 CLI를 별도 사용할 경우 호스트에 pg_dump/pg_restore도 필요하며 API 런타임 이미지에는 포함하지 않는다.

배포 전 자동 백업은 DB dump·자료 tar·발행 tar와 체크섬을 보존한다. 별도로 Windows 작업 스케줄러 `War Archive encrypted external backup`을 매일 02:20과 사용자 로그인 때 실행하도록 등록했다. NAS의 설정·전용 배포 키·소스·Docker 이미지까지 포함한 AES-256-GCM 백업을 `C:/Users/abc20/WarArchiveBackups`에 저장하고, 키는 별도 Windows DPAPI 저장소로 보호한다. 최근 검증된 사본이 있으면 로그인 시 중복 생성을 건너뛴다. PC가 켜져 있고 해당 사용자가 로그인되어 있으며 NAS에 접근할 수 있어야 한다. 자세한 절차와 한계는 [외부 백업](../deployment/EXTERNAL_BACKUP.md)을 따른다. 성공 여부는 PC 영수증의 `external-authenticated`, 격리 복원 `result.json`의 `passed`로 확인하며 문서나 스케줄 등록만으로 복원 성공을 대신하지 않는다.

최종 앱 스냅샷 `95293fc`·도구 `d1a91a1`의 실제 외부 PC 사본은 2026-10-18 16:33:49.507 UTC에 `external-authenticated`를 확인했다. 암호문 546,719,473바이트의 SHA-256 `8e166b07ecb448e65714e4368955200cae62320532af37fc8ea095d04d996d51`, NAS 암호화 왕복, PC의 GCM·평문 해시와 설치된 클라이언트 검사를 통과했다. 실제 PC 암호문을 NAS의 새 경로로 반환해 체크섬 11개, 비공개 설정·키·소스·bootstrap과 Docker 이미지 3개의 실제 재로딩도 확인했다. 등록된 Windows 작업은 16:36:09 UTC에 종료 코드 0을 반환했고, 최근 20시간 내 검증 사본이 있어 중복 생성은 건너뛰었다. 증거는 PC의 `latest.json`과 `NAS/artifacts/external-backup-proof-20261019.json`이다.

반환한 실제 PC 사본으로 이미지 `95293fc`의 새 격리 PostgreSQL/API 환경을 복원해 2026-10-18 16:42:22 UTC에 `passed`를 확인했다. 자료 270개·개정 637개·제작 이력 565개·마이그레이션 6개를 보존했고, 원본 455개·중복 제외 제작 파일 1,571개(전체 참조 1,695개)·발행본 9개의 해시를 모두 확인했다. API와 관리자 로그인·조회, 복원 후 세션·재설정 토큰 0개와 네트워크·볼륨 격리, 검사 후 소유 격리 자원의 잔존 0개도 확인했다. 백업에 실행 중 작업이 없어 재대기 처리로 바뀐 행은 0개였다. 결과는 `NAS/artifacts/final-external-restore-proof-20261019.json`에 기록했다. 이 검증은 전쟁 아카이브 애플리케이션 전체 복원이며, DSM·다른 프로젝트를 포함한 NAS 기기 전체 복원이나 지리적으로 분리된 보관을 완료한 것으로 표시하지 않는다.

## 모니터링·롤백

`/healthz`, worker heartbeat, 작업 queued/retry/failed, 출처별 마지막 성공·checkpoint, 발행 상태·실제 릴리스, 디스크·백업 나이를 점검한다. 구조화 로그는 토큰·쿠키·비밀번호·연락처 원문을 출력하지 않는다. Discord 등 외부 메시지는 자동 전송하지 않는다.

현재 Tailscale 장치 키 만료는 `2026-10-30T14:13:55Z`(한국 시각 2026-10-30 23:13:55)로 재확인했다. 사용자는 무인 인증 유지를 요청했으나 현재 Tailscale 관리자 콘솔에 로그인할 수 없어 해당 정책은 아직 변경하지 않았다. [공식 서버 운영 방법](https://tailscale.com/docs/features/access-control/key-expiry)은 신뢰하는 서버 장치에 한해 키 만료를 해제하는 것이다. 이는 주기적으로 인증키를 갱신하는 것과 다르다. 장치 한 대의 정책을 변경한 뒤 실제 NAS의 KeyExpiry와 공개 API를 재검증해야 완료다. 강제 재인증은 원격 연결을 끊을 수 있어 예약 실행하지 않는다. 장치 키 만료는 Tailscale을 경유하는 관리자 접속·공개 회원·서재 API의 연결에 영향을 준다. NAS 자체와 인터넷이 정상이면 수집·Git 업로드는 계속 실행될 수 있다. NAS가 중단되면 수집·정제·제작·발행·회원 동기화도 중단된다. 이미 배포된 정적 자료는 Vercel에서 계속 열람할 수 있다.

현재 API는 proxy 헤더를 신뢰하지 않아 공개 gateway를 거친 요청이 같은 gateway IP의 속도 제한을 공유한다. 회원가입·자료 접수는 각각 해당 IP당 시간당 100회 제한이므로 공개 웹에서는 사이트 전체가 각 한도를 공유한다. 실패한 입력도 요청 횟수에 포함되며 현재 카운터는 API 재시작 시 초기화된다. 로그인·비밀번호 재설정·전체 요청 제한은 별도로 유지한다. 실제 클라이언트 식별이 필요하면 신뢰할 수 있는 프록시 경계를 먼저 설계하고 검증한다.

코드 롤백은 이전 이미지/커밋과 마지막 정상 공개 릴리스를 사용한다. DB 추가형 마이그레이션은 삭제하지 않는다. 스키마 되돌리기가 필요하면 별도 새 DB 복원본에서 이전 코드 호환성을 확인한 뒤 전환한다. 수집 중단은 출처 disabled, 발행 중단은 REMOTE_PUBLISH_ENABLED=false로 처리하고 원본·큐를 보존한다.
