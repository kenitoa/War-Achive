# version 1.5

## 크롤링 구조 재정비, 데이터 재구성, 디자인 정리, My Archive 추가 버전

`version 1.5`는 War Archive의 데이터 수집 흐름과 프론트 개인 화면을 함께 정리한 버전입니다. 기존에는 크롤링 코드가 여러 파일에 분산되어 있고, 수집 데이터가 바로 프론트 데이터 구조로 이어지는 흐름이 명확하지 않았습니다. 이번 버전에서는 원형 데이터를 모으는 `total crowling`, 데이터 형태별 정제 영역, 프론트 JSON 양식으로 변환하는 `reconstructure` 흐름을 분리했습니다.

또한 메인 화면 디자인을 기준으로 세부 페이지의 공통 CSS를 정리했고, 기존 Mypage를 `My Archive` 개인 화면으로 확장했습니다. 마지막 단계에서는 불필요하거나 참조되지 않는 CSS를 삭제하고, 깨진 한글 문구와 오래된 임시 페이지 문구를 정리했습니다.

## 이번 버전의 성격

- 크롤링 시스템 흐름을 다시 잡은 버전
- 이미지, 미디어, 텍스트 데이터를 형태별로 정제하도록 분리한 버전
- 수집된 데이터를 `front/data` 하위 폴더의 JSON 양식에 맞게 재구성하는 버전
- 기존 JSON 제목과 같은 데이터가 나오면 새 파일을 만들지 않고 기존 파일에 병합하도록 필터링한 버전
- 메인 화면 기준으로 세부 페이지 디자인을 통일한 버전
- CSS/HTML에서 불필요한 코드와 깨진 잔여 코드를 제거한 버전
- `My Archive` 개인 화면을 새 폴더로 구현한 버전

## 주요 변경 사항

### 1. 크롤링 구조 재정비

`back/crowling` 내부의 기존 단일 크롤링 파일 중심 구조를 정리하고, 역할별 폴더 구조로 나누었습니다.

새로 정리된 핵심 구조는 다음과 같습니다.

- `back/crowling/crowling_core/`
- `back/crowling/total crowling/`
- `back/crowling/reconstructure/`
- `back/crowling/tests/`

기존에 분리 없이 사용되던 크롤링 관련 파일들은 삭제하거나 새 구조로 이동했습니다.

삭제 또는 대체된 기존 파일:

- `back/crowling/crawler.py`
- `back/crowling/daemon.py`
- `back/crowling/front_exporter.py`
- `back/crowling/history_sources.py`
- `back/crowling/rate_limit.py`
- `back/crowling/settings.py`
- `back/crowling/storage.py`
- `back/crowling/sql/schema.sql`
- `back/crowling/.env.example`

수정된 크롤링 관련 파일:

- `back/crowling/Dockerfile`
- `back/crowling/README.md`
- `back/crowling/__init__.py`
- `back/crowling/cli.py`
- `back/crowling/requirements.txt`

### 2. total crowling 역할 정의

`total crowling` 폴더는 원형 자료를 최대한 그대로 수집하는 영역으로 잡았습니다.

이 영역의 목적은 특정 프론트 JSON 양식에 바로 맞추는 것이 아니라, 웹에서 얻을 수 있는 원본 자료를 보존하는 것입니다. 이후 정제 단계에서 필요한 형태로 나눌 수 있도록 이미지, 미디어, 텍스트 원천 데이터를 함께 수집하는 방향으로 정리했습니다.

정리 기준:

- 원본 URL과 출처 정보 보존
- 제목, 설명, 날짜, 출처, 라이선스 관련 필드 보존
- 이미지 URL 또는 파일 후보 보존
- 미디어 자료 후보 보존
- 본문 텍스트 후보 보존
- 추후 재분류가 가능하도록 raw metadata 보존

### 3. Image, Media, Text 정제 흐름 분리

사용자가 요청한 대로 `Image`, `Media`, `Text`는 원형 수집이 아니라 데이터 형태에 맞게 정제하는 영역으로 구성했습니다.

정제 방향:

- `Image`: 이미지 URL, alt/title, 출처, 확장자, 파일명 후보, 대표 이미지 여부 정리
- `Media`: 영상, 음성, 외부 임베드, 파일 링크 등 미디어 자료 후보 정리
- `Text`: 본문, 설명, 태그, 연대, 인물, 사건명 등 텍스트 기반 분류 후보 정리

이 분리는 이후 이미지 전문 추출 기능을 확장하기 위한 기반입니다. 특히 이미지 자료만 독립적으로 가져와도 front 데이터 구조에 붙일 수 있도록 원형 수집과 이미지 정제를 분리했습니다.

### 4. reconstructure 폴더 구현

`reconstructure` 폴더는 `total crowling` 하위 폴더에서 추출된 데이터를 `front/data` 하위 폴더의 JSON 구조에 맞게 바꾸는 역할로 구성했습니다.

구현 방향:

- `front/data`의 하위 폴더 유형을 기준으로 자동 분류
- war overview, Battlefield Map, Historical Sources & Documents, Weapons and Equipment 등 기존 데이터 폴더 구조에 맞춰 변환
- 각 폴더 안의 기존 JSON 파일 양식을 읽고 그 형태에 맞게 필드 정리
- 새 자료가 기존 제목과 유사하거나 동일하면 새 파일을 만들지 않고 기존 JSON에 병합
- 검색용 JSON 인덱스 갱신 흐름과 연결

특히 `한국전쟁.json`처럼 이미 존재하는 자료와 같은 주제의 데이터가 정제 과정에서 나오면 새 파일을 생성하지 않고 기존 파일을 수정하는 방향으로 필터링했습니다.

### 5. 검색 인덱스 갱신

프론트 검색 데이터도 현재 데이터 구조에 맞게 다시 갱신했습니다.

수정된 검색 JSON:

- `front/data/search/Battlefield Map search.json`
- `front/data/search/Historical Sources & Documents search.json`
- `front/data/search/Undefine facts search.json`
- `front/data/search/biography of people search.json`
- `front/data/search/strategy and tactics search.json`
- `front/data/search/war overview search.json`
- `front/data/search/weapons and equipment search.json`

관련 스크립트:

- `front/assets/js/common/generate-index.js`

### 6. 세부 페이지 디자인 통일

메인 화면의 디자인 언어를 기준으로 세부 페이지 CSS를 통일했습니다.

정리한 주요 파일:

- `front/assets/css/common/archive_common.css`
- `front/assets/css/common/category_refresh.css`
- `front/assets/css/common/auth.css`

`archive_common.css`는 기존 세부 페이지 CSS 위에 공통 디자인 레이어로 적용되도록 정리했습니다. 페이지별 CSS를 전부 없애지는 않고, 기존 레이아웃은 유지하면서 색상, 배경, 카드, 타이포그래피, 버튼, 헤더, 관련 자료 영역의 스타일이 메인 화면과 어긋나지 않도록 맞췄습니다.

적용 방향:

- 어두운 archive 배경 유지
- 금색 계열 accent 유지
- 상세 페이지 hero와 card 스타일 통일
- header/nav/logo 스타일 통일
- 페이지 제목, 섹션 제목, 설명 문구 스타일 통일
- detail page의 관련 자료 영역 스타일 통일
- focus-visible 접근성 스타일 추가
- reduce-motion 설정 추가

### 7. CSS/HTML 불필요 코드 정리

사용자가 CSS/HTML부터 필요 없는 코드를 삭제해 달라고 요청한 뒤, 실제 참조 관계를 확인하고 정리했습니다.

삭제한 파일:

- `front/assets/css/common/main_style.css`

삭제 이유:

- `front` 내부에서 더 이상 참조되지 않음
- 메인 화면과 세부 페이지 공통 디자인은 `home_clean.css`, `archive_common.css`, `category_tokens.css`, `category_refresh.css` 중심으로 정리됨

정리한 파일:

- `front/assets/css/common/archive_common.css`
- `front/assets/css/common/category_refresh.css`

`archive_common.css`는 중복되고 깨진 오래된 코드가 섞여 있어 파일을 정리했습니다. `category_refresh.css`는 여러 카테고리 CSS에서 import 중이라 삭제하지 않고, 깨진 주석과 중복 body 보정 코드만 제거했습니다.

삭제하지 않은 파일:

- `front/assets/css/common/category_tokens.css`
- `front/assets/css/common/category_refresh.css`

삭제하지 않은 이유:

- 다수의 카테고리 CSS에서 `@import`로 사용 중
- 삭제하면 카테고리별 색상 토큰과 refresh overlay가 깨질 수 있음

### 8. My Archive 페이지 추가

기존 `Mypage`를 대체하는 개인 화면으로 `My Archive`를 새 폴더에 구현했습니다.

추가된 파일:

- `front/pages/My Archive/My Archive.html`

수정된 파일:

- `front/pages/account/mypage.html`
- `front/assets/js/common/auth.js`
- `front/assets/css/common/auth.css`
- `back/server.js`

라우팅:

- `/my-archive`
- `/my-archive.html`
- `/mypage`
- `/mypage.html`
- `/My Archive`
- `/My Archive.html`

기존 `/mypage` 경로는 새 My Archive 화면으로 연결되도록 유지했습니다. 기존 링크와 사용 흐름이 끊기지 않도록 호환 라우트를 남겼습니다.

### 9. My Archive 최소 기능

My Archive는 로그인된 사용자의 개인 화면으로 동작하도록 최소 기능을 구현했습니다.

구현된 기능:

- 로그인 상태 확인
- 로그인하지 않은 경우 로그인 안내 화면 표시
- 계정 정보 표시
  - 이름
  - 이메일 또는 로그인 ID
  - 권한
  - 가입일
- 개인 활동 요약
  - 저장 자료 개수
  - 개인 메모 존재 여부
- 자료 저장
  - 제목
  - URL
  - 짧은 메모
- 저장 자료 삭제
- 개인 메모 작성
- 개인 메모 자동 저장

현재 저장 자료와 개인 메모는 브라우저 `localStorage` 기반으로 저장됩니다. 즉, 계정별 서버 DB 저장 기능은 아직 확장 대상이고, 이번 버전에서는 개인 화면의 최소 동작을 제공하는 데 집중했습니다.

### 10. 인증 UI 문구 정리

기존 인증 스크립트에는 깨진 한글 문구가 남아 있었습니다. `auth.js`를 정리하면서 로그인, 회원가입, 오류 메시지, My Archive 링크 문구를 정상 한글로 교체했습니다.

정리된 항목:

- 로그인 모달 제목
- 로그인/회원가입 탭
- 입력 label
- 처리 중 문구
- 로그인 성공 문구
- 로그인 필요 안내
- My Archive 링크

서버 인증 API의 오류 메시지도 정상 한글 문구로 정리했습니다.

예시:

- 이메일 또는 로그인 ID를 3~255자로 입력해 주세요.
- 이름은 1~80자로 입력해 주세요.
- 비밀번호는 4~128자로 입력해 주세요.
- 이미 가입된 이메일입니다.
- 이메일 또는 비밀번호가 맞지 않습니다.

## 검증 내용

이번 작업 후 다음 검증을 진행했습니다.

### 1. JavaScript 문법 검증

```powershell
node --check back\server.js
node --check front\assets\js\common\auth.js
```

결과:

- `back/server.js` 통과
- `front/assets/js/common/auth.js` 통과

### 2. CSS 검증

CSS 전체 파일에 대해 중괄호 균형과 import 경로를 확인했습니다.

결과:

- CSS 24개 파일 검증 통과

### 3. 페이지 응답 검증

다음 URL 응답을 확인했습니다.

- `http://127.0.0.1:8080/`
- `http://127.0.0.1:8080/my-archive`
- `http://127.0.0.1:8080/mypage`
- `http://127.0.0.1:8080/pages/My%20Archive/My%20Archive.html`
- `http://127.0.0.1:8080/pages/war%20overview/war%20overview.html`
- `http://127.0.0.1:8080/pages/Historical%20Sources%20%26%20Documents/Historical%20Sources%20%26%20Documents%20detail.html?id=atlantic-charter`
- `http://127.0.0.1:8080/pages/Weapons%20and%20Equipment/Weapons%20and%20Equipment%20item.html?id=armor%2Ft-34`
- `http://127.0.0.1:8080/assets/css/common/archive_common.css`
- `http://127.0.0.1:8080/assets/css/common/category_refresh.css`
- `http://127.0.0.1:8080/assets/css/common/auth.css`
- `http://127.0.0.1:8080/assets/js/common/auth.js`

결과:

- 주요 페이지와 정적 파일 모두 `200` 응답 확인
- `/api/auth/me`는 비로그인 상태에서 `401` 응답 확인

### 4. Docker 검증

새 라우트를 반영하기 위해 백엔드 컨테이너를 재빌드했습니다.

```powershell
docker compose up -d --build war-archive
```

이후 컨테이너 상태를 확인했습니다.

결과:

- `war-archive` healthy
- `war-archive-mysql` healthy
- `war-archive-history-crawler` running

## version 1.4와의 차이

`version 1.4`는 로그인과 MySQL 기반 계정 관리가 추가된 버전이었습니다. `version 1.5`는 그 위에 데이터 수집/정제/재구성 흐름과 개인 화면을 더 명확히 붙인 버전입니다.

주요 차이:

- `version 1.4`: 로그인, 회원가입, 세션, MySQL 사용자 테이블 중심
- `version 1.5`: 크롤링 구조 재정비와 데이터 변환 흐름 추가
- `version 1.4`: 기본 Mypage 제공
- `version 1.5`: `My Archive` 폴더와 개인 archive 화면 제공
- `version 1.4`: 인증 UI 연결
- `version 1.5`: 인증 UI 문구 정리와 My Archive 링크 적용
- `version 1.4`: Docker/MySQL 실행 기반 구성
- `version 1.5`: 실행 중 컨테이너에 새 라우트 반영 및 페이지 응답 검증
- `version 1.4`: 공통 CSS 기반 존재
- `version 1.5`: 공통 CSS 중복/깨진 코드 제거 및 불필요 CSS 삭제

## 남은 확장 방향

이번 버전에서 최소 기능은 연결했지만, 다음 단계에서 확장할 수 있는 부분이 남아 있습니다.

- 이미지 전문 추출 크롤러 고도화
- 이미지 파일 다운로드 및 중복 이미지 해시 관리
- My Archive 저장 자료를 localStorage가 아니라 서버 DB에 저장
- 저장 자료를 실제 front/data 항목과 자동 연결
- 개인 열람 기록 자동 수집
- 개인 즐겨찾기 버튼을 각 상세 페이지에 배치
- 관리자용 수집 데이터 승인 화면 추가
- reconstructure 결과 미리보기 및 충돌 해결 UI 추가

## 요약

`version 1.5`는 War Archive가 단순 정적 archive에서 자동 수집, 정제, 재구성, 개인 archive 화면으로 확장되기 위한 기반 버전입니다. 크롤링 구조를 분리하고, 프론트 데이터 양식에 맞춘 재구성 흐름을 만들었으며, 세부 페이지 디자인을 정리하고, 개인 사용자가 접근할 수 있는 `My Archive` 화면을 구현했습니다.
