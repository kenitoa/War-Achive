from __future__ import annotations

import json
import re
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .classifier import ClassifiedRecord, classify_record
from .templates import (
    slugify,
    to_battlefield,
    to_biography,
    to_documents,
    to_strategy,
    to_undefine,
    to_war_overview,
    to_weapons,
)


@dataclass(frozen=True)
class ReconstructureResult:
    written: list[str]
    skipped: list[str]
    classified: dict[str, int]


class ReconstructureRunner:
    def __init__(self, database_path: Path, front_data_path: Path, overwrite: bool = False, pending_only: bool = False) -> None:
        self.database_path = Path(database_path)
        self.front_data_path = Path(front_data_path)
        self.overwrite = overwrite
        self.pending_only = pending_only

    def run(self, limit: int | None = None) -> ReconstructureResult:
        records = self.load_records(limit=limit)
        written: list[str] = []
        skipped: list[str] = []
        classified_counts: dict[str, int] = {}

        for record in records:
            classified = classify_record(record.get("title", ""), record.get("content_text", ""), record.get("page_url", ""))
            output_dir, payload = self.convert(record, classified)
            output_path = self.resolve_output_path(output_dir, payload, record)
            if output_path.exists():
                payload = merge_front_json(read_json(output_path), payload)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            self.mark_exported(record, output_path)
            written.append(str(output_path))
            classified_counts[classified.category] = classified_counts.get(classified.category, 0) + 1

        return ReconstructureResult(written=written, skipped=skipped, classified=classified_counts)

    def convert(self, record: dict[str, Any], classified: ClassifiedRecord) -> tuple[Path, dict[str, Any]]:
        converters: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
            "war overview data": to_war_overview,
            "biography of people data": to_biography,
            "strategy and tactics data": to_strategy,
            "Historical Sources & Documents data": to_documents,
            "Battlefield Map data": to_battlefield,
        }
        if classified.category == "weapons and equipment data":
            return self.front_data_path / classified.category / classified.subcategory, to_weapons(record, classified.subcategory)
        if classified.category == "Undefine facts data":
            return self.front_data_path / classified.category / classified.subcategory, to_undefine(record, classified.subcategory)
        converter = converters.get(classified.category, to_undefine)
        return self.front_data_path / classified.category, converter(record)

    def resolve_output_path(self, output_dir: Path, payload: dict[str, Any], record: dict[str, Any]) -> Path:
        title_candidates = record_titles(payload, record)
        existing = find_existing_json(output_dir, title_candidates)
        if existing:
            return existing
        filename = slugify(payload.get("id") or payload.get("name") or payload.get("title") or record.get("title", "untitled"))
        return unique_path(output_dir / f"{filename}.json", self.overwrite)

    def load_records(self, limit: int | None = None) -> list[dict[str, Any]]:
        if not self.database_path.exists():
            return []
        with closing(sqlite3.connect(self.database_path)) as conn:
            conn.row_factory = sqlite3.Row
            ensure_export_table(conn)
            where = ""
            if self.pending_only:
                where = """
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM front_exports e
                    WHERE e.fingerprint = text_assets.fingerprint
                )
                """
            text_rows = conn.execute(
                f"""
                SELECT page_url, title, content_text, content_html, sentence_count, fingerprint
                FROM text_assets
                {where}
                ORDER BY rowid ASC
                LIMIT ?
                """,
                (limit or 10000,),
            ).fetchall()
            records = [dict(row) for row in text_rows]
            for record in records:
                page_url = record.get("page_url", "")
                record["images"] = [
                    dict(row)
                    for row in conn.execute(
                        "SELECT * FROM image_assets WHERE page_url = ? ORDER BY rowid ASC",
                        (page_url,),
                    ).fetchall()
                ]
                record["media"] = [
                    dict(row)
                    for row in conn.execute(
                        "SELECT * FROM media_assets WHERE page_url = ? ORDER BY rowid ASC",
                        (page_url,),
                    ).fetchall()
                ]
        return records

    def mark_exported(self, record: dict[str, Any], output_path: Path) -> None:
        fingerprint = str(record.get("fingerprint") or "")
        if not fingerprint:
            return
        with closing(sqlite3.connect(self.database_path)) as conn:
            ensure_export_table(conn)
            with conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO front_exports
                      (fingerprint, page_url, output_path, exported_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        fingerprint,
                        str(record.get("page_url") or ""),
                        str(output_path),
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )


def unique_path(path: Path, overwrite: bool) -> Path:
    if overwrite or not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    index = 2
    while True:
        candidate = parent / f"{stem}-{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def find_existing_json(output_dir: Path, title_candidates: list[str]) -> Path | None:
    if not output_dir.exists():
        return None
    target_keys = {match_key(value) for value in title_candidates if value}
    for path in sorted(output_dir.glob("*.json")):
        keys = {match_key(path.stem)}
        try:
            data = read_json(path)
        except (OSError, json.JSONDecodeError):
            data = {}
        keys.update(match_key(value) for value in record_titles(data, {}) if value)
        if target_keys.intersection(keys):
            return path
    return None


def record_titles(payload: dict[str, Any], record: dict[str, Any]) -> list[str]:
    values = [
        payload.get("id"),
        payload.get("name"),
        payload.get("nameEn"),
        payload.get("title"),
        payload.get("titleKr"),
        record.get("title") if record else "",
    ]
    return [str(value) for value in values if value]


def match_key(value: str) -> str:
    text = str(value or "").lower()
    text = text.replace("제", "").replace("차", "")
    replacements = {
        "한국전쟁": "koreanwar",
        "한국 전쟁": "koreanwar",
        "6.25": "koreanwar",
        "육이오": "koreanwar",
        "세계대전": "worldwar",
        "제일차세계대전": "worldwar1",
        "제이차세계대전": "worldwar2",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"[^0-9a-z가-힣]+", "", text)


def read_json(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if text.startswith("\ufeff"):
        text = text[1:]
    data = json.loads(text)
    return data if isinstance(data, dict) else {}


def ensure_export_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS front_exports (
            fingerprint TEXT PRIMARY KEY,
            page_url TEXT NOT NULL,
            output_path TEXT NOT NULL,
            exported_at TEXT NOT NULL
        )
        """
    )


def merge_front_json(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    for key, value in incoming.items():
        if is_empty(merged.get(key)):
            merged[key] = value
        elif key == "detail" and isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = merge_front_json(merged[key], value)
        elif isinstance(merged.get(key), list) and isinstance(value, list):
            merged[key] = merge_lists(merged[key], value)
        elif isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = merge_front_json(merged[key], value)
    return merged


def merge_lists(existing: list[Any], incoming: list[Any]) -> list[Any]:
    result = list(existing)
    seen = {json.dumps(item, ensure_ascii=False, sort_keys=True) for item in result}
    for item in incoming:
        key = json.dumps(item, ensure_ascii=False, sort_keys=True)
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result


def is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}
