# version 1.3

## 디자인과 인덱싱을 전면 개편한 버전

`version 1.3`은 `version 1.2`의 정적 프론트엔드 구조를 유지하면서, 화면 디자인과 JavaScript 동작 방식을 크게 정리한 버전입니다. 이전에는 `version 1.2`와 같은 커밋을 가리켰지만, 현재는 `fdfb6a7` 커밋을 기준으로 별도의 수정 사항이 반영되었습니다.

이 버전의 핵심은 "전체 화면의 톤을 통일하고, 카테고리별 개성을 살리며, 인덱싱 규칙을 정리하는 것"입니다.

## 이 버전의 성격

- 프론트엔드 디자인 전면 개편 버전
- 폰트, 이모지, 화면 표현 방식을 통일한 버전
- 카테고리별 고유 색상을 적용한 버전
- 홀로그램 기능을 제거하고 화면 동작을 단순화한 버전
- JavaScript 파일 전반에 인덱싱 규칙을 적용한 버전

## 소개

`version 1.3`에서는 War Archive의 시각적 완성도를 높이기 위해 CSS 구조가 크게 바뀌었습니다. 공통 스타일을 더 체계적으로 관리하기 위해 `archive_common.css`, `category_refresh.css`, `category_tokens.css`가 새로 추가되었고, `main_style.css`도 큰 폭으로 수정되었습니다.

카테고리별 페이지도 함께 조정되었습니다. 전쟁 개요, 전장 지도, 인물 열전, 전략과 전술, 사료와 문서, 무기와 장비, 미분류 기록, 정보 페이지의 HTML/CSS가 전반적으로 다듬어졌습니다. 특히 각 카테고리가 고유한 색상과 분위기를 갖도록 정리한 점이 이 버전의 중요한 변화입니다.

JavaScript 쪽에서는 기존 홀로그램 관련 기능을 제거하고, 데이터 연결과 검색 인덱스 처리 방식에 맞춰 파일을 정리했습니다. `main_tech.js`와 각 카테고리별 스크립트가 수정되었고, `Battlefield Map`과 `war overview` 검색 JSON도 함께 갱신되었습니다.

## 주요 수정 사항

- 전체 디자인 톤 정리
- 폰트와 이모지 사용 방식 통일
- 카테고리별 고유 색상 적용
- 공통 CSS 파일 추가
  - `front/assets/css/common/archive_common.css`
  - `front/assets/css/common/category_refresh.css`
  - `front/assets/css/common/category_tokens.css`
- 메인 페이지 스타일 대규모 수정
- 카테고리별 목록/상세 페이지 HTML과 CSS 수정
- 홀로그램 기능 제거
- JavaScript 인덱싱 규칙 적용
- `front/assets/js/common/main_tech.js` 대규모 수정
- `Battlefield Map`, `war overview` 검색 데이터 갱신
- 버전 소개 문서 추가 및 정리

## 주요 구성

- `front/index.html`: 메인 화면 구조 개편
- `front/assets/css/common/`: 공통 디자인 토큰과 아카이브 스타일
- `front/assets/css/*`: 카테고리별 스타일 개편
- `front/assets/js/common/main_tech.js`: 메인 동작 및 인덱싱 로직 정리
- `front/assets/js/*`: 카테고리별 동작 수정
- `front/data/search/`: 검색 인덱스 데이터 갱신
- `main.md`, `version 1.md`, `version 1.1.md`, `version 1.2.md`, `version 1.3.md`: 버전별 소개 문서

## version 1.2와의 차이

`version 1.2`가 백엔드와 로그인 기능을 제거하고 정적 프론트엔드 중심으로 단순화한 버전이었다면, `version 1.3`은 그 정적 프론트엔드의 완성도를 높이는 버전입니다.

기능 범위를 다시 넓히기보다는, 현재 남아 있는 프론트엔드 경험을 더 일관성 있게 다듬었습니다. 따라서 1.3은 "기능 추가 버전"이라기보다 "디자인 및 구조 정리 버전"에 가깝습니다.

## 기록

- 기준 ref: `origin/version-1.3` / 현재 브랜치 `version-1.3`
- 기준 커밋: `fdfb6a7` (`대규모 수정`)
- 기준 커밋 날짜: 2026-04-27
- 이전 기준: `origin/version-1.2`의 `77d307c`
- 변경 규모: 61개 파일, 6264 insertions, 3960 deletions
