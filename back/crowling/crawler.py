from __future__ import annotations

import random
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import escape
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .settings import CrawlerSettings, load_target_sites, normalize_text
from .storage import ArticleStore


class CrawlError(Exception):
    pass


class AutoPilotCrawler:
    def __init__(self, settings: CrawlerSettings | None = None, store: ArticleStore | None = None) -> None:
        self.settings = settings or CrawlerSettings()
        self.store = store or ArticleStore(self.settings.database_path)

    def run(self, per_site: int | None = None, total_limit: int | None = None) -> dict[str, Any]:
        self.store.init_db()
        limit = total_limit or self.settings.article_limit
        used_urls = self.store.existing_urls()
        saved: list[dict[str, Any]] = []
        failed: list[dict[str, str]] = []
        sites = load_target_sites(self.settings.target_sites_path)
        site_limit = per_site or limit
        candidate_limit = max(40, limit * 3)
        max_attempts = max(limit * 5, len(sites) * 10)
        attempts = 0
        site_candidates = {site["name"]: self.collect_site_candidates(site, limit=candidate_limit) for site in sites}
        site_offsets = {site["name"]: 0 for site in sites}
        site_saved_counts = {site["name"]: 0 for site in sites}

        while len(saved) < limit and attempts < max_attempts:
            made_progress = False
            for site in sites:
                site_name = site["name"]
                if len(saved) >= limit:
                    break
                if site_saved_counts[site_name] >= site_limit:
                    continue

                candidates = site_candidates[site_name]
                while site_offsets[site_name] < len(candidates):
                    url = candidates[site_offsets[site_name]]
                    site_offsets[site_name] += 1
                    if url in used_urls:
                        continue
                    attempts += 1
                    try:
                        article = self.extract_article(url)
                        article_id = self.store.save_article(
                            site_name,
                            url,
                            **article,
                            source_type=site.get("source_type", ""),
                            source_language=site.get("language", ""),
                        )
                        saved.append({"id": article_id, "site": site_name, "title": article["title"], "url": url})
                        used_urls.add(url)
                        site_saved_counts[site_name] += 1
                        made_progress = True
                        break
                    except Exception as exc:
                        failed.append({"site": site_name, "url": url, "error": str(exc)[:180]})
                        continue

            if not made_progress:
                break

        return {"saved": saved, "failed": failed}

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

    def extract_article(self, url: str) -> dict[str, Any]:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise CrawlError("http 또는 https 주소만 사용할 수 있습니다.")

        response = self.get(url)
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "iframe"]):
            tag.decompose()

        title = first_text(soup, ["meta[property='og:title']", "h1", "title"]) or "제목 없음"
        article_node = first_node(
            soup,
            [
                "article",
                ".article_view",
                ".article-body",
                ".article_body",
                ".news_body",
                "#articleBody",
                "#article-view-content-div",
                ".view_cont",
                ".content",
            ],
        )
        if article_node is None:
            article_node = soup.body or soup

        paragraphs = []
        for node in article_node.find_all(["p", "div"], recursive=True):
            text = normalize_text(node.get_text(" ", strip=True))
            if is_article_sentence_block(text):
                paragraphs.append(text)

        if not paragraphs:
            text = normalize_text(article_node.get_text(" ", strip=True))
            paragraphs = [text] if text else []

        content_text = "\n\n".join(deduplicate(paragraphs))
        sentences = split_sentences(content_text)
        content_html = "\n".join(f"<p>{escape(sentence)}</p>" for sentence in sentences)

        if not sentences:
            raise CrawlError("본문 문장을 찾지 못했습니다.")

        return {"title": title, "content_text": content_text, "content_html": content_html, "sentences": sentences}

    def collect_site_candidates(self, site: dict[str, Any], limit: int = 2000) -> list[str]:
        candidates: dict[str, datetime | None] = {}
        visited = set()
        queue = list(site["feeds"])
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.settings.recent_article_days)

        while queue and len(candidates) < limit:
            feed_url = queue.pop(0)
            if feed_url in visited:
                continue
            visited.add(feed_url)
            add_candidate(candidates, site, feed_url, None, cutoff)
            try:
                response = self.get(feed_url)
            except requests.RequestException:
                continue

            soup = BeautifulSoup(response.text, "html.parser")

            for item in soup.find_all(["item", "entry", "url"]):
                href = first_child_text(item, ["loc", "link", "guid"])
                link_node = item.find("link")
                if link_node and link_node.get("href"):
                    href = link_node["href"]
                published_at = parse_article_datetime(first_child_text(item, ["pubdate", "published", "updated", "lastmod", "dc:date"]))
                if href:
                    absolute_url = urljoin(site["base_url"], href)
                    if "sitemap" in absolute_url and absolute_url not in visited and len(queue) < 30:
                        queue.append(absolute_url)
                    add_candidate(candidates, site, absolute_url, published_at, cutoff)

            for node in soup.find_all(["loc", "link"]):
                text = normalize_text(node.get_text(" ", strip=True))
                href = node.get("href") or text
                absolute_url = urljoin(site["base_url"], href)
                if "sitemap" in absolute_url and absolute_url not in visited and len(queue) < 30:
                    queue.append(absolute_url)
                add_candidate(candidates, site, absolute_url, nearest_article_datetime(node), cutoff)

            for node in soup.find_all("a", href=True):
                absolute_url = urljoin(site["base_url"], node["href"])
                if is_listing_url(site, absolute_url) and absolute_url not in visited and len(queue) < 30:
                    queue.append(absolute_url)
                add_candidate(candidates, site, absolute_url, nearest_article_datetime(node), cutoff)

        dated_recent = [url for url, published_at in candidates.items() if published_at and published_at >= cutoff]
        unknown_date = [url for url, published_at in candidates.items() if published_at is None]
        random.shuffle(dated_recent)
        random.shuffle(unknown_date)
        return (dated_recent + unknown_date)[:limit]


HistoryCrawler = AutoPilotCrawler


def first_node(soup: BeautifulSoup, selectors: list[str]):
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            return node
    return None


def first_text(soup: BeautifulSoup, selectors: list[str]) -> str:
    for selector in selectors:
        node = soup.select_one(selector)
        if not node:
            continue
        value = node.get("content") if node.name == "meta" else node.get_text(" ", strip=True)
        if value:
            return normalize_text(value)
    return ""


def is_article_sentence_block(text: str) -> bool:
    if len(text) < 25:
        return False
    blocked_words = [
        "관련기사",
        "기자의 다른 기사",
        "무단전재",
        "저작권자",
        "댓글",
        "이 기사를 공유합니다",
        "기사보내기",
        "본문 글씨",
        "스크롤 이동 상태바",
        "이전 기사보기",
        "다음 기사보기",
        "바로가기",
        "복사하기",
        "로그인",
        "뉴스레터 신청",
    ]
    return not any(word in text for word in blocked_words)


def deduplicate(items: list[str]) -> list[str]:
    seen = set()
    results = []
    for item in items:
        key = item[:120]
        if key not in seen:
            seen.add(key)
            results.append(item)
    return results


def split_sentences(text: str) -> list[str]:
    cleaned = normalize_text(text)
    marked = re.sub(r"([.!?。！？])\s+", r"\1\n", cleaned)
    marked = re.sub(r"(다|요|죠|니다|까)\s+", r"\1\n", marked)
    pieces = marked.splitlines()
    return [piece.strip() for piece in pieces if len(piece.strip()) >= 10]


def is_listing_url(site: dict[str, Any], url: str) -> bool:
    parsed = urlparse(url)
    if not parsed.netloc.endswith(urlparse(site["base_url"]).netloc):
        return False
    path_query = f"{parsed.path}?{parsed.query}" if parsed.query else parsed.path
    if any(re.search(pattern, path_query) for pattern in site["article_patterns"]):
        return False
    listing_patterns = site.get("listing_patterns") or []
    if any(re.search(pattern, path_query) for pattern in listing_patterns):
        return True
    return any(marker in parsed.path for marker in ["/news/", "/magazine/", "/archive", "/articles", "/category/", "/learn/"]) and (
        "page=" in parsed.query or parsed.path.rstrip("/") != urlparse(site["base_url"]).path.rstrip("/")
    )


def first_child_text(node, names: list[str]) -> str:
    for name in names:
        child = node.find(name)
        if child:
            return normalize_text(child.get_text(" ", strip=True))
    return ""


def nearest_article_datetime(node) -> datetime | None:
    for current in [node, *node.parents]:
        if not getattr(current, "name", None):
            continue
        if current.name == "time":
            value = current.get("datetime") or current.get("title") or current.get_text(" ", strip=True)
            parsed = parse_article_datetime(value)
            if parsed:
                return parsed
        for attr in ["datetime", "date", "data-date", "data-published", "title"]:
            value = current.get(attr)
            parsed = parse_article_datetime(value) if value else None
            if parsed:
                return parsed
        if current.name in {"item", "entry", "url"}:
            return parse_article_datetime(first_child_text(current, ["pubdate", "published", "updated", "lastmod", "dc:date"]))
    return None


def parse_article_datetime(value: str) -> datetime | None:
    text = normalize_text(value or "")
    if not text:
        return None
    now = datetime.now(timezone.utc)
    relative_match = re.search(r"(\d+)\s*(분|시간|일)\s*전", text)
    if relative_match:
        amount = int(relative_match.group(1))
        unit = relative_match.group(2)
        if unit == "분":
            return now - timedelta(minutes=amount)
        if unit == "시간":
            return now - timedelta(hours=amount)
        return now - timedelta(days=amount)
    for parser in (parse_rfc_datetime, parse_iso_datetime, parse_korean_datetime):
        parsed = parser(text)
        if parsed:
            return parsed
    return None


def parse_rfc_datetime(value: str) -> datetime | None:
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_iso_datetime(value: str) -> datetime | None:
    cleaned = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_korean_datetime(value: str) -> datetime | None:
    match = re.search(r"(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})", value)
    if not match:
        return None
    year, month, day = (int(part) for part in match.groups())
    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def add_candidate(
    candidates: dict[str, datetime | None],
    site: dict[str, Any],
    href: str,
    published_at: datetime | None,
    cutoff: datetime,
) -> None:
    if not href:
        return
    if published_at and published_at < cutoff:
        return
    url = urljoin(site["base_url"], href)
    parsed = urlparse(url)
    if not parsed.netloc.endswith(urlparse(site["base_url"]).netloc):
        return
    normalized_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    if parsed.query:
        normalized_url = f"{normalized_url}?{parsed.query}"
    if not is_candidate_content_url(parsed):
        return
    if not any(re.search(pattern, normalized_url) for pattern in site["article_patterns"]):
        return
    if normalized_url not in candidates or (published_at and candidates[normalized_url] is None):
        candidates[normalized_url] = published_at


def is_candidate_content_url(parsed) -> bool:
    path = parsed.path.strip("/").lower()
    if not path:
        return False
    blocked_extensions = (".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".pdf", ".zip")
    if path.endswith(blocked_extensions):
        return False
    blocked_parts = {"login", "signup", "tag", "category", "author", "search", "privacy", "terms", "about"}
    return not any(part in blocked_parts for part in path.split("/"))
