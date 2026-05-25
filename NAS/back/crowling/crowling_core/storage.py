from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from .extractors import ImageAsset, MediaAsset, RawPage, TextAsset


SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL UNIQUE,
    final_url TEXT NOT NULL,
    title TEXT NOT NULL,
    html TEXT NOT NULL,
    content_type TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_assets (
    fingerprint TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    page_url TEXT NOT NULL,
    title TEXT NOT NULL,
    alt TEXT NOT NULL,
    caption TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    extension TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
    fingerprint TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    page_url TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    label TEXT NOT NULL,
    extension TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS text_assets (
    fingerprint TEXT PRIMARY KEY,
    page_url TEXT NOT NULL,
    title TEXT NOT NULL,
    content_text TEXT NOT NULL,
    content_html TEXT NOT NULL,
    sentence_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
"""


class CrawlingStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = Path(database_path)

    def connect(self) -> sqlite3.Connection:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.database_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def init_db(self) -> None:
        with closing(self.connect()) as conn:
            with conn:
                conn.executescript(SCHEMA)

    def existing_page_urls(self) -> set[str]:
        with closing(self.connect()) as conn:
            return {row["source_url"] for row in conn.execute("SELECT source_url FROM raw_pages").fetchall()}

    def save_raw_page(self, page: RawPage) -> int:
        with closing(self.connect()) as conn:
            with conn:
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO raw_pages
                      (source_name, source_url, final_url, title, html, content_type, status_code, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        page.source_name,
                        page.source_url,
                        page.final_url,
                        page.title,
                        page.html,
                        page.content_type,
                        page.status_code,
                        page.fetched_at,
                    ),
                )
                if cursor.lastrowid:
                    return int(cursor.lastrowid)
                row = conn.execute("SELECT id FROM raw_pages WHERE source_url = ?", (page.source_url,)).fetchone()
                return int(row["id"])

    def list_raw_pages(self, limit: int = 1000) -> list[RawPage]:
        with closing(self.connect()) as conn:
            rows = conn.execute("SELECT * FROM raw_pages ORDER BY id ASC LIMIT ?", (limit,)).fetchall()
        return [RawPage(**{key: row[key] for key in RawPage.__dataclass_fields__}) for row in rows]

    def save_images(self, assets: list[ImageAsset]) -> int:
        return self._insert_assets("image_assets", assets, extra=["created_at"])

    def save_media(self, assets: list[MediaAsset]) -> int:
        return self._insert_assets("media_assets", assets, extra=["created_at"])

    def save_texts(self, assets: list[TextAsset]) -> int:
        now = utc_now()
        with closing(self.connect()) as conn:
            with conn:
                before = conn.total_changes
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO text_assets
                      (fingerprint, page_url, title, content_text, content_html, sentence_count, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            asset.fingerprint,
                            asset.page_url,
                            asset.title,
                            asset.content_text,
                            asset.content_html,
                            len(asset.sentences),
                            now,
                        )
                        for asset in assets
                    ],
                )
                return conn.total_changes - before

    def _insert_assets(self, table: str, assets: list[ImageAsset] | list[MediaAsset], extra: list[str]) -> int:
        if not assets:
            return 0
        rows = []
        for asset in assets:
            row = asdict(asset)
            row.update({name: utc_now() for name in extra})
            rows.append(row)
        columns = list(rows[0].keys())
        placeholders = ", ".join("?" for _ in columns)
        sql = f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
        with closing(self.connect()) as conn:
            with conn:
                before = conn.total_changes
                conn.executemany(sql, [[row[column] for column in columns] for row in rows])
                return conn.total_changes - before


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
