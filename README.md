# War Archive — 전쟁 아카이브

> 인류 역사에 존재하는 모든 전쟁 기록들을 체계적으로 보관하는 디지털 아카이브 프로젝트

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)]()
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)]()
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)]()
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)]()
[![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)]()
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=flat&logo=mysql&logoColor=white)]()
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)]()
[![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat&logo=nginx&logoColor=white)]()
[![JSON](https://img.shields.io/badge/Data-JSON-292929?style=flat)]()

---

## 목차

- [프로젝트 개요](#프로젝트-개요)
- [아키텍처 구조](#아키텍처-구조)
- [기술 스택](#기술-스택)
- [카테고리별 콘텐츠](#카테고리별-콘텐츠)
- [데이터 스키마](#데이터-스키마)
- [구현된 기능](#구현된-기능)
- [추가 예정 기능](#추가-예정-기능)
- [아쉬운 점 / 개선 필요 사항](#아쉬운-점--개선-필요-사항)
- [폴더 구조](#폴더-구조)
- [실행 방법](#실행-방법)
- [문서](#문서)

---

## 웹 사이트 주소 : https://war-archive.tail498403.ts.net/

---

## 프로젝트 개요

**War Archive**는 고대부터 현대까지의 전쟁 역사를 종합적으로 기록하고 보존하는 **풀스택 웹 애플리케이션**입니다.

- **프론트엔드**: HTML5 + CSS3 + Vanilla JavaScript (프레임워크 미사용)
- **백엔드**: Node.js + Express REST API 서버
- **데이터베이스**: MySQL 8.0 (사용자/인증/세션 관리)
- **인프라**: Docker Compose (MySQL + Backend + Nginx) + Synology NAS WebStation
- **데이터 관리**: 공개 콘텐츠는 JSON 정적 파일, 비공개 데이터는 API 경유
- **언어**: 한국어 (Korean)
- **설립**: 2026년

프론트엔드는 JSON 파일을 `fetch()`로 로드하여 **클라이언트 사이드 렌더링**하고, 백엔드는 JWT 인증 기반의 사용자 관리/비공개 데이터 API를 제공합니다.

---

## 아키텍처 구조

### 전체 데이터 흐름

```
┌──────────────────────────────────────────────────────────────────┐
│                        사용자 브라우저                            │
│                                                                  │
│   index.html ────────────────────────────────────────────────    │
│       │                                                          │
│       ├── 정적 콘텐츠 ──→ [NAS WebStation :443]                   │
│       │   ├── 카테고리 선택 ──→ [카테고리].html (목록 페이지)       │
│       │   │                         │                            │
│       │   │                         ├── fetch() ──→ index.json   │
│       │   │                         │                            │
│       │   │                         └── 항목 클릭 ──→ detail.html │
│       │   │                                  └── fetch()         │
│       │   │                               ──→ [항목명].json       │
│       │   │                                                      │
│       │   ├── 연대기 ──→ war overview + battlefield 병합          │
│       │   └── 검색 ──→ 전체 index.json 로드 → 클라이언트 검색      │
│       │                                                          │
│       └── API 요청 ──→ [Nginx :8080] ──→ [Backend :3000]         │
│           ├── /api/auth/* ──→ 로그인/회원가입/로그아웃             │
│           ├── /api/users/* ──→ 프로필 조회/수정                   │
│           └── /api/data/* ──→ 비공개 데이터 CRUD                  │
│                                    │                             │
│                              [MySQL :3306]                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3계층 아키텍처 (Front / Back / Infra)

```
front/                              ← 프론트엔드 (NAS WebStation)
├── pages/            ← HTML 페이지
│   ├── auth/                      ← 로그인/회원가입
│   ├── info/                      ← 프로젝트 소개
│   └── [카테고리]/
│       ├── [카테고리].html        ← 목록 페이지
│       └── [카테고리] detail.html ← 상세 페이지
├── assets/css/       ← 카테고리별 CSS
├── assets/js/        ← 카테고리별 JavaScript
└── data/             ← JSON 데이터 (공개)

back/                               ← 백엔드 API (Docker)
└── src/
    ├── app.js                     ← Express 진입점
    ├── routes/                    ← /api/auth, /api/users, /api/data
    ├── controllers/               ← 요청 처리
    ├── services/                  ← 비즈니스 로직
    ├── models/                    ← User, Profile, Session
    ├── middleware/                 ← JWT 인증, Rate Limit, 에러 핸들링
    └── utils/                     ← 해싱, 토큰, 로거, 검증

infra/                              ← Docker Compose 인프라
├── docker-compose.yml             ← MySQL + Backend + Nginx
├── nginx/default.conf             ← API 리버스 프록시
└── scripts/                       ← 배포/백업 자동화
```

---

## 기술 스택

| 계층 | 기술 | 설명 |
|------|------|------|
| **프론트엔드** | HTML5 + CSS3 + Vanilla JS | 프레임워크 미사용 정적 사이트 |
| **백엔드** | Node.js 20 + Express | REST API 서버 (Docker 컨테이너) |
| **데이터베이스** | MySQL 8.0 | 사용자/인증/세션/프로필 |
| **리버스 프록시** | Nginx Alpine | API 프록시 + 보안 헤더 |
| **컨테이너** | Docker Compose | 3-서비스 오케스트레이션 |
| **호스팅** | Synology NAS (DSM 7.x) | WebStation + Docker |
| **네트워크** | Tailscale | VPN 기반 외부 접속 |

### 보안 설정

- **Docker**: read-only 파일시스템, no-new-privileges, 메모리 제한 (128~512MB)
- **Nginx**: HSTS, X-Frame-Options DENY, CSP, 위험 HTTP 메서드 차단
- **Backend**: Helmet, CORS 화이트리스트, Rate Limiting, JWT 인증, bcrypt 해싱
- **MySQL**: Docker 내부 네트워크 전용, healthcheck 기반 의존성

### 페이지 구성 패턴 (공통)

모든 카테고리가 동일한 UI 패턴을 따릅니다:

```
┌─ Header (고정) ─────────────────────────────┐
│ Logo  │  아카이브 │ 연대기 │ 검색 │ 프로젝트│
├─────────────────────────────────────────────┤
│  Hero Section (타이틀 + 설명)               │
├─────────────────────────────────────────────┤
│  Statistics Bar (동적 카운트)               │
├─────────────────────────────────────────────┤
│ Filter Bar (시대 탭 + 지역 드롭다운 + 검색) │
├─────────────────────────────────────────────┤
│  Content Grid / Table (카드 목록)           │
├─────────────────────────────────────────────┤
│  Pagination                                 │
├─────────────────────────────────────────────┤
│  Footer                                     │
└─────────────────────────────────────────────┘
```

---

## 카테고리별 콘텐츠

| 카테고리 | 항목 수 | 설명 |
|---------|---------|------|
| **전쟁 개요** (War Overview) | 18건 | 고대~현대 주요 전쟁의 원인·경과·결과 종합 정리 |
| **인물 열전** (Biography) | 22명 | 전쟁의 흐름을 결정지은 지휘관·전략가·영웅의 이야기 |
| **전략 & 전술** (Strategy & Tactics) | 25건 | 팔랑크스부터 네트워크 중심전까지 전술 발전사 |
| **사료 & 문서** (Historical Documents) | 17건 | 조약문, 선전포고문, 편지, 일기 등 1차 사료 |
| **전장 지도** (Battlefield Map) | 11건 | 주요 전투의 지형·진군 경로·방어선 시각화 |
| **무기 & 장비** (Weapons & Equipment) | 9개 분류 | 냉병기부터 핵무기까지 무기 체계 분석 |
| **미분류 기록** (Undefined Facts) | 18건 | 구전 사료, 논쟁 사료, 전설, 기밀 해제 문서 등 |

### 시대 분류 체계
- **고대** (Ancient) — 그리스-페르시아 전쟁, 포에니 전쟁 등
- **중세** (Medieval) — 십자군 전쟁, 백년전쟁 등
- **근세** (Early Modern) — 임진왜란, 30년 전쟁 등
- **근대** (Modern) — 나폴레옹 전쟁, 크림 전쟁, 남북전쟁 등
- **세계대전** (World Wars) — 제1·2차 세계대전
- **현대** (Contemporary) — 한국전쟁, 베트남전쟁, 걸프전 등

---

## 데이터 스키마

### 전쟁 개요 (War Overview)
```json
{
  "id": "ww2",
  "name": "제2차 세계대전",
  "era": "worldwar",
  "region": "global",
  "period": "1939 – 1945",
  "summary": "...",
  "belligerents": "연합국 vs 추축국",
  "location": "전 세계",
  "result": "연합국 승리",
  "resultType": "victory",
  "tags": ["노르망디", "스탈린그라드"],
  "detail": {
    "background": "...",
    "causes": [...],
    "phases": [{ "title": "", "period": "", "description": "" }],
    "majorBattles": [{ "name": "", "date": "", "result": "" }]
  }
}
```

### 인물 열전 (Biography)
```json
{
  "id": "napoleon",
  "name": "나폴레옹 보나파르트",
  "title": "프랑스 제1제국 황제",
  "role": "commander",
  "era": "modern",
  "nationality": "프랑스",
  "lifespan": "1769 – 1821",
  "portrait": "이미지 URL",
  "detail": {
    "earlyLife": "...",
    "achievements": [...],
    "warsBattles": [...],
    "legacy": "..."
  }
}
```

### 전장 지도 (Battlefield Map)
```json
{
  "id": "battle-of-midway",
  "title": "Battle of Midway",
  "titleKr": "미드웨이 해전",
  "era": "worldwar",
  "theater": "pacific",
  "commanders": [...],
  "forces": {...},
  "casualties": {...},
  "terrain": "...",
  "strategicSignificance": "...",
  "images": [{ "url": "", "caption": "", "source": "" }]
}
```

### 무기 & 장비 (Weapons & Equipment)
```
weapons and equipment data/
├── aircraft/      ← 항공기 (전투기, 폭격기)
├── armor/         ← 기갑 (전차, 장갑차)
├── artillery/     ← 포병 (야포, 박격포)
├── defense/       ← 방어 시설 (요새, 벙커)
├── firearms/      ← 화기 (소총, 기관총)
├── melee/         ← 냉병기 (검, 창, 도끼)
├── naval/         ← 해군 (전함, 잠수함)
├── ranged/        ← 원거리 (활, 석궁)
└── index.json     ← 카테고리별 통합 인덱스
```

---

## 구현된 기능

### 핵심 기능
- **7개 카테고리 아카이브 시스템** — 전쟁 개요, 인물, 전략, 사료, 전장 지도, 무기, 미분류 기록
- **JSON 기반 동적 콘텐츠 렌더링** — `fetch()` + 클라이언트 사이드 렌더링
- **목록 → 상세 2단계 네비게이션** — 각 카테고리에 목록/상세 페이지 분리
- **다중 필터 시스템** — 시대별 탭, 지역 드롭다운, 텍스트 검색
- **그리드/테이블 뷰 전환** — 사용자 선호에 따른 뷰 모드 선택
- **페이지네이션** — 대규모 목록의 페이지 나누기 (9개 항목/페이지)

### 메인 페이지 특화
- **통계 카운터 애니메이션** — index.json 기반 실시간 카운트 (전쟁 수, 문서 수, 인물 수, 전투 수)
- **전쟁 연대기 (Timeline)** — 전쟁 개요 + 전장 지도 데이터 병합 → 연도순 정렬 → 동적 타임라인 생성
- **통합 검색** — 모든 카테고리의 index.json을 로드하여 클라이언트 사이드 전체 검색
- **군사 명언 시스템** — 랜덤 군사 명언 표시

### UI / UX
- **다크 테마 디자인** — 골드 악센트(#c9a84c) + 다크 배경(#0a0a0a) 기반
- **스크롤 기반 Fade-in 애니메이션** — IntersectionObserver 활용
- **반응형 디자인** — 모바일 메뉴 토글 지원
- **고정 헤더 + 블러 배경** — `backdrop-filter: blur(12px)`

### 개발 도구
- **`generate-index.js`** — Node.js 기반 index.json 자동 생성 스크립트
  - `node generate-index.js` : 전체 인덱스 1회 생성
  - `node generate-index.js --watch` : 파일 변경 실시간 감지 → 자동 갱신
  - 일반 카테고리 (flat) + 무기 카테고리 (중첩) 각각 처리

### 프로젝트 페이지
- **프로젝트 소개** (information.html) — 미션, 비전, 프로젝트 철학 설명
- **기여 가이드** (contribution.html) — 오픈소스 참여 방법 안내
- **개발자 정보** (developer information.html) — 개발자 포트폴리오 & 연락처

---

## 추가 예정 기능

| 우선순위 | 기능 | 설명 |
|---------|------|------|
| 높음 | **전장 지도 시각화** | Leaflet/Mapbox 기반 인터랙티브 전장 지도 렌더링 |
| 높음 | **무기 데이터 확충** | 각 무기 카테고리(aircraft, armor 등) 내 JSON 데이터 추가 |
| 중간 | **검색 고도화** | 초성 검색, 자동완성, 카테고리별 필터 검색 |
| 중간 | **다국어 지원** | 영한 병행 표기, 언어 전환 기능 |
| 중간 | **북마크 / 즐겨찾기** | LocalStorage 기반 사용자 관심 항목 저장 |
| 낮음 | **다크/라이트 모드 전환** | 현재 다크 모드 고정 → 토글 지원 |
| 낮음 | **PDF 내보내기** | 개별 문서를 PDF로 저장하는 기능 |
| 낮음 | **공유 기능** | SNS 공유 링크 생성 |

---

## 아쉬운 점 / 개선 필요 사항

### 아키텍처 관련
- ~~**백엔드 부재**~~ — Express + MySQL 백엔드 구축 완료 (JWT 인증, 사용자 관리, 비공개 데이터 API)
- **SEO 취약** — 클라이언트 사이드 렌더링 방식으로 검색 엔진 크롤링에 불리
- **URL 라우팅 미비** — 해시 기반 라우팅이나 SPA 방식이 아닌 직접 HTML 파일 이동 방식

### 코드 구조 관련
- **컴포넌트 재사용 부족** — Header, Footer 등 공통 UI가 각 HTML 파일에 중복 작성됨
- **CSS 중복** — 카테고리별 CSS 파일에 공통 스타일이 반복적으로 정의됨
- **에러 처리 최소화** — `fetch()` 실패 시 사용자 피드백이 제한적
- **빌드 시스템 부재** — 번들링, 압축, 코드 분할 등의 최적화 파이프라인 없음

### 콘텐츠 관련
- **무기 & 장비 데이터 미완성** — 카테고리 구조는 있으나 개별 무기 JSON 데이터가 부족
- **전장 지도 실제 지도 미구현** — 텍스트 기반 설명만 존재, 인터랙티브 지도 렌더링 미구현
- **미분류 기록 카테고리 정리 필요** — "Undefine Facts" → "Unverified Records" 등 명칭 개선 여지

---

## 폴더 구조

> 전체 구조는 [docs/structure.md](docs/structure.md) 참조

```
War Archive/
├── front/                  ← 프론트엔드 (NAS WebStation)
│   ├── index.html
│   ├── assets/css/         ← 카테고리별 스타일
│   ├── assets/js/          ← 카테고리별 로직
│   ├── data/               ← 공개 JSON 데이터
│   └── pages/              ← HTML 페이지
│
├── back/                   ← 백엔드 API (Docker)
│   ├── Dockerfile
│   └── src/                ← Express 서버 코드
│
├── data/                   ← 데이터 저장소 (Docker 볼륨)
│   ├── db/                 ← SQL 초기화 스크립트
│   ├── logs/               ← 앱 로그
│   ├── uploads/            ← 업로드 파일
│   ├── cache/              ← 캐시
│   └── private-json/       ← 비공개 JSON
│
├── infra/                  ← Docker Compose 인프라
│   ├── docker-compose.yml
│   ├── .env
│   ├── nginx/              ← Nginx 설정
│   └── scripts/            ← 배포/백업 스크립트
│
├── backup/                 ← 백업 저장소
│
└── docs/                   ← 프로젝트 문서
    ├── running.md          ← 실행 가이드 및 접속 링크
    ├── structure.md        ← 프로젝트 구조 상세
    ├── deploy.md           ← 배포 가이드
    ├── api.md              ← API 명세
    └── backup.md           ← 백업/복원 가이드
```

---

## 실행 방법

### 프로덕션 (Synology NAS)

```bash
# NAS SSH 접속 후
cd "/volume4/homes/dongmin703/Laptop/Github_Project/War Achive/infra"

# 환경 변수 설정
printf 'DB_ROOT_PASSWORD=...\n...' > .env

# 빌드 및 실행
sudo docker-compose build backend
sudo docker-compose up -d

# 상태 확인
sudo docker-compose ps
```

**접속 URL:**
- 프론트엔드: https://war-archive.tail498403.ts.net/

### 로컬 개발

```bash
# 1. 리포지토리 클론
git clone https://github.com/[username]/War-Archive.git

# 2. 로컬 서버 실행 (프론트엔드만)
cd War-Archive/front
npx serve .
# http://localhost:3000/

# 3. 백엔드 포함 전체 실행 (Docker 필요)
cd ../infra
docker-compose up -d
```

---

## 프로젝트 현황 요약

```
전체 콘텐츠       ██████████████████░░  ~120건+ 데이터 파일
전쟁 개요         ████████████████████  18/18 완료
인물 열전         ████████████████████  22/22 완료
전략 & 전술       ████████████████████  25/25 완료
사료 & 문서       ████████████████████  17/17 완료
전장 지도         ████████████████░░░░  11건 (지도 시각화 미구현)
무기 & 장비       ████████░░░░░░░░░░░░  구조만 완성, 데이터 확충 필요
미분류 기록       ████████████████████  18/18 완료
백엔드 API        ████████████████████  인증/사용자/데이터 API 완료
인프라             ████████████████████  Docker Compose 배포 완료
```

---

<p align="center">
  <sub>Built for preserving history — War Archive Project, 2026.04.13</sub>
</p>
