from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ClassifiedRecord:
    category: str
    subcategory: str = ""
    score: int = 0


CATEGORY_RULES: dict[str, list[str]] = {
    "biography of people data": [
        "born",
        "died",
        "general",
        "commander",
        "emperor",
        "president",
        "leader",
        "king",
        "queen",
        "admiral",
        "marshal",
        "napoleon",
        "churchill",
        "lincoln",
        "hannibal",
        "saladin",
        "yi sun",
    ],
    "Battlefield Map data": [
        "battle of",
        "siege of",
        "campaign",
        "front",
        "theater",
        "battlefield",
        "terrain",
        "naval battle",
        "offensive",
        "defensive line",
    ],
    "weapons and equipment data": [
        "weapon",
        "tank",
        "rifle",
        "gun",
        "artillery",
        "aircraft",
        "ship",
        "armor",
        "armour",
        "sword",
        "bow",
        "missile",
        "howitzer",
        "helmet",
        "shield",
    ],
    "strategy and tactics data": [
        "strategy",
        "tactic",
        "doctrine",
        "formation",
        "warfare",
        "counterinsurgency",
        "blitzkrieg",
        "guerrilla",
        "envelopment",
        "phalanx",
        "line infantry",
    ],
    "Historical Sources & Documents data": [
        "charter",
        "treaty",
        "document",
        "diary",
        "letter",
        "speech",
        "memo",
        "record",
        "proclamation",
        "declaration",
        "convention",
        "testimony",
        "archive",
    ],
    "war overview data": [
        "war",
        "world war",
        "civil war",
        "crusade",
        "invasion",
        "conflict",
        "revolution",
        "conquest",
    ],
    "Undefine facts data": [
        "unknown",
        "unidentified",
        "disputed",
        "legend",
        "myth",
        "classified",
        "declassified",
        "incomplete",
        "mystery",
        "controversy",
    ],
}


WEAPON_SUBCATEGORIES: dict[str, list[str]] = {
    "aircraft": ["aircraft", "fighter", "bomber", "plane", "helicopter", "spitfire", "mustang"],
    "armor": ["tank", "armored", "armoured", "panzer", "sherman", "t-34", "tiger"],
    "artillery": ["artillery", "howitzer", "rocket", "mortar", "cannon"],
    "defense": ["armor", "armour", "helmet", "shield", "fortification", "plate armor"],
    "firearms": ["rifle", "gun", "machine gun", "pistol", "ak-47", "m16", "firearm"],
    "melee": ["sword", "katana", "gladius", "spear", "lance", "melee"],
    "naval": ["ship", "naval", "submarine", "u-boat", "battleship", "destroyer"],
    "ranged": ["bow", "longbow", "crossbow", "arrow", "sling"],
}


UNDEFINE_SHELVES: dict[str, list[str]] = {
    "Data status": ["status", "fragment", "uncertain"],
    "Declassified Files": ["classified", "declassified", "secret", "cia", "file"],
    "Disputed Sources": ["disputed", "forgery", "source", "controversy"],
    "Incomplete Records": ["incomplete", "lost", "missing", "record"],
    "Legends and Myths": ["legend", "myth", "mythology", "folklore"],
    "Oral Traditions": ["oral", "tradition", "tale", "story"],
    "Unidentified Documents": ["unidentified", "unknown", "manuscript", "document"],
}


def classify_record(title: str, text: str, source_url: str = "") -> ClassifiedRecord:
    haystack = f"{title}\n{text}\n{source_url}".lower()
    scores = {
        category: sum(3 if keyword in title.lower() else 1 for keyword in keywords if keyword in haystack)
        for category, keywords in CATEGORY_RULES.items()
    }
    category, score = max(scores.items(), key=lambda item: item[1])
    if score <= 0:
        return ClassifiedRecord("Undefine facts data", "Data status", 0)
    if category == "weapons and equipment data":
        return ClassifiedRecord(category, best_subcategory(haystack, WEAPON_SUBCATEGORIES, "armor"), score)
    if category == "Undefine facts data":
        return ClassifiedRecord(category, best_subcategory(haystack, UNDEFINE_SHELVES, "Data status"), score)
    return ClassifiedRecord(category, "", score)


def best_subcategory(haystack: str, rules: dict[str, list[str]], fallback: str) -> str:
    scores = {name: sum(1 for keyword in keywords if keyword in haystack) for name, keywords in rules.items()}
    name, score = max(scores.items(), key=lambda item: item[1])
    return name if score > 0 else fallback
