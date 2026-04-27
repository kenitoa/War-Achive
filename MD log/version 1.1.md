# version 1.1

## 소개

`version 1.1`에서는 초기 폴더명과 파일 배치가 더 일반적인 웹 프로젝트 구조로 정리되었습니다. 기존의 `Templet`, `Style`, `tech` 중심 구성에서 벗어나 `front/pages`, `front/assets/css`, `front/assets/js`, `front/data` 형태로 이동합니다.

이 변화 덕분에 HTML, CSS, JavaScript, 이미지, 검색 데이터의 위치가 더 쉽게 파악됩니다. 동시에 `back/src/`에는 Express 앱, 라우트, 컨트롤러, 서비스, 모델, 미들웨어가 구성되어 있어 API 서버 구조도 유지됩니다.

## 주요 기능

- `front/index.html`을 중심으로 한 메인 진입점 정리
- 카테고리별 HTML 페이지를 `front/pages/` 중심으로 재배치
- CSS와 JavaScript를 `front/assets/` 아래로 정리
- 검색 인덱스 데이터를 `front/data/search/`로 분리
- Express 백엔드와 Docker 인프라 구조 유지
- Nginx 프록시 및 서버 설정 일부 보완

## 주요 구성

- `front/pages/`: 카테고리별 목록/상세 페이지
- `front/assets/css/`: 공통 스타일과 페이지별 스타일
- `front/assets/js/`: 공통 스크립트와 페이지별 스크립트
- `front/data/search/`: 카테고리별 검색 인덱스
- `back/src/`: Express API 서버 코드
- `infra/`: Docker와 Nginx 설정

## 기록

- 기준 ref: `origin/version-1.1`
- 기준 커밋: `4a05080` (`test`)
- 커밋 기간: 2026-04-12 ~ 2026-04-18
