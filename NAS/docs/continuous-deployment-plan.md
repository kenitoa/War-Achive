# NAS · VS Code · Vercel 연속 배포 계획

## 목적과 영향

사용자가 요청한 실제 NAS Docker 배포와 VS Code의 변경 반영을 연결한다. NAS의 백엔드·PostgreSQL·worker·원본을 전용 경로에 두고 기존 다른 컨테이너는 변경하지 않는다. 공개 웹의 기존 Vercel 프로젝트와 자료 URL을 유지한다.

확인한 Synology NAS는 x86_64, Docker 24.0.2, Compose 2.20.1이다. 전용 운영 경로는 `/volume3/docker/War_Archive_Server`다. 접속 주소와 SSH 로그인 정보는 비공개 로컬 설정에서 관리한다. 소스의 최상위 작업 폴더는 NAS/Vercel을 유지한다.

## 데이터 흐름

1. VS Code에서 main을 편집·검증·커밋·푸시한다. 저장만 한 미완성 코드는 자동으로 배포하지 않는다.
2. Vercel은 GitHub main의 Vercel 폴더를 자동 빌드한다.
3. NAS 갱신 작업은 main에서 NAS 폴더를 변경한 마지막 커밋을 고정해 새 릴리스에 내려받고, 이미지 빌드·백업·마이그레이션·건강 검사를 거쳐 API/worker를 갱신한다.
4. NAS 수집·정제·검수·제작 worker는 공개 snapshot만 GitHub의 Vercel/content/archive.json에 반영한다. 실제 Vercel release.json의 ID·해시를 확인한다.
5. NAS 전용 쓰기 deploy key를 사용해 PC의 광범위한 GitHub 인증 비밀을 NAS로 복사하지 않는다. 키와 host 검증 파일은 이미지 밖에서 읽기 전용으로 제공한다.
6. 공개 회원·서재·접수 API는 정확한 경로/메서드만 허용한 NAS gateway와 Vercel의 같은 origin 프록시로 연결한다. 관리자·DB·원본 다운로드 경로는 외부로 열지 않는다.

## 구현 및 배포 순서

1. NAS 경로·포트·기존 컨테이너·디스크·Docker와 원격 저장소를 확인한다.
2. 안전한 갱신 스크립트, NAS 패키지 도구, SSH 발행 어댑터, gateway/프록시 설정과 회귀 검사를 작성한다.
3. 로컬 수집을 잠시 정지하고 최신 portable bundle을 생성한다. NAS로 비공개 설정과 자료를 전송하고 새 빈 PostgreSQL에 가져온다.
4. NAS에서 API/worker·gateway를 실행하고 실제 DB·자료·검수·백업·헬스 체크를 확인한다.
5. 자동 갱신 작업을 등록하고 VS Code의 main 푸시로 NAS 릴리스 전환과 Vercel 배포를 검증한다.
6. NAS에서 실제 공개본 발행 후 GitHub 커밋·Vercel 실제 릴리스 해시·공개 API 흐름을 확인한다.

## 위험과 복구

운영 원본/DB/설정은 불변 소스 릴리스 밖에 보존한다. 기존 볼륨을 초기화하지 않는다. 갱신은 중복 실행 잠금과 고정 커밋, 명시적 프로젝트/볼륨명을 사용한다. 코드 전환 실패 시 이전 이미지로 복구하며 DB 마이그레이션은 삭제하거나 되감지 않는다. 수집기의 콘텐츠 커밋만으로 NAS 이미지가 반복 재빌드되지 않게 NAS 변경 커밋을 기준으로 판단한다.

공개 gateway는 계정/서재/접수 경로만 허용한다. 전용 SSH 키는 이 저장소에만 권한을 주고 host key를 고정한다. 비밀값은 Git·로그·이미지·공개 snapshot에 포함하지 않는다. 기존 NAS 앱·도메인·Tailscale 경로를 임의로 덮어쓰지 않는다.

## 검증

세 앱 lint·typecheck·test·build, 배포 스크립트 정상/실패/롤백 검사, SSH 발행 멱등/충돌/무결성, gateway 경로 제한과 같은 origin 쿠키를 검사한다. 실제 NAS의 PostgreSQL·worker·재시작 보존·소스 SHA, Vercel Git 배포 SHA, NAS 발행 결과, 공개 API의 로그인/서재/로그아웃을 각각 증거로 기록한다.
