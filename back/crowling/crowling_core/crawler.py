from __future__ import annotations

import random
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .extractors import RawPage, extract_images, extract_media, extract_text, first_text
from .settings import CrawlerSettings, TargetSite, load_target_sites, normalize_text, save_target_sites
from .storage import CrawlingStore


@dataclass(frozen=True)
class CrawlResult:
    raw_pages: int
    images: int
    media: int
    texts: int
    failed: list[dict[str, str]]


class TotalCrawler:
    def __init__(self, settings: CrawlerSettings | None = None, store: CrawlingStore | None = None) -> None:
        self.settings = settings or CrawlerSettings()
        self.store = store or CrawlingStore(self.settings.database_path)

    def init(self) -> None:
        self.store.init_db()
        if not self.settings.target_sites_path.exists():
            save_target_sites(load_target_sites(None), self.settings.target_sites_path)
        self.settings.output_path.mkdir(parents=True, exist_ok=True)

    def run(self, limit: int | None = None, refine: bool = True) -> CrawlResult:
        self.init()
        page_limit = max(1, limit or self.settings.page_limit)
        existing = self.store.existing_page_urls()
        saved_pages: list[RawPage] = []
        failed: list[dict[str, str]] = []
        sites = load_target_sites(self.settings.target_sites_path)
        candidates = self.collect_all_candidates(sites, page_limit * 5)

        for site, url in candidates:
            if len(saved_pages) >= page_limit:
                break
            if url in existing:
                continue
            try:
                page = self.fetch_raw_page(site, url)
                self.store.save_raw_page(page)
                saved_pages.append(page)
                existing.add(url)
            except Exception as exc:
                failed.append({"site": site.name, "url": url, "error": str(exc)[:200]})

        images = media = texts = 0
        if refine:
            images = self.refine_images(saved_pages)
            media = self.refine_media(saved_pages)
            texts = self.refine_text(saved_pages)
        return CrawlResult(raw_pages=len(saved_pages), images=images, media=media, texts=texts, failed=failed)

    def refine_images(self, pages: list[RawPage] | None = None) -> int:
        pages = pages or self.store.list_raw_pages()
        return self.store.save_images([asset for page in pages for asset in extract_images(page)])

    def refine_media(self, pages: list[RawPage] | None = None) -> int:
        pages = pages or self.store.list_raw_pages()
        return self.store.save_media([asset for page in pages for asset in extract_media(page)])

    def refine_text(self, pages: list[RawPage] | None = None) -> int:
        pages = pages or self.store.list_raw_pages()
        assets = []
        for page in pages:
            text = extract_text(page)
            if text.content_text:
                assets.append(text)
        return self.store.save_texts(assets)

    def collect_all_candidates(self, sites: list[TargetSite], limit: int) -> list[tuple[TargetSite, str]]:
        results: list[tuple[TargetSite, str]] = []
        for site in sites:
            for url in self.collect_site_candidates(site, max(20, limit // max(len(sites), 1))):
                results.append((site, url))
        random.shuffle(results)
        return results[:limit]

    def collect_site_candidates(self, site: TargetSite, limit: int = 200) -> list[str]:
        candidates: dict[str, None] = {}
        visited = set()
        queue = list(site.feeds)
        while queue and len(candidates) < limit:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            try:
                html = self.get(current).text
            except requests.RequestException:
                continue
            soup = BeautifulSoup(html, "html.parser")
            for node in soup.find_all(["loc", "link"]):
                href = node.get("href") or node.get_text(" ", strip=True)
                self.add_candidate(site, href, candidates, queue, visited)
            for node in soup.find_all("a", href=True):
                self.add_candidate(site, node["href"], candidates, queue, visited)
        return list(candidates.keys())[:limit]

    def add_candidate(
        self,
        site: TargetSite,
        href: str,
        candidates: dict[str, None],
        queue: list[str],
        visited: set[str],
    ) -> None:
        absolute_url = normalize_page_url(site.base_url, href)
        if not absolute_url or not same_host(site.base_url, absolute_url):
            return
        parsed = urlparse(absolute_url)
        path_query = f"{parsed.path}?{parsed.query}" if parsed.query else parsed.path
        if any(re.search(pattern, path_query) for pattern in site.content_patterns):
            candidates.setdefault(absolute_url, None)
            return
        if any(re.search(pattern, path_query) for pattern in site.listing_patterns) and absolute_url not in visited:
            if len(queue) < 50:
                queue.append(absolute_url)

    def fetch_raw_page(self, site: TargetSite, url: str) -> RawPage:
        response = self.get(url)
        content_type = response.headers.get("content-type", "")
        if "html" not in content_type.lower() and response.text.lstrip()[:1] != "<":
            raise ValueError(f"not an html page: {content_type}")
        soup = BeautifulSoup(response.text, "html.parser")
        title = first_text(soup, ["meta[property='og:title']", "h1", "title"]) or "Untitled"
        return RawPage(
            source_name=site.name,
            source_url=url,
            final_url=response.url,
            title=normalize_text(title),
            html=response.text,
            content_type=content_type or "text/html",
            status_code=response.status_code,
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )

    def get(self, url: str) -> requests.Response:
        response = requests.get(
            url,
            timeout=self.settings.request_timeout,
            headers={
                "User-Agent": self.settings.user_agent,
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            },
        )
        response.raise_for_status()
        return response


def normalize_page_url(base_url: str, href: str | None) -> str:
    href = normalize_text(href or "")
    if not href or href.startswith(("mailto:", "javascript:", "#")):
        return ""
    parsed = urlparse(urljoin(base_url, href))
    if parsed.scheme not in {"http", "https"}:
        return ""
    if is_static_asset(parsed.path):
        return ""
    return parsed._replace(fragment="").geturl()


def same_host(base_url: str, url: str) -> bool:
    return urlparse(url).netloc.endswith(urlparse(base_url).netloc)


def is_static_asset(path: str) -> bool:
    return PathLike(path).suffix in {".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".zip"}


class PathLike(str):
    @property
    def suffix(self) -> str:
        index = self.rfind(".")
        return self[index:].lower() if index >= 0 else ""
