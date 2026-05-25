from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable


Extractor = Callable[[dict[str, Any], str], dict[str, Any]]


def generate_front_search_indexes(front_data_path: Path) -> dict[str, int]:
    front_data_path = Path(front_data_path)
    search_dir = front_data_path / "search"
    search_dir.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    for source_dir, output_name, extractor in flat_configs():
        rows = collect_flat(front_data_path / source_dir, extractor)
        write_json(search_dir / output_name, rows)
        counts[output_name] = len(rows)

    weapons = collect_weapons(front_data_path / "weapons and equipment data")
    write_json(search_dir / "weapons and equipment search.json", weapons)
    counts["weapons and equipment search.json"] = len(weapons)

    undefine = collect_undefine(front_data_path / "Undefine facts data")
    write_json(search_dir / "Undefine facts search.json", undefine)
    counts["Undefine facts search.json"] = len(undefine)
    return counts


def flat_configs() -> list[tuple[str, str, Extractor]]:
    return [
        (
            "biography of people data",
            "biography of people search.json",
            lambda data, name: {
                "id": data.get("id"),
                "name": data.get("name"),
                "title": data.get("title"),
                "role": data.get("role"),
                "era": data.get("era"),
                "nationality": data.get("nationality"),
                "summary": short(data.get("summary")),
                "wars": data.get("wars") or [],
                "tags": data.get("tags") or [],
                "image": first_image(data),
                "url": "pages/biography of people/biography of people detail.html?id=" + encode_id(data.get("id")),
            },
        ),
        (
            "Battlefield Map data",
            "Battlefield Map search.json",
            lambda data, name: {
                "id": data.get("id"),
                "title": data.get("title"),
                "titleKr": data.get("titleKr"),
                "era": data.get("era"),
                "theater": data.get("theater"),
                "date": data.get("date"),
                "location": data.get("location"),
                "commanders": data.get("commanders") or [],
                "description": short(data.get("description")),
                "keywords": data.get("keywords") or [],
                "image": first_image(data),
                "url": "pages/Battlefield Map/Battlefield Map detail.html?id=" + encode_id(data.get("id")),
            },
        ),
        (
            "war overview data",
            "war overview search.json",
            lambda data, name: {
                "id": data.get("id"),
                "name": data.get("name"),
                "era": data.get("era"),
                "region": data.get("region"),
                "period": data.get("period"),
                "summary": short(data.get("summary")),
                "belligerents": data.get("belligerents") or "",
                "location": data.get("location") or "",
                "tags": data.get("tags") or [],
                "image": first_image(data),
                "url": "pages/war overview/war overview detail.html?id=" + encode_id(data.get("id")),
            },
        ),
        (
            "Historical Sources & Documents data",
            "Historical Sources & Documents search.json",
            lambda data, name: {
                "id": data.get("id"),
                "title": data.get("title"),
                "titleKr": data.get("titleKr"),
                "type": data.get("type"),
                "era": data.get("era"),
                "date": data.get("date"),
                "author": data.get("author") or "",
                "description": short(data.get("description")),
                "keywords": data.get("keywords") or [],
                "image": first_image(data),
                "url": "pages/Historical Sources & Documents/Historical Sources & Documents detail.html?id="
                + encode_id(data.get("id")),
            },
        ),
        (
            "strategy and tactics data",
            "strategy and tactics search.json",
            lambda data, name: {
                "id": data.get("id"),
                "title": data.get("title"),
                "titleKr": data.get("titleKr"),
                "era": data.get("era"),
                "category": data.get("category"),
                "origin": data.get("origin") or "",
                "period": data.get("period") or "",
                "region": data.get("region") or "",
                "keyFigure": data.get("keyFigure") or "",
                "description": short(data.get("description")),
                "keywords": data.get("keywords") or [],
                "image": first_image(data),
                "url": "pages/strategy and tactics/strategy and tactics detail.html?id=" + encode_id(data.get("id")),
            },
        ),
    ]


def collect_flat(folder: Path, extractor: Extractor) -> list[dict[str, Any]]:
    if not folder.is_dir():
        return []
    rows = []
    for path in sorted(folder.glob("*.json")):
        if path.name in {"index.json", "search.json"}:
            continue
        data = read_json(path)
        if data:
            rows.append(extractor(data, path.stem))
    return rows


def collect_weapons(folder: Path) -> list[dict[str, Any]]:
    if not folder.is_dir():
        return []
    rows = []
    for subdir in sorted(path for path in folder.iterdir() if path.is_dir()):
        for path in sorted(subdir.glob("*.json")):
            data = read_json(path)
            if not data:
                continue
            rows.append(
                {
                    "name": data.get("name"),
                    "nameEn": data.get("nameEn"),
                    "category": data.get("category") or subdir.name,
                    "era": data.get("era"),
                    "origin": data.get("origin") or "",
                    "tags": data.get("tags") or [],
                    "overview": short(" ".join(str(item) for item in data.get("overview") or [])),
                    "image": first_image(data),
                    "url": "pages/Weapons and Equipment/Weapons and Equipment item.html?id="
                    + encode_id(f"{subdir.name}/{path.stem}"),
                }
            )
    return rows


def collect_undefine(folder: Path) -> list[dict[str, Any]]:
    if not folder.is_dir():
        return []
    rows = []
    for shelf in sorted(path for path in folder.iterdir() if path.is_dir()):
        for path in sorted(shelf.glob("*.json")):
            data = read_json(path)
            if not data:
                continue
            item_id = data.get("id") or path.stem
            shelf_id = data.get("shelf") or shelf.name
            rows.append(
                {
                    "id": item_id,
                    "name": data.get("name"),
                    "nameEn": data.get("nameEn") or "",
                    "shelf": shelf_id,
                    "era": data.get("era") or "",
                    "origin": data.get("origin") or "",
                    "summary": short(data.get("summary")),
                    "tags": data.get("tags") or [],
                    "image": first_image(data),
                    "url": "pages/Undefine facts/Undefine detail.html?shelf="
                    + encode_id(shelf_id)
                    + "&id="
                    + encode_id(item_id),
                }
            )
    return rows


def read_json(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
        if text.startswith("\ufeff"):
            text = text[1:]
        data = json.loads(text)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_json(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def short(value: Any, limit: int = 120) -> str:
    return str(value or "")[:limit]


def first_image(data: dict[str, Any]) -> str:
    for key in ("image", "coverImage", "portrait"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    images = data.get("images")
    if isinstance(images, list):
        for image in images:
            if isinstance(image, dict):
                value = image.get("url") or image.get("source_url")
                if isinstance(value, str) and value.strip():
                    return value.strip()
            elif isinstance(image, str) and image.strip():
                return image.strip()

    return ""


def encode_id(value: Any) -> str:
    from urllib.parse import quote

    return quote(str(value or ""), safe="")
