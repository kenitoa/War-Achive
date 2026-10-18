# War Archive 서비스 복원 검증

`deployment/restore-rehearsal.py`는 배포 백업을 실제 PostgreSQL과 API로 복원한다. 운영 데이터베이스, 볼륨, 설정, 포트, SSH 키를 사용하지 않는다. NAS 운영체제·DSM 설정·다른 프로젝트 전체 복원 검증과는 범위가 다르다.

## 실행

NAS 프로젝트 소유자로 실행한다. Docker 실행 권한과 이미 보관된 `postgres:17-alpine`, `war-archive-backend:<40자리 커밋>` 이미지가 필요하다. 원격 이미지를 내려받지 않는다.

```sh
python3 /volume3/docker/War_Archive_Server/deployment/restore-rehearsal.py \
  --backup /volume3/docker/War_Archive_Server/backups/<백업 폴더> \
  --image-commit <실제로 보관된 백엔드 이미지의 40자리 커밋> \
  --artifacts /volume3/docker/War_Archive_Server/artifacts/restore
```

`restore-rehearsal.py`와 `verify-restored-archive.mjs`는 같은 디렉터리에 둔다. 실행 전에 백업의 DB·자료·발행 tar 3개 SHA256, tar 경로, 심볼릭 링크·특수 파일 여부를 검사한다. 잘못된 백업은 Docker 생성 전에 거부한다. 암호화 외부 백업으로 검증할 때는 외부에서 다시 읽어 온 파일을 별도 새 디렉터리에 복호화·체크섬 검증한 뒤 그 안의 서비스 백업 경로를 지정한다.

## 검증 내용과 보호 경계

- 무작위 이름의 전용 Compose 프로젝트·새 PostgreSQL·자료/발행 볼륨을 만든다. 이름이 이미 있으면 거부한다.
- 외부 통신이 차단된 Docker 내부 네트워크만 사용한다. 호스트 포트를 열지 않고 API·DB만 실행한다. 워커, 자동 발행, GitHub 전송은 꺼져 있다.
- 기존 회원 세션과 비밀번호 재설정 토큰을 복원 DB에서 폐기하고 실행 중이던 작업의 lease를 재설정한다. 회원·서재 자체는 보존한다.
- 복원 DB의 레코드·버전·회원·서재 수, 원본과 생산 파일의 SHA256, 발행 스냅샷·manifest의 SHA256, 헬스 체크, 관리자 화면·인증·개요를 검사한다.
- 정상·실패 모두 이 실행이 만든 전용 컨테이너·네트워크·볼륨을 정리한다. 운영 프로젝트를 대상으로 하는 `down`이나 `prune`은 사용하지 않는다.
- 결과 JSON과 오류 진단은 소유자 전용 artifacts 디렉터리에 남긴다. 자원 정리 성공 후 임시 테스트 비밀값을 포함한 Compose 파일을 삭제한다. 정리에 실패하면 복구 작업을 위해 해당 전용 설정 파일을 남기고 결과를 실패로 표시한다.

실제 재해 복구에서는 먼저 암호화 백업에서 고정 소스·이미지·환경 설정·배포 키를 복구하고, 새 빈 대상에 데이터베이스와 파일을 복원한다. 운영 전환 전 이 리허설을 실행하고 HTTPS, 인증 만료 정책, 백업 대상 접근 권한을 따로 확인한다. 운영 원본 백업이나 기존 볼륨을 덮어쓰는 작업은 이 도구가 수행하지 않는다.

## 로컬 보호장치 테스트

```sh
python -m unittest discover -s NAS/deployment/test -p "test_restore_rehearsal.py" -v
node --check NAS/deployment/verify-restored-archive.mjs
```
