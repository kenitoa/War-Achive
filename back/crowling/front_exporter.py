from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from sqlite3 import Row
from typing import Any

from .settings import CrawlerSettings, normalize_text
from .storage import ArticleStore


CATEGORY_FOLDERS = {
    "war": "war overview data",
    "bio": "biography of people data",
    "battle": "Battlefield Map data",
    "weapons": "weapons and equipment data",
    "docs": "Historical Sources & Documents data",
    "tactics": "strategy and tactics data",
    "undefine": "Undefine facts data",
}

ERA_KEYWORDS = {
    "ancient": ["ancient", "rome", "roman", "greek", "greece", "egypt", "persia", "고대", "로마", "그리스", "이집트"],
    "medieval": ["medieval", "middle ages", "crusade", "viking", "중세", "십자군", "바이킹"],
    "earlymodern": ["renaissance", "ottoman", "imjin", "early modern", "근세", "오스만", "임진왜란"],
    "modern": ["napoleon", "civil war", "industrial", "근대", "나폴레옹", "남북전쟁"],
    "worldwar": ["world war", "wwi", "wwii", "ww1", "ww2", "세계대전", "1차 대전", "2차 대전", "제1차", "제2차"],
    "contemporary": ["cold war", "korean war", "vietnam", "modern", "냉전", "한국전쟁", "베트남", "현대"],
}

REGION_KEYWORDS = {
    "eastasia": ["korea", "japan", "china", "east asia", "한국", "조선", "일본", "중국", "동아시아"],
    "europe": ["europe", "britain", "france", "germany", "rome", "유럽", "영국", "프랑스", "독일", "로마"],
    "middleeast": ["middle east", "ottoman", "persia", "중동", "오스만", "페르시아"],
    "americas": ["america", "united states", "civil war", "미국", "아메리카", "남북전쟁"],
    "africa": ["africa", "egypt", "아프리카", "이집트"],
}

TYPE_KEYWORDS = {
    "weapons": ["weapon", "rifle", "gun", "tank", "aircraft", "ship", "sword", "armor", "무기", "소총", "전차", "항공기", "함선", "갑옷"],
    "battle": ["battle", "siege", "campaign", "battlefield", "전투", "공성전", "전역", "전장"],
    "tactics": ["strategy", "tactic", "doctrine", "formation", "warfare", "전략", "전술", "교리", "진형", "전쟁 양상"],
    "bio": ["biography", "commander", "general", "king", "emperor", "leader", "인물", "장군", "지휘관", "왕", "황제"],
    "war": ["war", "invasion", "conflict", "revolution", "전쟁", "침공", "분쟁", "혁명"],
    "undefine": ["myth", "legend", "disputed", "mystery", "unidentified", "전설", "신화", "논쟁", "미스터리", "미확인"],
}

WEAPON_SUBFOLDERS = {
    "firearms": ["rifle", "gun", "firearm", "pistol", "machine gun", "소총", "총", "화기"],
    "armor": ["tank", "armored", "전차", "장갑"],
    "aircraft": ["aircraft", "plane", "fighter", "bomber", "항공기", "전투기", "폭격기"],
    "naval": ["ship", "submarine", "naval", "함선", "잠수함", "해군"],
    "artillery": ["artillery", "cannon", "rocket", "포", "대포", "로켓"],
    "melee": ["sword", "spear", "blade", "검", "창", "도검"],
    "defense": ["armor", "shield", "helmet", "갑옷", "방패", "투구"],
    "ranged": ["bow", "crossbow", "arrow", "활", "석궁", "화살"],
}


@dataclass(frozen=True)
class ExportResult:
    article_id: int
    category: str
    path: str


class FrontDataExporter:
    def __init__(self, settings: CrawlerSettings | None = None, store: ArticleStore | None = None) -> None:
        self.settings = settings or CrawlerSettings()
        self.store = store or ArticleStore(self.settings.database_path)
        self.front_data_path = self.settings.front_data_path

    def export_pending(self, limit: int = 50) -> list[ExportResult]:
        self.store.init_db()
        results: list[ExportResult] = []
        for row in self.store.list_unexported_articles(limit=limit):
            sentences = self.store.list_sentences(int(row["id"]))
            category = classify_article(row)
            target_path = self.write_article(row, sentences, category)
            self.store.mark_exported(int(row["id"]), str(target_path))
            results.append(ExportResult(article_id=int(row["id"]), category=category, path=str(target_path)))
        return results

    def write_article(self, row: Row, sentences: list[str], category: str) -> Path:
        folder = self.category_folder(category, row)
        folder.mkdir(parents=True, exist_ok=True)
        slug = unique_slug(folder, slugify(row["title"] or f"article-{row['id']}"))
        path = folder / f"{slug}.json"
        payload = build_payload(row, sentences, category, slug)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def category_folder(self, category: str, row: Row) -> Path:
        base = self.front_data_path / CATEGORY_FOLDERS.get(category, CATEGORY_FOLDERS["docs"])
        if category == "weapons":
            return base / choose_weapon_subfolder(row)
        if category == "undefine":
            return base / "Disputed Sources"
        return base


def classify_article(row: Row) -> str:
    text = article_text(row).lower()
    scores = {name: keyword_score(text, keywords) for name, keywords in TYPE_KEYWORDS.items()}
    if row["source_type"] in {"public-archive", "research-society", "journal-magazine", "magazine"}:
        scores["docs"] = scores.get("docs", 0) + 1
    best = max(scores.items(), key=lambda item: item[1])
    return best[0] if best[1] > 0 else "docs"


def build_payload(row: Row, sentences: list[str], category: str, slug: str) -> dict[str, Any]:
    title = normalize_text(row["title"] or "Untitled")
    paragraphs = paragraphize(row["content_text"], sentences)
    description = summarize_text(paragraphs, title)
    keywords = extract_keywords(title, row["content_text"])
    era = infer_label(article_text(row), ERA_KEYWORDS, "contemporary")
    region = infer_label(article_text(row), REGION_KEYWORDS, "global")
    source_reference = {
        "title": title,
        "author": row["source_name"],
        "year": "",
        "note": row["source_url"],
    }

    if category == "war":
        return {
            "id": slug,
            "name": title,
            "era": era,
            "region": region,
            "period": "",
            "summary": description,
            "belligerents": "",
            "location": "",
            "result": "",
            "resultType": "na",
            "tags": keywords,
            "detail": {
                "background": join_paragraphs(paragraphs[:2]),
                "causes": paragraphs[2:5],
                "phases": sections_from_paragraphs(paragraphs[5:9]),
                "majorBattles": [],
                "keyFigures": [],
                "casualties": {"side1": "", "side2": ""},
                "aftermath": "",
                "significance": description,
                "references": [source_reference],
            },
        }

    if category == "bio":
        return {
            "id": slug,
            "name": title,
            "title": "역사 인물",
            "role": "historical-figure",
            "era": era,
            "nationality": region,
            "lifespan": "",
            "summary": description,
            "portrait": "",
            "wars": [],
            "tags": keywords,
            "detail": {
                "earlyLife": paragraphs[0] if paragraphs else "",
                "achievements": [{"title": f"자료 문단 {index + 1}", "description": text} for index, text in enumerate(paragraphs[1:5])],
                "warsBattles": [],
                "leadership": "",
                "laterLife": "",
                "legacy": description,
                "evaluation": "",
                "anecdotes": [],
                "references": [source_reference],
            },
        }

    if category == "battle":
        return {
            "id": slug,
            "title": title,
            "titleKr": title,
            "era": era,
            "theater": region,
            "date": "",
            "location": "",
            "commanders": [],
            "forces": [],
            "casualties": [],
            "result": "",
            "description": description,
            "keywords": keywords,
            "terrain": "",
            "strategicSignificance": description,
            "infoBox": {
                "type": "전투 / 전역",
                "theater": region,
                "duration": "",
                "terrain": "",
                "keyWeapon": "",
                "outcome": "",
                "legacy": "",
            },
            "sections": sections_from_paragraphs(paragraphs),
            "images": [],
            "relatedBattles": [],
        }

    if category == "weapons":
        subfolder = choose_weapon_subfolder(row)
        return {
            "name": title,
            "nameEn": title,
            "image": "",
            "category": subfolder,
            "era": era,
            "origin": region,
            "period": "",
            "operators": [],
            "tags": keywords,
            "overview": paragraphs[:3],
            "specs": [],
            "history": paragraphs[3:6],
            "design": [],
            "operation": [],
            "combatRecord": [],
            "variants": [],
            "evaluation": paragraphs[6:8] or [description],
            "related": [],
            "references": [row["source_url"]],
        }

    if category == "tactics":
        return {
            "id": slug,
            "title": title,
            "titleKr": title,
            "era": era,
            "category": "tactics",
            "origin": region,
            "period": "",
            "region": region,
            "keyFigure": "",
            "description": description,
            "keywords": keywords,
            "infoBox": {
                "type": "전략 / 전술",
                "originNation": region,
                "firstUsed": "",
                "lastUsed": "",
                "mainWeapon": "",
                "idealTerrain": "",
                "weakness": "",
            },
            "sections": sections_from_paragraphs(paragraphs),
            "images": [],
            "relatedStrategies": [],
        }

    if category == "undefine":
        return {
            "id": slug,
            "name": title,
            "nameEn": title,
            "shelf": "Disputed Sources",
            "era": era,
            "origin": region,
            "status": "검토 대기",
            "tags": keywords,
            "summary": description,
            "credibility": 3,
            "discoveredDate": "",
            "content": paragraphs,
            "significance": description,
            "controversy": "크롤링 수집 자료. 원문 확인과 출처 검증 필요.",
            "relatedItems": [],
            "editorNote": f"자동 수집 출처: {row['source_name']} / {row['source_url']}",
        }

    return {
        "id": slug,
        "title": title,
        "titleKr": title,
        "coverImage": "",
        "type": "article",
        "era": era,
        "date": "",
        "author": row["source_name"],
        "origin": row["source_url"],
        "description": description,
        "keywords": keywords,
        "detail": {
            "background": paragraphs[0] if paragraphs else description,
            "originalText": join_paragraphs(paragraphs),
            "significance": description,
            "aftermath": "",
            "relatedDocuments": [],
            "physicalDescription": f"{row['source_type']} / {row['source_language']}",
            "references": [f"{row['source_name']}: {row['source_url']}"],
        },
    }


def choose_weapon_subfolder(row: Row) -> str:
    text = article_text(row).lower()
    scores = {folder: keyword_score(text, keywords) for folder, keywords in WEAPON_SUBFOLDERS.items()}
    best = max(scores.items(), key=lambda item: item[1])
    return best[0] if best[1] > 0 else "firearms"


def article_text(row: Row) -> str:
    return f"{row['title']} {row['content_text']} {row['source_name']} {row['source_type']}"


def keyword_score(text: str, keywords: list[str]) -> int:
    return sum(1 for keyword in keywords if keyword.lower() in text)


def infer_label(text: str, mapping: dict[str, list[str]], fallback: str) -> str:
    lowered = text.lower()
    scores = {label: keyword_score(lowered, keywords) for label, keywords in mapping.items()}
    best = max(scores.items(), key=lambda item: item[1])
    return best[0] if best[1] > 0 else fallback


def paragraphize(content_text: str, sentences: list[str]) -> list[str]:
    paragraphs = [normalize_text(part) for part in re.split(r"\n\s*\n", content_text or "") if normalize_text(part)]
    if paragraphs:
        return paragraphs
    return [normalize_text(sentence) for sentence in sentences if normalize_text(sentence)]


def sections_from_paragraphs(paragraphs: list[str]) -> list[dict[str, str]]:
    return [{"title": f"문단 {index + 1}", "content": paragraph} for index, paragraph in enumerate(paragraphs)]


def summarize_text(paragraphs: list[str], fallback: str) -> str:
    if not paragraphs:
        return fallback
    text = normalize_text(paragraphs[0])
    return text[:240] if len(text) <= 240 else f"{text[:239]}…"


def join_paragraphs(paragraphs: list[str]) -> str:
    return "\n\n".join(paragraphs)


def extract_keywords(title: str, content_text: str, limit: int = 8) -> list[str]:
    text = f"{title} {content_text}"
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}|[가-힣]{2,}", text)
    blocked = {
        "history",
        "article",
        "source",
        "that",
        "with",
        "from",
        "this",
        "자료",
        "역사",
        "기사",
        "출처",
    }
    counts: dict[str, int] = {}
    for token in tokens:
        key = token.lower()
        if key in blocked:
            continue
        counts[token] = counts.get(token, 0) + 1
    return [token for token, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]]


def slugify(value: str) -> str:
    lowered = value.lower()
    ascii_slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    if ascii_slug:
        return ascii_slug[:80]
    korean_slug = re.sub(r"[^0-9A-Za-z가-힣]+", "-", value).strip("-")
    return korean_slug[:80] or "article"


def unique_slug(folder: Path, base_slug: str) -> str:
    slug = base_slug
    counter = 2
    while (folder / f"{slug}.json").exists():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug
