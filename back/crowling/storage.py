from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT '',
    source_language TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content_html TEXT NOT NULL,
    content_text TEXT NOT NULL,
    exported_path TEXT NOT NULL DEFAULT '',
    exported_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    sentence_order INTEGER NOT NULL,
    sentence TEXT NOT NULL,
    FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
);
"""


class ArticleStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def connect(self) -> sqlite3.Connection:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.database_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def init_db(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            self.ensure_column(conn, "articles", "source_name", "TEXT NOT NULL DEFAULT ''")
            self.ensure_column(conn, "articles", "source_type", "TEXT NOT NULL DEFAULT ''")
            self.ensure_column(conn, "articles", "source_language", "TEXT NOT NULL DEFAULT ''")
            self.ensure_column(conn, "articles", "exported_path", "TEXT NOT NULL DEFAULT ''")
            self.ensure_column(conn, "articles", "exported_at", "TEXT NOT NULL DEFAULT ''")

    def ensure_column(self, conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = [row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def existing_urls(self) -> set[str]:
        with self.connect() as conn:
            return {row["source_url"] for row in conn.execute("SELECT source_url FROM articles").fetchall()}

    def save_article(
        self,
        source_name: str,
        source_url: str,
        title: str,
        content_text: str,
        content_html: str,
        sentences: list[str],
        source_type: str = "",
        source_language: str = "",
    ) -> int:
        now = datetime.utcnow().isoformat()
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO articles (
                    source_name,
                    source_type,
                    source_language,
                    source_url,
                    title,
                    content_html,
                    content_text,
                    exported_path,
                    exported_at,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?)
                """,
                (source_name, source_type, source_language, source_url, title, content_html, content_text, now),
            )
            article_id = int(cursor.lastrowid)
            if article_id == 0:
                row = conn.execute("SELECT id FROM articles WHERE source_url = ?", (source_url,)).fetchone()
                return int(row["id"])
            conn.executemany(
                """
                INSERT INTO sentences (article_id, sentence_order, sentence)
                VALUES (?, ?, ?)
                """,
                [(article_id, index + 1, sentence) for index, sentence in enumerate(sentences)],
            )
        return article_id

    def list_unexported_articles(self, limit: int = 50) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                """
                SELECT a.*, COUNT(s.id) AS sentence_count
                FROM articles a
                LEFT JOIN sentences s ON s.article_id = a.id
                WHERE a.exported_path = ''
                GROUP BY a.id
                ORDER BY a.id ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

    def list_sentences(self, article_id: int) -> list[str]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT sentence
                FROM sentences
                WHERE article_id = ?
                ORDER BY sentence_order ASC
                """,
                (article_id,),
            ).fetchall()
        return [row["sentence"] for row in rows]

    def mark_exported(self, article_id: int, exported_path: str) -> None:
        now = datetime.utcnow().isoformat()
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE articles
                SET exported_path = ?, exported_at = ?
                WHERE id = ?
                """,
                (exported_path, now, article_id),
            )

    def list_articles(self, limit: int = 20) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return conn.execute(
                """
                SELECT a.*, COUNT(s.id) AS sentence_count
                FROM articles a
                LEFT JOIN sentences s ON s.article_id = a.id
                GROUP BY a.id
                ORDER BY a.id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
