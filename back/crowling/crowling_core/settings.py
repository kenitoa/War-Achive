from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


DEFAULT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class TargetSite:
    name: str
    base_url: str
    feeds: list[str]
    content_patterns: list[str]
    listing_patterns: list[str]
    source_type: str = ""
    language: str = ""
    topics: list[str] | None = None


@dataclass(frozen=True)
class CrawlerSettings:
    database_path: Path = Path(os.getenv("CRAWLING_DATABASE_PATH", DEFAULT_ROOT / "data" / "raw-crawling.sqlite3"))
    target_sites_path: Path = Path(os.getenv("CRAWLING_TARGET_SITES_PATH", DEFAULT_ROOT / "data" / "target-sites.json"))
    output_path: Path = Path(os.getenv("CRAWLING_OUTPUT_PATH", DEFAULT_ROOT / "data" / "refined"))
    page_limit: int = max(1, int(os.getenv("CRAWLING_PAGE_LIMIT", "20") or "20"))
    request_timeout: int = max(1, int(os.getenv("CRAWLING_REQUEST_TIMEOUT", "15") or "15"))
    recent_days: int = max(1, int(os.getenv("CRAWLING_RECENT_DAYS", "30") or "30"))
    user_agent: str = os.getenv("CRAWLING_USER_AGENT", "Mozilla/5.0 War-Archive-Crawler/2.0")

    def __post_init__(self) -> None:
        object.__setattr__(self, "database_path", Path(self.database_path))
        object.__setattr__(self, "target_sites_path", Path(self.target_sites_path))
        object.__setattr__(self, "output_path", Path(self.output_path))


DEFAULT_TARGET_SITES = [
    TargetSite(
        name="Smithsonian Magazine - History",
        base_url="https://www.smithsonianmag.com",
        source_type="magazine",
        language="en",
        topics=["history", "archaeology", "culture"],
        feeds=[
            "https://www.smithsonianmag.com/category/history/",
            "https://www.smithsonianmag.com/category/archaeology/",
            "https://www.smithsonianmag.com/rss/history-archaeology/",
        ],
        content_patterns=[r"/history/[^/]+/", r"/smart-news/[^/]+/", r"/science-nature/[^/]+/"],
        listing_patterns=[r"/category/history/", r"/category/archaeology/"],
    ),
    TargetSite(
        name="World History Encyclopedia",
        base_url="https://www.worldhistory.org",
        source_type="encyclopedia",
        language="en",
        topics=["ancient-history", "civilization"],
        feeds=["https://www.worldhistory.org/", "https://www.worldhistory.org/article/"],
        content_patterns=[r"/article/\d+/[^/]+/", r"/trans/[^/]+/"],
        listing_patterns=[r"/article/", r"/trans/"],
    ),
    TargetSite(
        name="The National WWII Museum",
        base_url="https://www.nationalww2museum.org",
        source_type="museum",
        language="en",
        topics=["world-war-ii", "museum"],
        feeds=["https://www.nationalww2museum.org/war/articles"],
        content_patterns=[r"/war/articles/[^/]+"],
        listing_patterns=[r"/war/articles"],
    ),
]


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_site(value: dict[str, Any]) -> TargetSite | None:
    name = normalize_text(str(value.get("name", "")))
    base_url = normalize_text(str(value.get("base_url", ""))).rstrip("/")
    feeds = [normalize_text(str(item)) for item in value.get("feeds", []) if normalize_text(str(item))]
    content_patterns = [
        normalize_text(str(item))
        for item in value.get("content_patterns", value.get("article_patterns", []))
        if normalize_text(str(item))
    ]
    listing_patterns = [
        normalize_text(str(item))
        for item in value.get("listing_patterns", [])
        if normalize_text(str(item))
    ]
    if not name or not base_url or not feeds or not content_patterns:
        return None
    if urlparse(base_url).scheme not in {"http", "https"}:
        return None
    try:
        for pattern in [*content_patterns, *listing_patterns]:
            re.compile(pattern)
    except re.error:
        return None
    return TargetSite(
        name=name,
        base_url=base_url,
        feeds=feeds,
        content_patterns=content_patterns,
        listing_patterns=listing_patterns,
        source_type=normalize_text(str(value.get("source_type", ""))),
        language=normalize_text(str(value.get("language", ""))),
        topics=[normalize_text(str(item)) for item in value.get("topics", []) if normalize_text(str(item))],
    )


def load_target_sites(path: Path | None = None) -> list[TargetSite]:
    target_path = path or CrawlerSettings().target_sites_path
    if not target_path.exists():
        return DEFAULT_TARGET_SITES
    try:
        data = json.loads(target_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_TARGET_SITES
    if not isinstance(data, list):
        return DEFAULT_TARGET_SITES
    sites = [site for item in data if isinstance(item, dict) for site in [normalize_site(item)] if site]
    return sites or DEFAULT_TARGET_SITES


def save_target_sites(sites: list[TargetSite], path: Path | None = None) -> None:
    target_path = path or CrawlerSettings().target_sites_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps([asdict(site) for site in sites], ensure_ascii=False, indent=2), encoding="utf-8")
