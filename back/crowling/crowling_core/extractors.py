from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .settings import normalize_text


@dataclass(frozen=True)
class RawPage:
    source_name: str
    source_url: str
    final_url: str
    title: str
    html: str
    fetched_at: str
    content_type: str = "text/html"
    status_code: int = 200


@dataclass(frozen=True)
class ImageAsset:
    source_url: str
    page_url: str
    title: str
    alt: str
    caption: str
    width: int | None
    height: int | None
    extension: str
    fingerprint: str


@dataclass(frozen=True)
class MediaAsset:
    source_url: str
    page_url: str
    title: str
    kind: str
    mime_type: str
    label: str
    extension: str
    fingerprint: str


@dataclass(frozen=True)
class TextAsset:
    page_url: str
    title: str
    content_text: str
    content_html: str
    sentences: list[str]
    fingerprint: str


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"}
MEDIA_EXTENSIONS = {".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".m4a", ".pdf"}


def soup_from_page(page: RawPage) -> BeautifulSoup:
    soup = BeautifulSoup(page.html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup


def extract_images(page: RawPage) -> list[ImageAsset]:
    soup = soup_from_page(page)
    assets: dict[str, ImageAsset] = {}
    for node in soup.find_all(["img", "source"]):
        urls = image_urls_from_node(node)
        for url in urls:
            absolute_url = normalize_asset_url(page.final_url, url)
            if not absolute_url or not is_image_url(absolute_url):
                continue
            caption = nearest_caption(node)
            asset = ImageAsset(
                source_url=absolute_url,
                page_url=page.final_url,
                title=page.title,
                alt=normalize_text(node.get("alt") or node.get("title") or ""),
                caption=caption,
                width=parse_int(node.get("width")),
                height=parse_int(node.get("height")),
                extension=file_extension(absolute_url),
                fingerprint=stable_hash(absolute_url),
            )
            assets.setdefault(asset.source_url, asset)

    for selector in ["meta[property='og:image']", "meta[name='twitter:image']"]:
        node = soup.select_one(selector)
        content = node.get("content") if node else ""
        absolute_url = normalize_asset_url(page.final_url, content)
        if absolute_url and is_image_url(absolute_url):
            assets.setdefault(
                absolute_url,
                ImageAsset(
                    source_url=absolute_url,
                    page_url=page.final_url,
                    title=page.title,
                    alt="",
                    caption="",
                    width=None,
                    height=None,
                    extension=file_extension(absolute_url),
                    fingerprint=stable_hash(absolute_url),
                ),
            )
    return list(assets.values())


def extract_media(page: RawPage) -> list[MediaAsset]:
    soup = soup_from_page(page)
    assets: dict[str, MediaAsset] = {}
    for node in soup.find_all(["video", "audio", "source", "iframe", "embed", "a"]):
        urls = media_urls_from_node(node)
        for url in urls:
            absolute_url = normalize_asset_url(page.final_url, url)
            if not absolute_url:
                continue
            kind = media_kind(node.name, absolute_url)
            if not kind:
                continue
            asset = MediaAsset(
                source_url=absolute_url,
                page_url=page.final_url,
                title=page.title,
                kind=kind,
                mime_type=normalize_text(node.get("type") or ""),
                label=normalize_text(node.get_text(" ", strip=True) or node.get("title") or node.get("aria-label") or ""),
                extension=file_extension(absolute_url),
                fingerprint=stable_hash(absolute_url),
            )
            assets.setdefault(asset.source_url, asset)
    return list(assets.values())


def extract_text(page: RawPage) -> TextAsset:
    soup = soup_from_page(page)
    title = page.title or first_text(soup, ["meta[property='og:title']", "h1", "title"]) or "Untitled"
    article_node = first_node(
        soup,
        ["article", "main", ".article-body", ".article_body", ".content", "#content", "#articleBody"],
    )
    root = article_node or soup.body or soup
    blocks = []
    for node in root.find_all(["p", "li", "blockquote", "h2", "h3"], recursive=True):
        text = normalize_text(node.get_text(" ", strip=True))
        if len(text) >= 20:
            blocks.append(text)
    if not blocks:
        text = normalize_text(root.get_text(" ", strip=True))
        blocks = [text] if text else []
    content_text = "\n\n".join(dedupe(blocks))
    sentences = split_sentences(content_text)
    content_html = "\n".join(f"<p>{escape(sentence)}</p>" for sentence in sentences)
    return TextAsset(
        page_url=page.final_url,
        title=title,
        content_text=content_text,
        content_html=content_html,
        sentences=sentences,
        fingerprint=stable_hash(f"{page.final_url}\n{content_text[:2000]}"),
    )


def write_jsonl(path: Path, rows: list[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")


def image_urls_from_node(node) -> list[str]:
    urls = [node.get("src"), node.get("data-src"), node.get("data-original")]
    srcset = node.get("srcset") or node.get("data-srcset") or ""
    for item in srcset.split(","):
        urls.append(item.strip().split(" ")[0])
    return [url for url in urls if url]


def media_urls_from_node(node) -> list[str]:
    return [url for url in [node.get("src"), node.get("href"), node.get("data-src")] if url]


def normalize_asset_url(page_url: str, url: str | None) -> str:
    if not url:
        return ""
    url = url.strip()
    if url.startswith("data:") or url.startswith("javascript:") or url.startswith("mailto:"):
        return ""
    parsed = urlparse(urljoin(page_url, url))
    if parsed.scheme not in {"http", "https"}:
        return ""
    return parsed._replace(fragment="").geturl()


def is_image_url(url: str) -> bool:
    ext = file_extension(url)
    return ext in IMAGE_EXTENSIONS or "image" in url.lower()


def media_kind(tag_name: str, url: str) -> str:
    ext = file_extension(url)
    lowered = url.lower()
    if tag_name == "video" or ext in {".mp4", ".webm", ".mov"}:
        return "video"
    if tag_name == "audio" or ext in {".mp3", ".wav", ".ogg", ".m4a"}:
        return "audio"
    if ext == ".pdf":
        return "document"
    if tag_name in {"iframe", "embed"} or any(host in lowered for host in ["youtube.com", "youtu.be", "vimeo.com"]):
        return "embed"
    return ""


def nearest_caption(node) -> str:
    figure = node.find_parent("figure")
    if figure:
        caption = figure.find("figcaption")
        if caption:
            return normalize_text(caption.get_text(" ", strip=True))
    return ""


def file_extension(url: str) -> str:
    return Path(urlparse(url).path).suffix.lower()


def parse_int(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


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


def dedupe(items: list[str]) -> list[str]:
    seen = set()
    results = []
    for item in items:
        key = item[:160]
        if key not in seen:
            seen.add(key)
            results.append(item)
    return results


def split_sentences(text: str) -> list[str]:
    marked = re.sub(r"([.!?。！？])\s+", r"\1\n", normalize_text(text))
    return [line.strip() for line in marked.splitlines() if len(line.strip()) >= 10]


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
