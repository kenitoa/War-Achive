# War Archive - 프로젝트 구조

## 전체 디렉토리 구조

```
War Archive/
│
├── front/                          # 프론트엔드 (NAS WebStation)
│   ├── index.html                  # 메인 페이지
│   ├── assets/
│   │   ├── css/                    # 카테고리별 스타일시트
│   │   ├── icons/                  # 아이콘 파일
│   │   ├── images/                 # 이미지 파일
│   │   └── js/                     # 카테고리별 JavaScript
│   ├── data/                       # 공개 JSON 데이터 (정적)
│   │   ├── search/                 # 검색 인덱스 JSON
│   │   ├── Battlefield Map data/
│   │   ├── biography of people data/
│   │   ├── Historical Sources & Documents data/
│   │   ├── strategy and tactics data/
│   │   ├── Undefine facts data/
│   │   ├── war overview data/
│   │   └── weapons and equipment data/
│   └── pages/                      # 카테고리별 HTML 페이지
│
├── back/                           # 백엔드 API 서버 (Docker)
│   ├── src/
│   │   ├── app.js                  # Express 진입점
│   │   ├── config/                 # 설정 (DB, 환경변수)
│   │   ├── routes/                 # API 라우트
│   │   ├── controllers/            # 요청 처리기
│   │   ├── services/               # 비즈니스 로직
│   │   ├── models/                 # 데이터베이스 모델
│   │   ├── middleware/             # 인증, 에러, 제한
│   │   └── utils/                  # 유틸리티 함수
│   ├── package.json
│   └── Dockerfile
│
├── data/                           # 데이터 저장소 (Docker 볼륨)
│   ├── db/                         # SQL 스키마 파일
│   │   ├── user_database.sql       # 프로필/세션/시도 테이블
│   │   └── user_logindata.sql      # 인증 테이블
│   ├── uploads/                    # 사용자 업로드
│   ├── logs/                       # 애플리케이션 로그
│   ├── cache/                      # 캐시 데이터
│   └── private-json/               # 비공개 JSON (API 전용)
│
├── infra/                          # 인프라 설정 (Docker)
│   ├── docker-compose.yml          # 서비스 오케스트레이션
│   ├── .env                        # 환경 변수
│   ├── nginx/
│   │   └── default.conf            # API 리버스 프록시
│   └── scripts/
│       ├── deploy.sh               # 배포 스크립트
│       ├── backup.sh               # 백업 스크립트
│       └── init-db.sh              # DB 초기화
│
├── backup/                         # 백업 저장소
│   ├── db/                         # DB 덤프 백업
│   ├── uploads/                    # 업로드 파일 백업
│   └── settings/                   # 설정 파일 백업
│
└── docs/                           # 프로젝트 문서
    ├── structure.md                # 이 파일
    ├── api.md                      # API 명세
    ├── backup.md                   # 백업 가이드
    └── deploy.md                   # 배포 가이드
```

## 운영 방식

| 구분 | 호스팅 | 설명 |
|------|--------|------|
| **front/** | NAS WebStation | 정적 파일 직접 서비스 |
| **back/** | Docker 컨테이너 | Express API 서버 |
| **data/** | Docker 볼륨 마운트 | DB, 로그, 업로드 등 |
| **infra/** | Docker Compose | 서비스 오케스트레이션 |
| **backup/** | NAS 로컬 | 자동/수동 백업 저장 |

## 네트워크 흐름

```
[사용자 브라우저]
       │
       ├── 정적 파일 ──→ [NAS WebStation] → front/
       │
       └── API 요청 ───→ [Nginx :8080] → [Backend :3000] → [MySQL :3306]
```
