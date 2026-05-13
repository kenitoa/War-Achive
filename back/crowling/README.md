# Crowling

War Archive의 역사 자료 수집을 위한 독립 실행용 크롤링 모듈입니다. 대상 사이트에서 후보 기사 URL을 찾고, 본문을 추출해 SQLite에 저장합니다.

## 구성

- `crawler.py`: 후보 URL 수집, 기사 본문 추출, 크롤링 실행 로직
- `history_sources.py`: 역사 전문 기본 대상 사이트 카탈로그
- `settings.py`: 환경 변수, 사이트 설정 JSON 처리
- `storage.py`: SQLite 초기화와 기사/문장 저장소
- `cli.py`: 바로 실행 가능한 명령줄 인터페이스
- `sql/schema.sql`: 저장 테이블 구조
- `.env.example`: 환경 변수 예시
- `requirements.txt`: 최소 Python 의존성

## 빠른 시작

```powershell
Set-Location C:\Users\abc20\Desktop\만든 것들\War-Achive\back
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\crowling\requirements.txt
.\.venv\Scripts\python.exe -m crowling.cli init
.\.venv\Scripts\python.exe -m crowling.cli run --limit 20
```

다른 프로젝트로 옮길 때도 `crowling` 폴더가 들어 있는 상위 폴더에서 같은 명령을 실행하면 됩니다.

## 환경 변수

```env
CRAWLING_DATABASE_PATH=./data/articles.sqlite3
CRAWLING_TARGET_SITES_PATH=./data/target-sites.json
CRAWLING_FRONT_DATA_PATH=../front/data
CRAWLING_ARTICLE_LIMIT=20
CRAWLING_HOURLY_LIMIT=50
CRAWLING_DAEMON_INTERVAL_SECONDS=300
CRAWLING_RECENT_ARTICLE_DAYS=7
CRAWLING_REQUEST_TIMEOUT=15
CRAWLING_USER_AGENT=Mozilla/5.0 War-Archive-History-Crawler/1.0
```

## NAS 상시 실행

```powershell
.\.venv\Scripts\python.exe -m crowling.cli daemon --hourly-limit 50 --interval 300
```

`daemon`은 한 시간에 저장되는 전체 기사 수를 `50`개로 제한합니다. 제한 상태는 DB 폴더의 `crawler-rate-limit.json`에 저장되므로 프로세스가 재시작되어도 같은 시간 창의 상한을 유지합니다.

크롤링된 기사는 SQLite에 먼저 저장되고, 아직 변환되지 않은 기사만 `front/data` 아래의 카테고리 JSON 파일로 export됩니다. 수동 변환만 실행할 때는 아래 명령을 사용합니다.

```powershell
.\.venv\Scripts\python.exe -m crowling.cli export --limit 50
```

## 대상 사이트 형식

`python -m crowling.cli init`을 실행하면 `CRAWLING_TARGET_SITES_PATH` 위치에 기본 대상 사이트 JSON이 생성됩니다. 새 사이트를 붙일 때는 아래 형식을 맞추면 됩니다.

```json
[
  {
    "name": "사이트 이름",
    "base_url": "https://example.com",
    "source_type": "journal-magazine",
    "language": "ko",
    "topics": ["history", "archive"],
    "feeds": ["https://example.com/news"],
    "article_patterns": ["/news/article/\\d+"],
    "listing_patterns": ["/news", "/archive"]
  }
]
```

`feeds`에는 RSS, sitemap, 기사 목록 페이지를 넣을 수 있습니다. `article_patterns`는 해당 사이트 안에서 기사 URL만 통과시키는 정규식입니다. `listing_patterns`는 기사 목록, 주제, 아카이브 페이지를 따라가 후보 URL을 더 찾기 위한 정규식입니다.

## 다른 코드에 붙이는 방법

```python
from crowling import HistoryCrawler, CrawlerSettings
from pathlib import Path

settings = CrawlerSettings(
    database_path=Path("./data/articles.sqlite3"),
    target_sites_path=Path("./data/target-sites.json"),
    article_limit=20,
)
result = HistoryCrawler(settings).run()
print(result)
```

`run` 명령은 크롤링 후 같은 수만큼 `front/data` JSON 변환을 시도합니다. `daemon`은 이 흐름을 계속 반복합니다.

## 기본 역사 수집 대상

초기 카탈로그는 역사 저널, 역사 전문 매거진, 박물관, 공공 역사 아카이브, 전장/전쟁사 전문 기관을 중심으로 구성합니다.

- Smithsonian Magazine - History
- JSTOR Daily - History
- History Today
- HistoryExtra
- World History Encyclopedia
- The National WWII Museum
- American Battlefield Trust
- Ancient Origins
- Lapham's Quarterly - History
- The Collector - History
- 한국역사연구회
- 우리역사넷

이 목록은 닫힌 전체 목록이 아니라 시작점입니다. 새 역사 저널, 채널, 기사 사이트는 `target-sites.json`에 같은 형식으로 추가합니다.

## 포함 범위

- 기본 대상 사이트 목록
- 대상 사이트 JSON 로드/저장
- RSS, sitemap, 목록/아카이브 페이지 기반 후보 URL 수집
- 최근 기사 우선 필터링
- 기사 본문 추출과 문장 분리
- 중복 URL 제외
- SQLite `articles`, `sentences` 저장

티스토리 임시저장, 이미지 생성, FastAPI 화면, 자동 업로드 스케줄러는 크롤러 재사용성을 위해 포함하지 않았습니다.
