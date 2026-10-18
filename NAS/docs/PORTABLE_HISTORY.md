# Portable 이전의 이력 보존

## 형식과 호환성

새 내보내기는 `war-archive-portable` 버전 2를 사용한다. 기존 DB 행과 보존 원본 외에 `productions`의 모든 개정에서 참조하는 제작 파일을 SHA256별로 보존하며, 발행본의 `archive.json`과 `manifest.json`을 원래 바이트 그대로 포함한다. 준비/완료된 발행본이나 제작 이력의 파일이 누락되거나 해시가 다르면 내보내기와 검증을 실패시킨다. 공개본은 DB에 기록된 의미상 SHA256, 발행 식별자, 자료 수도 함께 대조한다. 기존 DB 마이그레이션을 바꾸거나 운영 행을 삭제하지 않는다.

버전 1 읽기는 유지한다. 이 형식은 제작 파일과 발행 디렉터리를 포함하지 않으므로 가져오기 결과와 감사 기록은 `historyPreserved:false`를 표시한다. 이후 제작 작업은 현재 자료를 다시 만들 수 있지만 이전 개정의 파일을 복구했다고 보지 않는다. 전체 이력 이전에는 원래 저장소의 파일을 확보하거나 버전 2를 새로 내보내야 한다.

## 새 이전

API와 worker의 쓰기를 멈춘 일관된 시점에 `NAS/back`에서 실행한다. 내보내기는 `DATA_DIR`, `EXPORT_DIR`의 실제 파일을 검증하며 대상 bundle 경로는 존재하지 않아야 한다.

```sh
node dist/commands/export-portable.js /private/new-bundle
node dist/commands/import-portable.js /private/new-bundle /private/new-data /private/new-releases
```

가져올 DB는 마이그레이션만 적용한 빈 DB여야 하며 데이터와 발행 디렉터리도 새 빈 경로를 사용한다. 네 번째 인자인 발행 경로를 생략하면 새 데이터 디렉터리 안의 `releases`를 사용한다. 원래 환경의 `EXPORT_DIR`를 자동 선택하지 않는다. 가져온 서비스는 결과의 `releaseDirectory`를 `EXPORT_DIR`로 설정한다. 기존 세션과 복구 토큰은 이전하지 않으며 실행 중 작업은 재대기시킨다. 기존 파일을 덮어쓰지 않는다. 실패한 새 대상은 운영 대상으로 바꾸지 말고 보존한 source와 bundle을 사용해 다른 빈 경로에서 다시 시도한다.

버전 2 제작 이력의 경로는 새 데이터 디렉터리의 `derivatives/preserved/<sha256>`로 옮긴다. worker가 아직 실행되지 않아도 이전 제작물과 발행 디렉터리가 모두 있어야 한다. 현재 자료를 새로 제작하는 작업은 이력 파일과 별도로 유지한다.

## 기존 NAS 이전분 보완

최초 버전 1 이전에서 제작 이력의 경로만 `derivatives/regenerate/<sha256>`로 변경되고 파일과 이전 발행 디렉터리가 빠졌음을 전체 복원 검사에서 발견했다. PC에 남아 있는 원래 제작 파일과 발행 디렉터리를 운영 DB의 기대 SHA256 및 자료 수와 대조하여 불변 파일만 복원한다. 당시 필요한 범위는 고유 제작 파일 761개(참조 885개)와 이전 발행 6개의 파일 12개다.

`deployment/repair-historical-files.py`는 bundle 전체 SHA256, tar 허용 경로, 일반 파일 여부, 중복, 크기 상한, 파일별 SHA256을 검증한다. `update.flock` 아래에서 현재 이미지의 기존 UID 1000으로 자체 데이터/발행 volume에만 접근하고 네트워크와 capability를 제거한다. 모든 대상의 기존 파일을 먼저 검사한 뒤 누락 파일만 원자적으로 추가하며, 기존 바이트가 다르면 중단한다. DB에는 접속하지 않는다. 기본은 dry run이며 `--apply`를 명시해야 적용한다.

```sh
python3 deployment/repair-historical-files.py \
  --root /volume3/docker/War_Archive_Server \
  --bundle /volume3/docker/War_Archive_Server/artifacts/historical-repair-bundle.tar.gz \
  --sha256 <검증한-bundle-SHA256> \
  --installer-sha256 <검증한-install-historical-files.mjs-SHA256>
```

추가한 이력은 삭제하지 않으며 반복 실행은 해시가 일치하는 파일을 그대로 보존한다. 적용 뒤 새 dump/tar와 외부 암호화 백업을 만들고, 격리 복원에서 전체 제작 이력과 모든 준비/완료 발행본을 다시 검사한다. 이 문서의 파일 수는 보완 범위이며 실제 적용·복원 성공 여부는 해당 실행 결과로 확인한다.
