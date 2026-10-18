# 환경 설정

실제 비밀값을 문서·로그·Git에 넣지 않는다. NAS/.env만 로딩하며 기존 NAS/back/.env는 호환 참고 파일로 남겨 자동 로딩하지 않는다. 프로세스 환경 변수가 NAS/.env보다 우선한다. .env.example은 키 이름 목록이며 빈 값 그대로 실행하는 템플릿이 아니다.

| 키 | 설정 |
|---|---|
| WAR_ARCHIVE_ADMIN_TOKEN | 필수. 24자 이상의 독립된 난수 토큰. 관리자 로그인에만 사용 |
| ADMIN_EDITOR_TOKEN / ADMIN_REVIEWER_TOKEN / ADMIN_PUBLISHER_TOKEN | 선택. 각각 24자 이상. 편집·검수·발행 역할 분리 |
| ADMIN_TOTP_SECRET | 선택. Base32 TOTP 비밀키. 설정 시 모든 관리자 로그인에 OTP 필요 |
| NODE_ENV | 기본 development. production은 DATABASE_URL 필수 |
| HOST / ADMIN_PORT | 기본 127.0.0.1 / 4310. 컨테이너는 0.0.0.0 / 4310 |
| DATABASE_URL | NAS 운영 PostgreSQL 연결 문자열. 브라우저에 제공 금지 |
| POSTGRES_PASSWORD | Compose의 PostgreSQL 초기 암호. 최초 시작 전 별도 생성 |
| DATA_DIR | 기본 NAS/data. 원본·로컬 DB를 두는 비공개 영속 디렉터리 |
| PGLITE_PATH | 개발용 파일 PostgreSQL 경로. 기본 DATA_DIR/database. 동시 API/worker 두 프로세스 사용 금지 |
| EXPORT_DIR | 기본 NAS/releases. 공개본/manifest를 저장 |
| PUBLIC_SNAPSHOT_PATH | 선택. 로컬 개발에서 공개본을 Vercel/content/archive.json에 복사할 절대 경로 |
| ALLOWED_ORIGINS | 쉼표로 구분한 정확한 origin. 와일드카드 금지. 운영 외부 출처는 HTTPS |
| COOKIE_SAME_SITE | 기본 lax. 별도 사이트 간 인증은 none 및 HTTPS 필요 |
| PUBLIC_ACCOUNT_API_ENABLED | 기본 false. 회원·제보 API 외부 연결을 준비한 경우에만 true |
| COLLECTION_INTERVAL_MS | 스케줄러의 출처 확인 주기. 기본 60000. 실제 수집 주기는 출처별 intervalSeconds |
| COLLECTION_MAX_ITEMS_PER_SOURCE | 한 번의 수집 상한, 기본 20, 최대 200 |
| PUBLICATION_INTERVAL_MS | 변경사항 발행 확인 간격. 기본 7200000 |
| SCHEDULER_RETRY_MS | 작업 폴링 간격. 기본 5000 |
| AUTO_PUBLISH_ENABLED | 기본 true. 출처별 공개 정책을 통과한 자료만 발행 대상 |
| LOCAL_WORKER_ENABLED | 기본 true. 로컬 PGlite에서는 API 내부 worker로 실행. PostgreSQL 운영은 별도 worker |
| REMOTE_PUBLISH_ENABLED | 기본 false. true일 때만 GitHub 전송 설정 활성화 |
| GITHUB_FRONT_REPOSITORY | 사용자가 지정한 kenitoa/War-Achive |
| GITHUB_FRONT_REF | 운영 콘텐츠 브랜치. 기본 main |
| GITHUB_FRONT_CONTENT_PATH | Vercel/content/archive.json |
| GITHUB_FRONT_TOKEN | REST 방식에서만 필요. 위 저장소의 필요한 콘텐츠 쓰기 권한만 가진 토큰. SSH 배포 키를 사용하는 NAS에는 불필요 |
| GITHUB_FRONT_SSH_KEY_PATH / GITHUB_FRONT_SSH_KNOWN_HOSTS_PATH | 선택. 두 절대 경로를 함께 설정하면 REST 토큰 대신 저장소 전용 SSH 배포 키를 사용. API와 worker에 동일한 파일을 읽기 전용 마운트. 개인 키는 실행 사용자 소유의 0600 또는 0400 파일. known_hosts는 신뢰한 GitHub 공개 호스트 키로 사전 구성하며 자동 수락 금지 |
| PUBLIC_ARCHIVE_VERIFY_URL | 실제 공개 사이트의 /release.json HTTPS URL. 릴리스 ID/해시 일치 전 원격 발행 완료 처리 금지 |
| S3_ENDPOINT / S3_REGION / S3_BUCKET | 선택. S3 호환 저장소 주소(HTTPS)·지역·전용 bucket |
| S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY | 선택. region/bucket과 함께 모두 설정. 파생 파일 전용 최소 권한 |
| S3_FORCE_PATH_STYLE | 기본 false. S3 호환 공급자가 요구할 때 true |
| MEDIA_PUBLIC_BASE_URL | 선택. 공개 파생 파일의 HTTPS 기준 URL |
| CDN_PURGE_URL / CDN_PURGE_TOKEN | 선택. Cloudflare zone의 정확한 purge_cache HTTPS URL과 제한 토큰. 둘 다 필요 |
| BACKUP_ENCRYPTION_KEY | 선택. 백업 암호화 도구의 base64 32바이트 키. 별도 안전한 위치에 보관 |

기존 PUBLICATION_MIN_QUALITY_SCORE는 진위·권리 승인 조건으로 사용하지 않는다. 점수로 사실 여부를 판정하지 않는다. 기존 Discord 키는 보존하되 자동으로 메시지를 보내지 않는다. 알림의 기본 수단은 구조화 로그와 관리자 대시보드다.

## 공개 웹 환경

Vercel의 NEXT_PUBLIC_API_ORIGIN이 비어 있으면 검색·열람·브라우저 서재는 NAS 없이 동작한다. 회원 동기화·자료 제보를 연결할 때만 HTTPS 공개 API 게이트웨이를 설정한다. 이 게이트웨이는 계정·제보 경로만 노출하며 /admin 및 관리자 API를 공개하지 않는다. PUBLIC_ACCOUNT_API_ENABLED와 ALLOWED_ORIGINS를 함께 설정한다.

같은 사이트의 API 프록시를 권장한다. 다른 사이트의 쿠키는 브라우저 정책에 의해 제한될 수 있다. 실제 도메인 간 로그인·동기화는 배포 환경에서 별도 확인해야 한다.
