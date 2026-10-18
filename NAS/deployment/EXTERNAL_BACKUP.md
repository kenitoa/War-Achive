# NAS 외부 암호화 백업

`export-backup.sh`는 운영 중인 전쟁 아카이브 **애플리케이션 전체**를 복구하기 위한 백업이다. NAS 운영체제, 다른 서비스, Tailscale 인증 상태 전체를 복제하는 디스크 이미지가 아니다. 복원은 별도의 NAS/Docker 환경에 진행하고 검증 후 연결한다.

## 백업 내용과 일관성

- PostgreSQL custom dump, 원본/가공 자료 파일, 발행 릴리스와 각 SHA-256 체크섬
- 운영 환경 변수와 해당 애플리케이션의 GitHub 배포 SSH 키/known_hosts
- 활성 커밋의 소스와 Compose, 배포 bootstrap, 현재 커밋 상태
- 활성 backend/gateway 및 PostgreSQL 17 Docker 이미지와 이미지 식별자

NAS의 `state/update.flock`을 공유하여 배포/다른 백업과 충돌하지 않는다. API·worker·공개 gateway를 잠시 정지해 DB와 파일을 같은 시점으로 복사하고, 종료·오류 시 다시 시작한다. 세 서비스의 실제 health가 모두 정상임을 확인한 뒤 큰 이미지 내보내기를 수행한다. 백업에는 회원 정보와 운영 비밀값이 있으므로 NAS 임시/보존 폴더도 `umask 077`로 만든다. 기존 백업과 볼륨은 삭제하지 않는다.

AES-256-GCM 암호화 키는 SSH 표준입력과 Docker 표준입력으로만 전달한다. 키를 명령 인수, Git, NAS 영구 설정, 이미지, 로그에 넣지 않는다. 암호화 후 NAS에서 인증 태그와 복호화 파일 해시가 같은지 확인한 파일만 `external-backup-ready.json`에 기록한다.

## Windows PC 전용 폴더

`Install-ExternalBackup.ps1`에 대상 폴더, NAS 호스트/사용자, 기존 SSH 개인키/known_hosts, NAS 프로젝트 경로를 전달한다. 예:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File NAS/deployment/Install-ExternalBackup.ps1 `
  -Destination C:/Users/<사용자>/WarArchiveBackups `
  -HostName <NAS-IP> -SshUser <NAS-사용자> `
  -IdentityFile <기존-SSH-개인키-절대경로> `
  -KnownHostsFile <기존-known_hosts-절대경로> `
  -RemoteRoot /volume3/docker/War_Archive_Server
```

프로세스 범위의 실행 정책 옵션만 사용하며 시스템 실행 정책은 바꾸지 않는다. 설정/설치 클라이언트/키는 `%LOCALAPPDATA%/WarArchiveBackup`에 둔다. 이 폴더 ACL은 현재 Windows 사용자와 SYSTEM만 허용하고, 암호화 키는 **Windows DPAPI CurrentUser**로 보호한다. 기존 설정과 키는 덮어쓰지 않는다.

Windows 작업 스케줄러 `War Archive encrypted external backup`을 매일 02:20 및 사용자 로그인 때 실행한다. 최근 20시간 안에 검증된 파일이 남아 있으면 로그인 시 중복 백업을 건너뛴다. PC가 켜져 있고 해당 사용자가 로그인되어 있으며 NAS에 네트워크로 접근할 수 있어야 한다. 실패 시 10분 간격으로 최대 3회 재시도하며, 4시간 실행 제한과 중복 실행 방지를 적용한다. PC가 계속 꺼져 있으면 외부 복사는 수행되지 않는다.

외부 폴더에는 암호문 `.tar.gz.enc`, 검증 영수증 `.receipt.json`, `latest.json`만 저장한다. SSH 호스트 키 일치를 강제하고 내려받은 암호문 크기/SHA-256과 AES-GCM 인증 및 평문 SHA-256을 확인한 후에만 완료 파일로 바꾼다. PC에서 평문 백업 파일은 만들지 않는다. 실패한 `.partial`은 완료로 표시하지 않고 보존해 조사할 수 있다.

```powershell
node "$env:LOCALAPPDATA/WarArchiveBackup/external-backup-client.mjs" backup "$env:LOCALAPPDATA/WarArchiveBackup/config.json"
node "$env:LOCALAPPDATA/WarArchiveBackup/external-backup-client.mjs" verify "$env:LOCALAPPDATA/WarArchiveBackup/config.json"
node "$env:LOCALAPPDATA/WarArchiveBackup/external-backup-client.mjs" return-for-rehearsal "$env:LOCALAPPDATA/WarArchiveBackup/config.json"
Get-ScheduledTask -TaskName 'War Archive encrypted external backup'
```

## 복구와 한계

`return-for-rehearsal`은 PC에 내려받아 검증한 암호문을 NAS의 새 비공개 작업 폴더에 되가져온다. 키는 별도 SSH 표준입력으로 보내며 `prepare-backup-rehearsal.py`가 `encrypt-backup.mjs decrypt ... --key-stdin`를 실행한다. 인증 태그를 확인한 뒤에만 완성된 평문 파일을 생성한다. 새 폴더에 일반 파일/디렉터리만 안전하게 풀고 외부의 11개 `SHA256SUMS`를 검사한다. 이후 `backup/`의 DB/원본/발행 자료를 격리된 새 Compose 프로젝트에 복원하고 `restore-rehearsal.py`로 내부 체크섬·해시·DB·API를 검증한다. 운영 DB/볼륨을 대상으로 지정하지 않는다.

`recovery/runtime-images.tar.gz`는 네트워크 없이 `docker load`할 수 있는 이미지 집합이다. `recovery/source-and-bootstrap.tar.gz`는 활성 릴리스를 포함한다. 새 환경에서 `environment.env`와 `secrets.tar`를 원래의 비공개 위치로 복구하고 파일 소유권/권한을 맞춘 뒤 Compose 경로를 새 NAS 위치에 맞춰 생성한다. worker와 원격 발행을 끄고 세션/복구 토큰을 폐기한 상태로 검증한 다음 운영 연결을 전환한다.

운영 NAS에서 외부 사본의 이미지까지 검증하는 경우 `python3 deployment/verify-recovery-runtime.py <되가져온-새-폴더>/restored --load-images`를 실행한다. 환경 설정과 배포 키의 비공개 권한, 소스·bootstrap, 이미지 archive의 세 태그와 이미지 ID를 먼저 검증한다. 현재 backend·gateway·PostgreSQL 태그가 보관된 이미지 ID와 전부 같은 경우에만 실제 이미지 로드를 허용하고, 로드 후 ID를 다시 확인한다. 다른 서비스가 공유하는 PostgreSQL 태그를 과거 이미지로 바꾸지 않는다. 이 보호장치의 POSIX 권한 테스트는 실제 NAS/Linux에서 `python3 -m unittest discover -s deployment/test -p 'test_recovery_runtime.py'`로 실행한다.

DPAPI 키는 현재 PC의 현재 사용자에 묶여 있다. **다른 PC에서 복구하려면 별도로 보관한 복구용 키가 필요하다.** 현재 구현은 키를 임의의 클라우드나 암호문 폴더로 복사하지 않는다. PC 손실까지 대비하려면 사용자가 별도의 암호 관리자/오프라인 매체에 복구 키를 보관해야 한다. PC 전용 폴더는 NAS 밖의 사본이지만 물리적으로 같은 장소에 있으면 원격지 백업이 아니다. 자동 보존본 삭제는 하지 않으므로 디스크 사용량과 실패 상태를 확인해야 한다.
