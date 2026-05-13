from __future__ import annotations

from typing import Any


HISTORY_TARGET_SITES: list[dict[str, Any]] = [
    {
        "name": "Smithsonian Magazine - History",
        "base_url": "https://www.smithsonianmag.com",
        "source_type": "magazine",
        "language": "en",
        "topics": ["history", "archaeology", "culture", "science-history"],
        "feeds": [
            "https://www.smithsonianmag.com/category/history/",
            "https://www.smithsonianmag.com/category/archaeology/",
            "https://www.smithsonianmag.com/rss/history-archaeology/",
        ],
        "article_patterns": [
            r"/history/[^/]+/",
            r"/smart-news/[^/]+/",
            r"/science-nature/[^/]+/",
        ],
        "listing_patterns": [
            r"/category/history/",
            r"/category/archaeology/",
        ],
    },
    {
        "name": "JSTOR Daily - History",
        "base_url": "https://daily.jstor.org",
        "source_type": "journal-magazine",
        "language": "en",
        "topics": ["history", "archive", "research"],
        "feeds": [
            "https://daily.jstor.org/category/history/feed/",
            "https://daily.jstor.org/category/history/",
        ],
        "article_patterns": [
            r"/[^/?#]+/",
        ],
        "listing_patterns": [
            r"/category/history/",
        ],
    },
    {
        "name": "History Today",
        "base_url": "https://www.historytoday.com",
        "source_type": "journal-magazine",
        "language": "en",
        "topics": ["history", "essays", "reviews"],
        "feeds": [
            "https://www.historytoday.com/",
            "https://www.historytoday.com/archive",
        ],
        "article_patterns": [
            r"/archive/[^/]+/[^/]+",
            r"/[^/]+/[^/]+",
        ],
        "listing_patterns": [
            r"/archive",
            r"/period/",
            r"/topic/",
        ],
    },
    {
        "name": "HistoryExtra",
        "base_url": "https://www.historyextra.com",
        "source_type": "magazine-channel",
        "language": "en",
        "topics": ["history", "podcast", "features"],
        "feeds": [
            "https://www.historyextra.com/",
            "https://www.historyextra.com/period/",
        ],
        "article_patterns": [
            r"/period/[^/]+/[^/]+/",
            r"/topic/[^/]+/[^/]+/",
            r"/[^/]+/[^/]+/",
        ],
        "listing_patterns": [
            r"/period/",
            r"/topic/",
        ],
    },
    {
        "name": "World History Encyclopedia",
        "base_url": "https://www.worldhistory.org",
        "source_type": "encyclopedia",
        "language": "en",
        "topics": ["ancient-history", "civilization", "encyclopedia"],
        "feeds": [
            "https://www.worldhistory.org/",
            "https://www.worldhistory.org/article/",
        ],
        "article_patterns": [
            r"/article/\d+/[^/]+/",
            r"/trans/[^/]+/",
        ],
        "listing_patterns": [
            r"/article/",
            r"/trans/",
        ],
    },
    {
        "name": "The National WWII Museum",
        "base_url": "https://www.nationalww2museum.org",
        "source_type": "museum",
        "language": "en",
        "topics": ["world-war-ii", "museum", "articles"],
        "feeds": [
            "https://www.nationalww2museum.org/war/articles",
            "https://www.nationalww2museum.org/war",
        ],
        "article_patterns": [
            r"/war/articles/[^/]+",
        ],
        "listing_patterns": [
            r"/war/articles",
        ],
    },
    {
        "name": "American Battlefield Trust",
        "base_url": "https://www.battlefields.org",
        "source_type": "heritage-organization",
        "language": "en",
        "topics": ["battlefield", "civil-war", "american-revolution"],
        "feeds": [
            "https://www.battlefields.org/learn/articles",
            "https://www.battlefields.org/learn",
        ],
        "article_patterns": [
            r"/learn/articles/[^/]+",
            r"/learn/[^/]+/[^/]+",
        ],
        "listing_patterns": [
            r"/learn/articles",
            r"/learn",
        ],
    },
    {
        "name": "Ancient Origins",
        "base_url": "https://www.ancient-origins.net",
        "source_type": "magazine",
        "language": "en",
        "topics": ["ancient-history", "archaeology", "myth"],
        "feeds": [
            "https://www.ancient-origins.net/",
            "https://www.ancient-origins.net/news-history-archaeology",
        ],
        "article_patterns": [
            r"/news-history-archaeology/[^/]+",
            r"/history/[^/]+",
            r"/ancient-places/[^/]+",
        ],
        "listing_patterns": [
            r"/news-history-archaeology",
            r"/history",
            r"/ancient-places",
        ],
    },
    {
        "name": "Lapham's Quarterly - History",
        "base_url": "https://www.laphamsquarterly.org",
        "source_type": "journal-magazine",
        "language": "en",
        "topics": ["history", "culture", "primary-sources"],
        "feeds": [
            "https://www.laphamsquarterly.org/",
            "https://www.laphamsquarterly.org/roundtable",
        ],
        "article_patterns": [
            r"/roundtable/[^/]+",
            r"/[^/]+/[^/]+",
        ],
        "listing_patterns": [
            r"/roundtable",
        ],
    },
    {
        "name": "The Collector - History",
        "base_url": "https://www.thecollector.com",
        "source_type": "magazine",
        "language": "en",
        "topics": ["history", "art-history", "ancient-history"],
        "feeds": [
            "https://www.thecollector.com/category/history/",
            "https://www.thecollector.com/category/art/",
        ],
        "article_patterns": [
            r"/[^/]+/",
        ],
        "listing_patterns": [
            r"/category/history/",
            r"/category/art/",
        ],
    },
    {
        "name": "한국역사연구회",
        "base_url": "https://www.koreanhistory.org",
        "source_type": "research-society",
        "language": "ko",
        "topics": ["korean-history", "research", "articles"],
        "feeds": [
            "https://www.koreanhistory.org/",
        ],
        "article_patterns": [
            r"/\d+",
            r"/archives/\d+",
            r"/board/[^/]+/\d+",
        ],
        "listing_patterns": [
            r"/archives",
            r"/board",
        ],
    },
    {
        "name": "우리역사넷",
        "base_url": "http://contents.history.go.kr",
        "source_type": "public-archive",
        "language": "ko",
        "topics": ["korean-history", "archive", "education"],
        "feeds": [
            "http://contents.history.go.kr/front",
        ],
        "article_patterns": [
            r"/front/[^?]+\?levelId=[^&]+",
            r"/mobile/[^?]+\?levelId=[^&]+",
        ],
        "listing_patterns": [
            r"/front",
            r"/mobile",
        ],
    },
]
