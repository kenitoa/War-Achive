from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .history_sources import HISTORY_TARGET_SITES

DEFAULT_TARGET_SITES: list[dict[str, Any]] = HISTORY_TARGET_SITES


@dataclass(frozen=True)
class CrawlerSettings:
    database_path: Path = Path(os.getenv("CRAWLING_DATABASE_PATH", "./data/articles.sqlite3"))
    target_sites_path: Path = Path(os.getenv("CRAWLING_TARGET_SITES_PATH", "./data/target-sites.json"))
    front_data_path: Path = Path(os.getenv("CRAWLING_FRONT_DATA_PATH", "../front/data"))
    article_limit: int = max(1, int(os.getenv("CRAWLING_ARTICLE_LIMIT", "20") or "20"))
    hourly_limit: int = max(1, int(os.getenv("CRAWLING_HOURLY_LIMIT", "50") or "50"))
    daemon_interval_seconds: int = max(60, int(os.getenv("CRAWLING_DAEMON_INTERVAL_SECONDS", "300") or "300"))
    recent_article_days: int = max(1, int(os.getenv("CRAWLING_RECENT_ARTICLE_DAYS", "7") or "7"))
    request_timeout: int = max(1, int(os.getenv("CRAWLING_REQUEST_TIMEOUT", "15") or "15"))
    user_agent: str = os.getenv("CRAWLING_USER_AGENT", "Mozilla/5.0 War-Archive-History-Crawler/1.0")

    def __post_init__(self) -> None:
        object.__setattr__(self, "database_path", Path(self.database_path))
        object.__setattr__(self, "target_sites_path", Path(self.target_sites_path))
        object.__setattr__(self, "front_data_path", Path(self.front_data_path))


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalized_site(site: dict[str, Any]) -> dict[str, Any] | None:
    name = str(site.get("name", "")).strip()
    base_url = str(site.get("base_url", "")).strip().rstrip("/")
    feeds = [str(feed).strip() for feed in site.get("feeds", []) if str(feed).strip()]
    patterns = [str(pattern).strip() for pattern in site.get("article_patterns", []) if str(pattern).strip()]
    listing_patterns = [str(pattern).strip() for pattern in site.get("listing_patterns", []) if str(pattern).strip()]
    if not name or not base_url or not feeds or not patterns:
        return None
    if urlparse(base_url).scheme not in {"http", "https"}:
        return None
    try:
        for pattern in [*patterns, *listing_patterns]:
            re.compile(pattern)
    except re.error:
        return None
    return {
        "name": name,
        "base_url": base_url,
        "feeds": feeds,
        "article_patterns": patterns,
        "listing_patterns": listing_patterns,
        "source_type": str(site.get("source_type", "")).strip(),
        "language": str(site.get("language", "")).strip(),
        "topics": [str(topic).strip() for topic in site.get("topics", []) if str(topic).strip()],
    }


def load_target_sites(path: Path | None = None) -> list[dict[str, Any]]:
    target_path = path or CrawlerSettings().target_sites_path
    if not target_path.exists():
        return DEFAULT_TARGET_SITES
    try:
        data = json.loads(target_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_TARGET_SITES
    if not isinstance(data, list):
        return DEFAULT_TARGET_SITES
    sites = [site for item in data if isinstance(item, dict) for site in [normalized_site(item)] if site]
    return sites or DEFAULT_TARGET_SITES


def save_target_sites(sites: list[dict[str, Any]], path: Path | None = None) -> None:
    target_path = path or CrawlerSettings().target_sites_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    normalized_sites = [site for site in (normalized_site(item) for item in sites) if site]
    target_path.write_text(json.dumps(normalized_sites, ensure_ascii=False, indent=2), encoding="utf-8")
