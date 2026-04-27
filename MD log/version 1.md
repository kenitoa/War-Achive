# version 1

## 주요 기능

- 7개 주요 아카이브 카테고리 구성
- 카테고리별 목록 페이지와 상세 페이지 추가
- JSON 기반 데이터 파일과 검색 인덱스 확장
- Node.js/Express 백엔드 API 구조 추가
- Docker Compose와 Nginx 기반 인프라 구성
- API, 백업, 배포, 구조 문서 분리

## 주요 구성

- `front/`: 사용자 화면, 카테고리 페이지, CSS, JavaScript
- `back/`: Express API 서버와 인증/사용자/데이터 관련 코드
- `data/`: DB, 로그, 업로드, 캐시 등 운영 데이터 영역
- `infra/`: Docker Compose, Nginx, 배포/백업 스크립트
- `docs/`: API, 백업, 배포, 구조 문서

## 버전 의미

`version 1`은 War Archive가 가장 넓은 범위로 확장된 버전입니다. 기능적으로는 야심 찬 단계이지만, 동시에 프로젝트 관리 측면에서는 정리가 필요한 파일도 함께 포함되었습니다. 이후 `version 1.1`은 이 구조를 더 정돈하고, `version 1.2` 이후에는 다시 프론트엔드 중심으로 범위를 줄이는 흐름으로 이어집니다.

## 기록

- 기준 ref: `origin/version-1`
- 기준 커밋: `8ff0cc0` (`fix`)
- 커밋 기간: 2026-04-12 ~ 2026-04-18
