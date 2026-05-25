from __future__ import annotations

import re
from typing import Any


ERA_KEYWORDS = {
    "ancient": ["ancient", "roman", "greek", "persian", "han dynasty", "goguryeo"],
    "medieval": ["medieval", "crusade", "knight", "mongol", "samurai"],
    "earlymodern": ["early modern", "thirty years", "westphalia", "napoleonic"],
    "modern": ["civil war", "crimean", "russo-japanese", "revolution"],
    "worldwar": ["world war", "wwi", "wwii", "1940", "1941", "1942", "1943", "1944", "1945"],
    "contemporary": ["cold war", "gulf war", "vietnam", "korean war", "modern"],
}


def slugify(value: str) -> str:
    value = re.sub(r"[^0-9A-Za-z가-힣\s_-]+", "", value or "").strip().lower()
    value = re.sub(r"[\s_]+", "-", value)
    return value[:80].strip("-") or "untitled"


def split_paragraphs(text: str, limit: int = 8) -> list[str]:
    parts = [part.strip() for part in re.split(r"\n{2,}", text or "") if part.strip()]
    if not parts:
        parts = [part.strip() for part in re.split(r"(?<=[.!?。！？])\s+", text or "") if part.strip()]
    return parts[:limit]


def infer_era(title: str, text: str) -> str:
    haystack = f"{title}\n{text}".lower()
    for era, keywords in ERA_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return era
    return "modern"


def keywords_from_text(title: str, text: str, max_count: int = 8) -> list[str]:
    words = re.findall(r"[A-Za-z가-힣][A-Za-z가-힣0-9-]{2,}", f"{title} {text}")
    blocked = {"the", "and", "with", "from", "that", "this", "were", "was", "for", "into", "history"}
    results: list[str] = []
    for word in words:
        key = word.lower()
        if key in blocked or key in {item.lower() for item in results}:
            continue
        results.append(word)
        if len(results) >= max_count:
            break
    return results


def image_list(images: list[dict[str, Any]], max_count: int = 3) -> list[dict[str, str]]:
    results = []
    for image in images[:max_count]:
        results.append(
            {
                "url": image.get("source_url", ""),
                "caption": image.get("caption") or image.get("alt") or "",
                "source": image.get("page_url", ""),
            }
        )
    return results


def reference_list(page_url: str) -> list[str]:
    return [page_url] if page_url else []


def base_context(record: dict[str, Any]) -> dict[str, Any]:
    title = record.get("title") or "Untitled"
    text = record.get("content_text") or ""
    paragraphs = split_paragraphs(text)
    summary = paragraphs[0] if paragraphs else text[:240]
    return {
        "id": slugify(title),
        "title": title,
        "titleKr": title,
        "text": text,
        "paragraphs": paragraphs,
        "summary": summary,
        "era": infer_era(title, text),
        "keywords": keywords_from_text(title, text),
        "page_url": record.get("page_url", ""),
        "images": image_list(record.get("images", [])),
        "media": record.get("media", []),
    }


def to_war_overview(record: dict[str, Any]) -> dict[str, Any]:
    ctx = base_context(record)
    return {
        "id": ctx["id"],
        "name": ctx["titleKr"],
        "era": ctx["era"],
        "region": "unknown",
        "period": "",
        "summary": ctx["summary"],
        "belligerents": "",
        "location": "",
        "result": "",
        "resultType": "unknown",
        "tags": ctx["keywords"],
        "detail": {
            "background": join_paragraphs(ctx["paragraphs"], 0),
            "causes": [],
            "phases": paragraphs_as_sections(ctx["paragraphs"][1:4]),
            "majorBattles": [],
            "keyFigures": [],
            "casualties": {"side1": "", "side2": ""},
            "aftermath": join_paragraphs(ctx["paragraphs"], 4),
            "significance": ctx["summary"],
            "references": reference_objects(ctx["page_url"]),
        },
    }


def to_biography(record: dict[str, Any]) -> dict[str, Any]:
    ctx = base_context(record)
    return {
        "id": ctx["id"],
        "name": ctx["titleKr"],
        "title": "Historical figure",
        "role": "commander",
        "era": ctx["era"],
        "nationality": "",
        "lifespan": "",
        "summary": ctx["summary"],
        "portrait": ctx["images"][0]["url"] if ctx["images"] else "",
        "wars": [],
        "tags": ctx["keywords"],
        "detail": {
            "earlyLife": join_paragraphs(ctx["paragraphs"], 0),
            "achievements": paragraphs_as_title_desc(ctx["paragraphs"][1:4]),
            "warsBattles": [],
            "leadership": join_paragraphs(ctx["paragraphs"], 2),
            "laterLife": "",
            "legacy": join_paragraphs(ctx["paragraphs"], 3),
            "evaluation": ctx["summary"],
            "anecdotes": [],
            "references": reference_objects(ctx["page_url"]),
        },
    }


def to_weapons(record: dict[str, Any], subcategory: str) -> dict[str, Any]:
    ctx = base_context(record)
    paragraphs = ctx["paragraphs"]
    return {
        "name": ctx["titleKr"],
        "nameEn": ctx["title"],
        "image": ctx["images"][0]["url"] if ctx["images"] else "",
        "category": subcategory,
        "era": ctx["era"],
        "origin": "",
        "period": "",
        "operators": [],
        "tags": ctx["keywords"],
        "overview": paragraphs[:3] or [ctx["summary"]],
        "specs": [],
        "history": paragraphs[3:5],
        "design": [],
        "operation": [],
        "combatRecord": [],
        "variants": [],
        "evaluation": paragraphs[5:7] or [ctx["summary"]],
        "related": [],
        "references": reference_list(ctx["page_url"]),
    }


def to_strategy(record: dict[str, Any]) -> dict[str, Any]:
    ctx = base_context(record)
    return {
        "id": ctx["id"],
        "title": ctx["title"],
        "titleKr": ctx["titleKr"],
        "era": ctx["era"],
        "category": "operational",
        "origin": "",
        "period": "",
        "region": "",
        "keyFigure": "",
        "description": ctx["summary"],
        "keywords": ctx["keywords"],
        "infoBox": {
            "type": "Doctrine / Tactic",
            "originNation": "",
            "firstUsed": "",
            "lastUsed": "",
            "mainWeapon": "",
            "idealTerrain": "",
            "weakness": "",
        },
        "sections": paragraphs_as_sections(ctx["paragraphs"]),
        "images": ctx["images"],
        "relatedStrategies": [],
    }


def to_documents(record: dict[str, Any]) -> dict[str, Any]:
    ctx = base_context(record)
    return {
        "id": ctx["id"],
        "title": ctx["title"],
        "titleKr": ctx["titleKr"],
        "coverImage": ctx["images"][0]["url"] if ctx["images"] else "",
        "type": "archive",
        "era": ctx["era"],
        "date": "",
        "author": "",
        "origin": ctx["page_url"],
        "description": ctx["summary"],
        "keywords": ctx["keywords"],
        "detail": {
            "background": join_paragraphs(ctx["paragraphs"], 0),
            "originalText": ctx["text"],
            "significance": ctx["summary"],
            "aftermath": "",
            "relatedDocuments": [],
            "physicalDescription": "",
            "references": reference_list(ctx["page_url"]),
        },
    }


def to_battlefield(record: dict[str, Any]) -> dict[str, Any]:
    ctx = base_context(record)
    return {
        "id": ctx["id"],
        "title": ctx["title"],
        "titleKr": ctx["titleKr"],
        "era": ctx["era"],
        "theater": "unknown",
        "date": "",
        "location": "",
        "commanders": [],
        "forces": [],
        "casualties": [],
        "result": "",
        "description": ctx["summary"],
        "keywords": ctx["keywords"],
        "terrain": "",
        "strategicSignificance": ctx["summary"],
        "infoBox": {
            "type": "Battle",
            "theater": "",
            "duration": "",
            "terrain": "",
            "keyWeapon": "",
            "outcome": "",
            "legacy": "",
        },
        "sections": paragraphs_as_sections(ctx["paragraphs"]),
        "images": ctx["images"],
        "relatedBattles": [],
    }


def to_undefine(record: dict[str, Any], shelf: str) -> dict[str, Any]:
    ctx = base_context(record)
    return {
        "id": ctx["id"],
        "name": ctx["titleKr"],
        "nameEn": ctx["title"],
        "shelf": shelf,
        "era": ctx["era"],
        "origin": ctx["page_url"],
        "status": "unverified",
        "tags": ctx["keywords"],
        "summary": ctx["summary"],
        "credibility": 2,
        "discoveredDate": "",
        "content": ctx["paragraphs"] or [ctx["summary"]],
        "significance": ctx["summary"],
        "controversy": "",
        "relatedItems": [],
        "editorNote": "Automatically reconstructed from crawling output. Review before publishing as verified content.",
    }


def join_paragraphs(paragraphs: list[str], index: int) -> str:
    return paragraphs[index] if index < len(paragraphs) else ""


def paragraphs_as_sections(paragraphs: list[str]) -> list[dict[str, str]]:
    return [{"title": f"Section {index + 1}", "content": paragraph} for index, paragraph in enumerate(paragraphs)]


def paragraphs_as_title_desc(paragraphs: list[str]) -> list[dict[str, str]]:
    return [{"title": f"Record {index + 1}", "description": paragraph} for index, paragraph in enumerate(paragraphs)]


def reference_objects(page_url: str) -> list[dict[str, str]]:
    return [{"title": "Crawled source", "author": "", "year": "", "note": page_url}] if page_url else []
