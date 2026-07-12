# 전쟁 역사 아카이브 NAS 백엔드

`back`은 NAS 내부에서 실행되는 자료 수집·가공·발행 작업기입니다. API 도메인, Caddy, 외부 포트 포워딩과 GitHub Pages의 NAS 직접 연결은 필요하지 않습니다. 같은 내부망에서는 `http://NAS-IP:9231`로 처리 관제 화면을 볼 수 있습니다.

## 전체 흐름

```text
NAS Docker
  30분마다 미수집 역사 주제 1개 선택
  → 주제에 등록된 관련 출처 전체 수집
  → ID·URL·본문 해시 중복 제거
  → 라벨링
  → 주제 단위 정보화
  → NAS Docker 볼륨에 발행 대기

  40분마다 발행 대기 기록 1개 선택
  → GitHub Contents API로 front/web/content/archive.json에 누적
  → main 브랜치에 커밋 생성
  → front의 Pages 워크플로가 push 감지
  → 정적 상세 페이지와 sitemap 재생성
  → GitHub Pages 공개
```

GitHub에 올라가는 것은 가공이 끝난 공개 기록뿐입니다. 원시 크롤링 자료, 라벨링 중간 산출물, NAS 상태 파일과 토큰은 NAS 볼륨에만 남습니다.

## Docker 구성

| 항목 | 책임 |
| --- | --- |
| `backend` 컨테이너 | 30분 수집 스케줄러와 40분 정적 발행 스케줄러 |
| `back/admin` | NAS 상태 파일을 읽는 React 관제 화면과 로컬 상태 API |
| `war-archive_data` 볼륨 | 원문, 라벨링, 정보화 결과, 완료 ID와 실행 시각 |

컨테이너는 NAS의 `9231` 포트를 관제 화면에 사용합니다. 인터넷 공유기에는 이 포트를 전달하지 않고 NAS 내부망에서만 접근하는 것을 권장합니다. 외부로 나가는 HTTPS 연결은 자료 출처 접근과 GitHub API 호출에만 사용합니다.

## GitHub 토큰

Fine-grained personal access token은 다음 최소 권한만 사용합니다.

- Repository access: front 저장소 하나
- Repository permission: **Contents → Read and write**

토큰은 NAS의 `back/.env`에만 저장하고 Git에 커밋하지 않습니다. 발행기는 워크플로 파일을 수정하지 않으므로 Workflows 쓰기 권한은 필요하지 않습니다.

## NAS 설치

```bash
cd /volume1/docker/war-archive-back
GITHUB_FRONT_TOKEN='발급한_토큰' sh nas-install.sh
```

설치 스크립트는 Docker·Compose 확인, 권한이 제한된 `.env` 생성, Compose 설정 검사, 이미지 빌드와 스케줄러 시작을 수행합니다.

## 환경 설정

```dotenv
COMPOSE_PROJECT_NAME=war-archive
TZ=Asia/Seoul
ADMIN_PORT=9231
COLLECTION_INTERVAL_MS=1800000
PUBLICATION_INTERVAL_MS=2400000
GITHUB_FRONT_REPOSITORY=kenitoa/warsachive
GITHUB_FRONT_TOKEN=replace-with-fine-grained-token
GITHUB_FRONT_REF=main
GITHUB_FRONT_CONTENT_PATH=web/content/archive.json
```

- `1800000`: 30분마다 역사 주제 최대 1개 수집
- `2400000`: 40분마다 공개 기록 최대 1개 누적 커밋
- 성공 시각과 완료 ID는 볼륨에 저장되어 재시작 후에도 유지
- GitHub 커밋 실패 시 같은 기록을 다음 발행 주기에 재시도
- GitHub 파일에 이미 같은 ID가 있으면 중복 커밋하지 않고 완료 처리

## 주제와 출처 등록

`pipeline/config/topics.json`에서 하나의 주제 아래 관련 출처를 모두 등록합니다.

```json
{
  "id": "imjin-war",
  "title": "임진왜란",
  "period": "1592-1598",
  "region": "조선과 동아시아",
  "sources": [
    {
      "id": "official-overview",
      "kind": "url",
      "url": "https://archive.example.org/imjin-war",
      "compliance": {
        "reviewedAt": "2026-07-12",
        "crawlAllowed": false,
        "termsUrl": "https://archive.example.org/terms",
        "copyrightUrl": "https://archive.example.org/copyright",
        "minIntervalMs": 3000,
        "notes": "허용 범위를 확인한 뒤 true로 변경"
      }
    }
  ]
}
```

목표는 공개·공공·만료·허가 자료와 신뢰할 수 있는 기관 출처를 가능한 한 많이 발굴해 등록하는 것입니다. 등록된 주제의 관련 출처는 한 번의 수집 작업에서 모두 처리합니다.

우선순위:

1. 법령·판결·정부 공고와 공식 기록
2. 공공누리, 오픈 라이선스, 저작권 만료·기증 자료
3. 국가기록원·국사편찬위원회·박물관·도서관·대학의 1차 사료
4. 독립된 신뢰 출처로 교차 확인할 수 있는 연구 자료

`robots.txt` 허용은 원문 재게시 허락과 같지 않습니다. 자동 접근, 저장, 가공과 공개 범위를 각각 확인하며 로그인·유료벽·CAPTCHA·접근통제를 우회하지 않습니다.

## 운영과 검증

```bash
docker compose ps
docker compose logs -f --tail=200 backend
sh nas-install.sh
```

관제 화면: `http://NAS-IP:9231`

```bash
npm run typecheck
npm run build
npm test
npm run audit:sources
```

`docker compose down -v`는 NAS 수집 자료와 발행 상태를 삭제하므로 사용하지 마세요.

실제 입력값과 최초 설치 순서는 [`setup.md`](./setup.md), 상세 운영·출처 설정은 [`usersetting.md`](./usersetting.md)에 정리되어 있습니다.
