# 운영·배포·복구

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

수동 Compose의 컨테이너 내부 포트는 4310이며 관리자 외부 포트는 NAS/.env의 ADMIN_PORT다. 관리자 접속에는 별도로 승인된 사설 접속 경로와 정확한 ALLOWED_ORIGINS 설정이 필요하다. 현재 NAS의 SSH TCP forwarding은 서버 정책으로 거부되므로 SSH 터널로 관리자 브라우저에 접속했다고 간주하지 않는다. NAS 내부 관리자 페이지 HTTP 200과 인증·권한 검사는 통과했지만 원격 관리자 브라우저 접속은 미검증이다. 공개 gateway에는 관리자 페이지나 관리자 API를 전달하지 않는다.

### 실제 NAS 운영 확인 — 2026-10-18

- DSM의 `War Archive auto deploy` 작업은 일반 NAS 사용자로 5분마다 실행한다. `main`의 NAS 소스가 바뀌면 빌드·검증·백업·마이그레이션·건강 확인 후 활성화한다. 실행 잠금은 중복 배포를 막고, 활성화된 소스로 bootstrap을 교체한다.
- 커밋 `892c6dc41d2dc45690f50c224d301d9f95c712b8`의 자동 재배포를 확인했다. `war-archive` 프로젝트의 PostgreSQL·API·worker·publicgateway 네 컨테이너가 모두 healthy이며 기존 다른 NAS 서비스는 유지했다.
- 2026-10-18 13:24:43 UTC의 실제 PostgreSQL 읽기 전용 검사에서 마이그레이션 6개, 자료 270개, 개정 637개를 확인했다. 보존 원본 455개 전부와 인용·출처 설명·메타데이터 제작 파일 810개 전부의 SHA-256이 일치했다. 메타데이터 제작 완료 자료는 270개다. 이는 자동 재배포 이후 영속 볼륨의 데이터와 파일을 검사한 결과다.
- NAS에서 실제 Commons 수집을 실행해 이전 자료 230개에 새 자료 40개가 추가됐다. 현재 승인된 Commons 출처의 수집 간격은 6시간, 발행 배치 간격은 2시간, worker의 스케줄 확인 간격은 1분이다. 출처의 승인·활성 상태와 checkpoint에 따라 실행하며 검수 대기 자료는 자동 공개하지 않는다.
- PC의 PGlite worker는 종료했고 로컬 `LOCAL_WORKER_ENABLED=false`로 두었다. 운영 수집·정제·제작·발행의 실행 주체는 NAS worker다. VS Code 수정 → `main` push 후 NAS는 DSM 작업으로 백엔드 변경을 감지해 업데이트하고, Vercel은 Git 연결로 공개 웹을 배포한다.
- NAS 내부 API 검사 14건에서 비로그인 관리자·서재 접근 차단, 공개 gateway의 관리자 차단, 허용하지 않은 Origin 차단, 관리자 로그인·현황 조회·CSRF·로그아웃 후 세션 차단과 미디어 도구 설치를 확인했다. 관리자 원격 브라우저 접속 성공을 뜻하지는 않는다.

공개 `/war-archive-api` HTTPS 경로 추가는 사용자 승인을 받았지만 DSM 관리자 재인증을 기다리고 있다. 아직 외부 gateway 연결이나 Vercel 회원 동기화가 완료된 상태로 기록하지 않는다. 재인증 후 검증된 일회성 연결 작업으로 기존 HTTPS 설정을 보존하며 해당 경로만 추가하고, 공개 health·관리자 경로 차단·Origin 차단을 확인한다. 이후 Vercel의 정확한 계정·제보 경로 프록시와 공개 API origin을 설정하고 실제 회원가입·로그인·서재 저장·로그아웃을 검사한다.

### 현재 Windows 자료를 새 NAS PostgreSQL로 이전

폴더 복사만으로 Windows PGlite의 행이 PostgreSQL에 들어가지는 않는다. `NAS/data/transfer/nas-handoff-20261018/`의 portable 논리 bundle은 4개 출처·230개 자료·597개 개정·415개 보존 원본을 포함하며, 실제 새 NAS PostgreSQL 가져오기를 완료했다. 이후 NAS 수집으로 증가한 수량은 위 운영 확인 기록을 따른다. 이 bundle은 공개 Git에서 제외하며 회원/연락처 등이 포함될 수 있으므로 비공개로 보호한다. 이미 운영 중인 NAS에 다시 가져오지 않는다.

다음 명령은 향후 별도의 새 NAS를 준비할 때만 사용한다. 새 DB를 생성·마이그레이션한 뒤, API와 worker를 시작하기 전에 실행한다. 대상 DB는 마이그레이션만 적용한 빈 DB이고 `/var/lib/war-archive` 볼륨은 비어 있어야 한다. bundle에는 컨테이너 UID 1000의 읽기 권한만 필요한 범위로 부여하고 전체 공개 권한을 주지 않는다.

```sh
docker compose run --rm --no-deps -T --volume "$PWD/data/transfer/nas-handoff-20261018:/import:ro" api node dist/commands/import-portable.js /import /var/lib/war-archive
```

가져오기는 테이블/열 허용 목록과 migration 파일 해시, 원본 해시, 경로, 행 수를 검사한다. 원본 경로를 NAS로 바꾸고 ID·출처 checkpoint·개정·철회를 보존한다. 로그인 세션과 비밀번호 재설정 토큰은 이전하지 않는다. 실행 중 lease는 다시 대기 상태로 만들고 파생 파일을 재제작한다. 기존 운영 DB/파일은 덮어쓰지 않는다. 이번 NAS 이전과 재제작 후 파일 해시 검사를 통과했다.

새 bundle 생성은 API/worker를 종료한 뒤 `NAS/back`에서 `node dist/commands/export-portable.js <존재하지 않는 새 bundle 경로>`로 수행한다. 로컬 시험 가져오기는 `node dist/commands/import-portable.js <bundle 경로> <새 데이터 경로>`다. 서로 다른 저장 엔진을 이전하는 portable 형식, PGlite 물리 백업, NAS dump/tar 백업은 구분한다.

## 자동 발행 연결

확정 대상은 `kenitoa/War-Achive`, `main`, `Vercel/content/archive.json`이다. 이전 `kenitoa/warsachive`와 기존 Vercel `kenitoa-warsachive`는 이 프로젝트의 대상이 아니다.

1. 전용 NAS 배포에서는 저장소 쓰기 권한의 SSH 배포 키와 검증한 GitHub 호스트 키를 준비한다. `shared/.env`의 `GITHUB_FRONT_SSH_KEY_PATH`, `GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH`가 읽기 전용 secret 마운트를 가리키도록 한다. 이 방식에는 `GITHUB_FRONT_TOKEN`이 필요 없다. 키 준비와 권한은 [전용 배포 문서](../deployment/README.md)를 따른다.
2. Vercel 프로젝트의 Git 연결이 위 저장소를 가리키고 Production Branch가 `main`, Root Directory가 `Vercel`인지 확인한다.
3. 실제 배포의 `https://<도메인>/release.json`을 `PUBLIC_ARCHIVE_VERIFY_URL`로 설정한다.
4. `REMOTE_PUBLISH_ENABLED=true`로 바꾸고 API/worker를 재시작한다. 작은 공개 변경으로 GitHub 커밋과 실제 사이트 릴리스 ID·SHA-256을 확인한다.
5. GitHub 업로드 성공과 실제 배포 확인을 구분한다. 배포 대기 상태는 주기적으로 재확인하고 실패 작업은 관리자에서 원인 확인 후 재시도한다.

GitHub 파일 갱신은 현재 파일 SHA를 사용하며 충돌을 덮어쓰지 않는다. 재시도는 동일 릴리스의 고정 snapshot을 사용한다. 철회와 발행은 DB guard로 순서를 맞춰 이전 공개본의 재전송을 방지한다. 배포가 실패하면 마지막 정상 공개본이 유지되며 새 릴리스 완료로 표시하지 않는다.

실제 NAS의 첫 SSH 발행은 커밋 `b273218a5c4666ee46aa191959d9062f1134c140`, 릴리스 `rel-16b86f0b-5a1c-475e-9e6c-a677099aa93a`의 공개 자료 54개를 전송했다. GitHub를 통한 Vercel Production 배포와 공개 `release.json`의 ID·해시 일치를 확인해 published로 완료했다. 이어 NAS worker가 실제 발행 작업 `job-b541ee82-3cb4-4a6e-aa83-7f1a1b8967c7`을 한 번에 완료했다. 최신 확인 릴리스는 `rel-fa0d3710-8961-47d5-ad08-85640b3b9df4`, 공개 자료 93개, 커밋 `d2731a02dc9bcd6578bee581cf0c28d81368dc30`이며 2026-10-18 13:26:38 UTC에 실제 사이트 검증까지 통과했다. SHA-256은 `ba663129cce66540ddb51d18937d3c2d7fa8d7fa0af3d5d078c2f8fdd3fd4a90`이다. 공개 자료 수와 비공개 검수 대기를 포함한 DB 전체 자료 수는 구분한다.

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

`<...>`는 실제 경로/이름으로 바꾼다. 마지막 명령은 **새 복원 DB에서만** 실행해 과거에 폐기한 세션·복구 토큰이 백업 복원으로 살아나지 않도록 무효화한다. 회원·서재·자료는 삭제하지 않는다. 관리자는 다시 로그인해야 한다. 관리자 포트를 운영과 다르게 설정하고 REMOTE_PUBLISH_ENABLED=false로 둔 상태에서 새 API만 시작한다. 원본 해시·DB·자료·권리 상태를 확인한 후 worker와 발행을 순서대로 활성화한다. 운영 볼륨이나 이전 백업을 삭제하지 않는다. 이 NAS 복원 절차는 실제 Docker에서 아직 실행하지 않았다. 개발용 PostgreSQL 백업 CLI를 별도 사용할 경우 호스트에 pg_dump/pg_restore도 필요하며 API 런타임 이미지에는 포함하지 않는다.

실제 자동 재배포가 생성한 `backups/20261018T132136Z-892c6dc41d2dc45690f50c224d301d9f95c712b8`에서 `database.dump`, `archive-files.tar`, `releases.tar` 세 파일의 `sha256sum -c SHA256SUMS`가 모두 통과했고 `pg_restore --list`도 확인했다. 배포 전 백업은 실제 구성했지만 별도의 정기 백업 작업, 암호화한 외부 저장소 복사, 실제 NAS의 전체 복원 연습은 완료로 기록하지 않는다. 코드 변경이 없는 기간에도 백업이 생성되도록 별도 주기적 백업을 구성하고 새 환경의 복원 검증을 수행해야 한다.

## 모니터링·롤백

`/healthz`, worker heartbeat, 작업 queued/retry/failed, 출처별 마지막 성공·checkpoint, 발행 상태·실제 릴리스, 디스크·백업 나이를 점검한다. 구조화 로그는 토큰·쿠키·비밀번호·연락처 원문을 출력하지 않는다. Discord 등 외부 메시지는 자동 전송하지 않는다.

현재 Tailscale 장치 키 만료는 `2026-10-30T14:13:55Z`(한국 시각 2026-10-30 23:13:55)로 확인했다. 기한 전에 장치 재인증·갱신을 수행하고 HTTPS 연결과 회원 API를 다시 확인한다. 키 만료나 NAS 중단 시 이미 배포된 정적 자료는 Vercel에서 계속 열람할 수 있지만 NAS에 의존하는 수집·발행·회원 동기화는 영향을 받는다. 키 만료 정책을 임의로 해제하지 않는다.

코드 롤백은 이전 이미지/커밋과 마지막 정상 공개 릴리스를 사용한다. DB 추가형 마이그레이션은 삭제하지 않는다. 스키마 되돌리기가 필요하면 별도 새 DB 복원본에서 이전 코드 호환성을 확인한 뒤 전환한다. 수집 중단은 출처 disabled, 발행 중단은 REMOTE_PUBLISH_ENABLED=false로 처리하고 원본·큐를 보존한다.
