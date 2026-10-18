# 운영·배포·복구

## 책임과 데이터 흐름

NAS가 원본·DB·계정·검수·큐를 소유한다. 공개 웹은 공개 스키마를 통과한 snapshot만 읽는다. Vercel의 로컬 파일 시스템에 운영 DB를 두지 않는다.

`출처 API → 원본 해시/원문 보존 → 수집 checkpoint → 정규화/버전 → 검수 → 자료 제작 → 공개 snapshot/manifest → GitHub → Vercel → 실제 release.json 확인`

초기 수집과 증분 수집은 페이지 크기·위치를 저장한다. 별도의 일일 순환 재확인이 알려진 식별자의 출처 변경·삭제를 확인한다. 출처 삭제는 원본을 지우지 않고 검토 상태와 경고로 기록한다. 사람이 검수한 설명은 새 원문으로 자동 덮어쓰지 않고 변경 후보로 남긴다.

## 첫 NAS 배포

1. `NAS/.env`, 기존 DB·원본을 비공개 백업한다. 비밀값을 Git에 추가하지 않는다.
2. NAS에 `NAS/`만 복사하고 `node scripts/configure-nas.mjs --production`으로 비어 있는 초기 설정을 생성한다. Docker Engine/Compose와 Node.js 22 이상이 필요하다.
3. `docker compose config --quiet`와 `docker compose build`를 실행한다. 실제 `.env`가 포함된 `docker compose config` 전체 출력은 공유하지 않는다.
4. `docker compose up -d db`로 DB를 준비하고 건강 상태를 확인한다.
5. **API/worker를 올리기 전** `docker compose run --rm api node dist/commands/migrate.js`를 한 번 실행한다. 마이그레이션은 번호순 추가형이며 같은 DB에 여러 마이그레이션 프로세스를 동시에 실행하지 않는다.
6. `docker compose up -d api worker` 후 `/healthz`, 관리자 로그인, worker heartbeat, 큐, 로그를 확인한다.
7. 출처의 범위·주기·공개 정책을 검토하고 작은 배치로 실제 수집·검수·발행을 확인한다.

Compose는 PostgreSQL 볼륨, 원본/제작물 볼륨, 공개 릴리스 볼륨을 분리한다. API/worker는 비루트 사용자이며 관리자 포트는 NAS loopback에만 연다. `docker compose down -v`, DB 초기화, 볼륨 삭제는 운영 절차에 포함하지 않는다.

컨테이너 내부 포트는 4310이며 외부 포트는 NAS/.env의 ADMIN_PORT다. 외부 포트가 다르면 실제 브라우저에서 사용하는 정확한 origin을 ALLOWED_ORIGINS에 명시한다. 예를 들어 로컬 SSH 터널의 9231 포트라면 http://127.0.0.1:9231 및 사용하는 경우 http://localhost:9231을 추가한다. 역방향 프록시는 해당 HTTPS origin을 추가하고 NAS/.env를 바꾼 뒤 컨테이너를 다시 생성한다.

현재 실행 환경에는 Docker/실제 NAS 접속이 없어 이 절차의 원격 실행은 미검증이다. 로컬 파일 PGlite 검증과 실제 PostgreSQL 운영 검증을 구분한다.

### 현재 Windows 자료를 새 NAS PostgreSQL로 이전

폴더 복사만으로 Windows PGlite의 행이 PostgreSQL에 들어가지는 않는다. 현재 자료는 `NAS/data/transfer/initial-20261018/`에 portable 논리 bundle로 내보냈다. 4개 출처·120개 자료·192개 개정·120개 보존 원본을 포함하며 새 PGlite 경로로 실제 가져오기와 해시 보존을 확인했다. 이 bundle은 공개 Git에서 제외되므로 **현재 NAS 폴더를 복사할 때 함께 전달**한다. 회원/연락처 등이 포함될 수 있는 비공개 bundle이며 별도로 보호한다.

새 NAS의 DB를 생성·마이그레이션한 뒤, API와 worker를 시작하기 전에 실행한다. 대상 DB는 마이그레이션만 적용한 빈 DB이고 `/var/lib/war-archive` 볼륨은 비어 있어야 한다. bundle에는 컨테이너 UID 1000의 읽기 권한만 필요한 범위로 부여하고 전체 공개 권한을 주지 않는다.

```sh
docker compose run --rm --no-deps -T --volume "$PWD/data/transfer/initial-20261018:/import:ro" api node dist/commands/import-portable.js /import /var/lib/war-archive
```

가져오기는 테이블/열 허용 목록과 migration 파일 해시, 원본 해시, 경로, 행 수를 검사한다. 원본 경로를 NAS로 바꾸고 ID·출처 checkpoint·개정·철회를 보존한다. 로그인 세션과 비밀번호 재설정 토큰은 이전하지 않는다. 실행 중 lease는 다시 대기 상태로 만들고 파생 파일을 재제작한다. 기존 운영 DB/파일은 덮어쓰지 않는다. 실제 PostgreSQL로의 실행은 NAS에서 확인해야 한다.

새 bundle 생성은 API/worker를 종료한 뒤 `NAS/back`에서 `node dist/commands/export-portable.js <존재하지 않는 새 bundle 경로>`로 수행한다. 로컬 시험 가져오기는 `node dist/commands/import-portable.js <bundle 경로> <새 데이터 경로>`다. 서로 다른 저장 엔진을 이전하는 portable 형식, PGlite 물리 백업, NAS dump/tar 백업은 구분한다.

## 자동 발행 연결

확정 대상은 `kenitoa/War-Achive`, `main`, `Vercel/content/archive.json`이다. 이전 `kenitoa/warsachive`와 기존 Vercel `kenitoa-warsachive`는 이 프로젝트의 대상이 아니다.

1. NAS에서 `GITHUB_FRONT_TOKEN`을 해당 저장소 콘텐츠 쓰기 최소 권한으로 갱신한다. 기존 값은 API 401로 실패했으며 자동으로 대체하지 않았다.
2. Vercel 프로젝트의 Git 연결이 위 저장소를 가리키고 Production Branch가 `main`, Root Directory가 `Vercel`인지 확인한다.
3. 실제 배포의 `https://<도메인>/release.json`을 `PUBLIC_ARCHIVE_VERIFY_URL`로 설정한다.
4. `REMOTE_PUBLISH_ENABLED=true`로 바꾸고 API/worker를 재시작한다. 작은 공개 변경으로 GitHub 커밋과 실제 사이트 릴리스 ID·SHA-256을 확인한다.
5. GitHub 업로드 성공과 실제 배포 확인을 구분한다. 배포 대기 상태는 주기적으로 재확인하고 실패 작업은 관리자에서 원인 확인 후 재시도한다.

GitHub 파일 갱신은 현재 파일 SHA를 사용하며 충돌을 덮어쓰지 않는다. 재시도는 동일 릴리스의 고정 snapshot을 사용한다. 철회와 발행은 DB guard로 순서를 맞춰 이전 공개본의 재전송을 방지한다. 배포가 실패하면 마지막 정상 공개본이 유지되며 새 릴리스 완료로 표시하지 않는다.

검증용 수동 배포는 `node NAS/scripts/stage-vercel.mjs`를 사용해 공개 소스만 별도 staging에 복사한다. `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`는 검증한 프로젝트 식별자를 사용한다. `.env`·NAS·로컬 원본·DB는 staging에 포함하지 않는다. Vercel CLI의 기존 인증을 사용하고 비밀 토큰을 명령 인자로 전달하지 않는다.

## 미디어 제작·철회

관리자는 권리 근거를 기록해 16MiB 이하 원본을 비공개 업로드한다. 파일 확장자 대신 실제 MIME·크기·해시를 검증한다. 편집자는 기본 비공개 업로드, 검수자는 별도 권리 승인·취소를 수행한다. 공개 thumbnail은 자료 공개 상태·사람의 내용 검수·민감도·파일별 권리 승인·저장소 설정이 모두 충족되어야 한다.

텍스트·인용·출처 설명과 sharp thumbnail은 실제 제작한다. PDF 텍스트 추출, OCR, 영상 프레임/정보는 도구가 있을 때 실행하며 사용할 수 없으면 해당 단계가 unavailable로 남는다. 성공을 가장한 텍스트나 번역은 만들지 않는다. Docker 이미지에는 Poppler·Tesseract(한국어/영어)·FFmpeg가 포함되지만 실제 NAS 이미지 빌드는 별도 검증해야 한다.

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
```

`<...>`는 실제 경로/이름으로 바꾼다. 관리자 포트를 운영과 다르게 설정하고 REMOTE_PUBLISH_ENABLED=false로 둔 상태에서 새 API만 시작한다. 원본 해시·DB·자료·권리 상태를 확인한 후 worker와 발행을 순서대로 활성화한다. 운영 볼륨이나 이전 백업을 삭제하지 않는다. 이 NAS 복원 절차는 실제 Docker에서 아직 실행하지 않았다. 개발용 PostgreSQL 백업 CLI를 별도 사용할 경우 호스트에 pg_dump/pg_restore도 필요하며 API 런타임 이미지에는 포함하지 않는다.

주기적 백업은 NAS 작업 스케줄러에서 위 스크립트를 호출하도록 설정한다. 이 작업에서 실제 NAS의 스케줄러를 등록한 것은 아니다. 별도 저장소 복사와 정기 복원 연습을 확인한 후 백업을 보호 완료로 기록한다.

## 모니터링·롤백

`/healthz`, worker heartbeat, 작업 queued/retry/failed, 출처별 마지막 성공·checkpoint, 발행 상태·실제 릴리스, 디스크·백업 나이를 점검한다. 구조화 로그는 토큰·쿠키·비밀번호·연락처 원문을 출력하지 않는다. Discord 등 외부 메시지는 자동 전송하지 않는다.

코드 롤백은 이전 이미지/커밋과 마지막 정상 공개 릴리스를 사용한다. DB 추가형 마이그레이션은 삭제하지 않는다. 스키마 되돌리기가 필요하면 별도 새 DB 복원본에서 이전 코드 호환성을 확인한 뒤 전환한다. 수집 중단은 출처 disabled, 발행 중단은 REMOTE_PUBLISH_ENABLED=false로 처리하고 원본·큐를 보존한다.
