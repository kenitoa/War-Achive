# NAS · VS Code · Vercel 자동 연결

운영 경로는 `/volume3/docker/War_Archive_Server`이고 대상 저장소는 `kenitoa/War-Achive`, 운영 브랜치는 `main`이다. VS Code에서 저장한 코드는 검사·커밋·push 후 전달된다. NAS는 5분 간격으로 변경을 확인하며 Vercel은 Git 연결로 배포한다.

```text
VS Code → GitHub main ┬─ NAS 코드 변경 → DSM 업데이트 작업 → Docker API / worker
                     └─ Vercel 변경 → Vercel Git 배포 → 공개 웹
NAS worker → 자료 수집·정제·검수·자료 제작 → GitHub 공개 snapshot → Vercel → release.json 검증
```

## 최초 설치

Docker 24 및 Compose 2.20 이상이 필요하다. NAS 호스트의 Node/Git 설치는 필요 없다. 운영 폴더의 소유자인 `NAS ???? ???`(UID 1026, GID 100)으로 실행한다. 이 사용자의 기존 sudo 권한인 `sudo -n /usr/local/bin/docker`만 사용하며 일반 sudo 셸 권한이나 계정 비밀번호는 요구하지 않는다. root로 직접 실행하는 경우도 지원한다. 기존 다른 컨테이너·볼륨은 변경하지 않는다. 프로젝트 이름 `war-archive`와 전용 볼륨 `war-archive-postgres`, `war-archive-data`, `war-archive-releases`가 기존 서비스에서 사용되고 있지 않은지 설치 전에 확인한다.

1. `NAS/deployment/`를 NAS 운영 경로의 `deployment/`에 복사한다. `.env`는 운영 경로의 `shared/.env`에 별도로 복사하고 관리자만 읽도록 `chmod 600`을 적용한다. 원본 `.env`와 토큰을 Git이나 Docker 이미지에 포함하지 않는다.
2. 첫 수집 자료를 이전한다면 portable bundle의 **내용**을 `shared/import/`에 복사한다. bundle 파일은 비공개 자료이므로 외부 공개 폴더에 두지 않는다. 이 전용 폴더만 마운트한 일회성 Docker 준비 작업으로 UID/GID 1000:1000 소유권을 적용하고 디렉터리 700·파일 600 권한을 유지한다. 기존 DB/파일이 있으면 가져오기가 거부되며 자동 초기화하지 않는다.
3. GitHub 쓰기 전용 배포 키와 검증한 GitHub SSH 호스트 키를 `shared/secrets/github_deploy_key`, `shared/secrets/github_known_hosts`에 준비한다. API/worker의 비루트 UID 1000이 읽도록 비밀 디렉터리·키는 UID 1000 소유, 디렉터리 700·개인 키 600으로 제한한다. Docker의 읽기 전용 bind를 통해서만 API/worker에 전달되며 gateway에는 전달하지 않는다. 키 파일이 없으면 배포를 거부하고 빈 디렉터리로 대체하지 않는다. 키와 전용 `.env` 설정은 별도 비공개 절차로 관리한다.
4. 저장소에 배포할 코드가 push된 뒤 NAS 프로젝트 소유자 계정으로 실행한다.

```sh
sh /volume3/docker/War_Archive_Server/deployment/update.sh /volume3/docker/War_Archive_Server
```

스크립트는 누락된 강한 관리자 토큰·DB 비밀번호만 생성하고 기존 값을 보존한다. DB URL은 전용 `db/archive` 및 동일한 DB 비밀번호를 사용해야 한다. 비밀값을 출력하지 않는다. 초기에는 `REMOTE_PUBLISH_ENABLED=false`이고 GitHub 전용 최소 권한 토큰·공개 URL 확인을 마친 뒤 활성화한다. 공개 API/관리자 접근은 NAS의 HTTPS 역방향 프록시에서 `127.0.0.1:9231`로 연결하고, 사용 URL을 `shared/.env`의 `ALLOWED_ORIGINS`에 명시한다.

## DSM 자동 업데이트 작업

제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트에서 사용자 `NAS ???? ???`, 5분마다 실행으로 등록한다. 시작 후 부팅 완료 시 같은 명령을 실행하는 부팅 작업도 등록할 수 있다. 스크립트 본문은 위 한 줄이다. 결과를 비공개 운영 로그 폴더에 보관하고 실패 알림 정책을 DSM에서 설정한다. 이 문서 자체는 스케줄러 등록의 증거가 아니므로 실제 등록·최근 실행 결과를 별도 확인한다. 일회성 Node 보조 컨테이너도 실행한 NAS 사용자의 UID/GID를 사용하므로 release/state 파일의 소유권이 root로 바뀌지 않는다.

GitHub REST API로 `main`에서 **NAS 경로를 마지막으로 변경한 커밋**을 가져온다. 공개 snapshot만 바뀐 커밋은 백엔드를 다시 빌드하지 않는다. 일반 공개 저장소 조회는 토큰이 필요 없으며 5분 주기 기준 API 요청은 시간당 약 12회이다. GitHub 접근 제한 시 `shared/github-read-token`에 해당 저장소 읽기 권한만 가진 토큰을 저장할 수 있다. 조회 자격 증명은 로그·명령 인자에 넣지 않는다.

## 배포 순서와 보존

- 커밋 SHA를 고정하고 HTTPS GitHub 원본만 수신한다. 압축 크기·경로·링크·특수 파일을 검사하며 `.env`, 운영 DB, 원본, 빌드 산출물은 코드 릴리스에서 제외한다.
- 새 소스는 `releases/<commit>/`에 저장하고 해당 커밋 이름의 이미지를 빌드한다. 이미지 빌드에서 lint·타입 검사·테스트·빌드를 먼저 통과한다.
- 빌드가 끝나면 API/worker를 잠시 정지하고 DB dump·원본/릴리스 tar·체크섬을 `backups/`에 남긴다. 이후 추가형 마이그레이션을 적용한다. 최초 portable 가져오기는 빈 대상에 한 번만 수행한다.
- API `/healthz`, worker heartbeat, 공개 gateway `/healthz` 검사를 모두 통과한 후 `state/current.json`에 성공 커밋과 이전 커밋을 기록한다. gateway는 별도 이미지로 함께 빌드하며 `127.0.0.1:9232`에서 `/war-archive-api` 경로만 전달한다. gateway에는 원본 볼륨·개인 키·DB 환경을 전달하지 않는다. 이전 소스·이미지·백업과 영구 볼륨은 자동 삭제하지 않는다.
- 실패하면 이전 애플리케이션 이미지로 복귀한다. 마이그레이션은 자동으로 되돌리지 않는다. 새 스키마가 이전 코드와 호환되어야 하며, 파괴적 마이그레이션은 이 자동 업데이트 절차에서 허용하지 않는다. 최초 설치 실패 시 API/worker를 멈추고 DB·자료·백업을 보존한다.
- 실행 잠금으로 중복 배포를 막는다. NAS 재부팅 이전의 잠금은 식별해 제거한다. 같은 부팅에서 비정상 종료한 작업의 잠금은 해당 프로세스/컨테이너 작업이 끝났는지 관리자가 확인한 다음 두 marker 파일과 빈 lock 디렉터리만 제거한다.

환경 설정만 변경했다면 수동으로 `WAR_ARCHIVE_FORCE_RECREATE=true sh .../deployment/update.sh ...`를 실행한다. 특정 커밋을 검증하려면 스크립트의 두 번째 인자로 정확한 40자리 SHA를 전달할 수 있다. 운영 상태 전환이나 데이터 복원은 관리자가 검증 후 수행한다. `docker compose down -v`, 전체 볼륨 삭제, DB 초기화는 사용하지 않는다.

## 배포 검증과 수동 복귀

`state/current.json`의 커밋과 `docker compose --project-name war-archive --env-file shared/.env -f releases/<commit>/compose.deploy.json ps`의 건강 상태를 확인한다. Vercel의 배포 커밋·`release.json` 해시는 별도로 확인한다. NAS 관리자 로그인·실제 수집 작업·GitHub 업로드·Vercel 반영까지 성공해야 전체 연결 검증이 끝난 것이다.

이전 앱으로 수동 복귀하려면 같은 스크립트에 이전 SHA를 지정한다. 이미 적용된 마이그레이션과 자료는 유지하며, 스키마 하향 변경이 필요하면 별도 빈 복원 환경에서 백업을 검증한 뒤 전환한다. 백업 자동 보존은 외부 복사·암호화·복원 훈련을 대신하지 않는다.

로컬 검사: `node --test NAS/deployment/test/*.test.mjs`, `sh -n NAS/deployment/update.sh`. 비밀 제외 NAS 소스 전달 묶음은 `node NAS/scripts/package-nas.mjs`로 생성한다. portable bundle과 환경 파일은 별도 비공개 채널로 전달한다.
