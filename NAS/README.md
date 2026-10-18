# 전쟁 아카이브 · NAS

이 폴더를 NAS로 복사해 API·관리자·수집 worker·PostgreSQL을 운영한다. 공개 웹은 별도 `Vercel/` 폴더다. 실제 비밀값은 `NAS/.env`만 읽고 Git·컨테이너 이미지·공개 배포에서 제외한다. 기존 `back/.env`는 보존한 참고 파일이며 자동으로 합치지 않는다.

핵심 운영 원칙은 **지속 수집 → 지속 정제·자료 제작 → 지속 자동 발행**이다. 수집 checkpoint와 작업 큐를 DB에 저장하고 중복 실행·재시도·작업 임대 만료를 처리한다. 출처 정책을 통과한 낮은 위험의 메타데이터만 자동 공개하며, 민감 자료·권리 불명·내용 변경 후보는 관리자 검수로 보낸다. 자료의 진위를 점수 하나로 승인하지 않는다.

```text
NAS/
  back/       API·도메인·수집·제작·발행·마이그레이션·테스트
  admin/      관리자 웹
  docs/       기획·설정·API·운영·보안·검증 기록
  scripts/    실행·검증·배포 준비·백업 도구
  .env        비공개 실제 설정
  compose.yml PostgreSQL·API·worker
  data/       로컬 DB·원본·제작물 (Git 제외)
  releases/   공개 snapshot·manifest (Git 제외)
```

## Windows 로컬 실행

Node.js 22 이상과 npm을 사용한다. 각 앱의 `package-lock.json`을 유지한다.

```powershell
cd NAS/back
npm.cmd ci
cd ../admin
npm.cmd ci
npm.cmd run build
cd ../..
powershell -ExecutionPolicy Bypass -File NAS/scripts/start-local.ps1
```

`NAS/.env`의 `ADMIN_PORT`에서 `/admin/`을 연다. 현재 로컬 설정은 9231이다. 관리자 토큰은 파일에서 직접 확인하며 로그로 출력하지 않는다. 로컬 PGlite는 API와 worker를 한 프로세스에서 실행한다. 같은 DB 디렉터리에 별도 worker를 동시에 연결하지 않는다. `LOCAL_WORKER_ENABLED=false`는 읽기 검증 등 명시적인 점검에만 사용한다.

## NAS 운영 실행

새 NAS에서 기존 설정과 데이터를 먼저 백업한 뒤 이 폴더를 복사한다. Docker Engine/Compose가 필요하다.

```sh
cd /your/private/path/NAS
node scripts/configure-nas.mjs --production
chmod 600 .env
docker compose config --quiet
docker compose build
docker compose up -d db
docker compose run --rm api node dist/commands/migrate.js
docker compose up -d api worker
docker compose ps
docker compose logs --tail=100 api worker
```

설정 도구는 비어 있는 필수 비밀값만 생성한다. 기존 PostgreSQL 볼륨의 비밀번호를 임의로 바꾸지 않는다. API는 시작 시 추가형 마이그레이션을 적용한다. worker는 API 헬스 체크 이후 시작한다. DB는 외부 포트를 열지 않고 관리자 포트는 NAS loopback에만 바인딩한다. VPN 또는 SSH 터널과 HTTPS를 사용한다. 공개 회원 API가 필요할 때의 경로 허용 목록은 [API 계약](docs/api.md)을 따른다.

현재 Windows 자료를 NAS PostgreSQL에 유지하려면 API/worker를 시작하기 전에 `data/transfer/initial-20261018/` bundle을 [이전 절차](docs/operations.md)에 따라 가져온다. 실제 120개 자료·120개 원본을 내보내 새 로컬 DB에 가져오는 검증을 마쳤다. 폴더 복사만으로 저장 엔진이 자동 변환되지는 않는다. bundle은 Git 제외이므로 현재 폴더 복사 시 함께 보존한다.

## 자동 운영과 발행

1. 관리자에서 출처·범위·주기·정책을 확인하고 활성화한다.
2. worker가 초기/증분 페이지와 알려진 자료의 정기 재확인을 이어서 수행한다. 원본 응답을 해시와 함께 보존한다.
3. 정규화·버전·민감/권리 검토를 기록하고 인용문·출처 설명·텍스트·썸네일 등 제작 작업을 큐에 넣는다. PDF/OCR/영상 도구의 실제 사용 가능 여부도 결과에 기록한다.
4. 검수·공개 정책을 통과한 자료만 공개 스키마로 내보낸다. 원본·운영 메모·계정·연락처는 포함하지 않는다.
5. GitHub 콘텐츠 갱신 후 Vercel이 재배포한다. GitHub 읽기 확인과 실제 `/release.json`의 릴리스 ID·해시 확인을 구분한다. 실제 사이트 확인 전에는 원격 발행 완료로 표시하지 않는다.

연결 대상은 `kenitoa/War-Achive`, 브랜치 `main`, 파일 `Vercel/content/archive.json`이다. 기존 환경 파일의 GitHub 토큰은 인증 실패 상태여서 원격 발행은 기본 비활성화했다. NAS에 제한된 콘텐츠 쓰기 토큰을 직접 갱신하고 [환경 설정](docs/environment.md)과 [운영 절차](docs/operations.md)에 따라 활성화한다. 토큰을 채팅에 보내지 않는다.

## 검증과 복구

저장소 루트에서 `node NAS/scripts/sync-contracts.mjs --check`와 `NAS/scripts/verify-all.ps1`로 계약 동기화 및 세 앱의 lint·타입·테스트·빌드를 실행한다. 추가 도구·실제 NAS·외부 공급자 검증 범위는 [검증 기록](docs/verification.md)에서 확인한다.

관리자 JSON 내보내기는 메타데이터 백업이다. 전체 DB·원본·릴리스 백업은 [운영 절차](docs/operations.md)를 따른다. 복원은 새 경로 또는 빈 DB에서 수행하고 기존 운영 DB를 초기화하지 않는다.
