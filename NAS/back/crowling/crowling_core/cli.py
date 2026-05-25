from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import asdict
from pathlib import Path

from .crawler import TotalCrawler
from .extractors import extract_images, extract_media, extract_text, write_jsonl
from .front_index import generate_front_search_indexes
from .settings import CrawlerSettings, load_target_sites, save_target_sites
from .storage import CrawlingStore
from ..reconstructure.converter import ReconstructureRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="War Archive total crawling and refinement")
    parser.add_argument(
        "command",
        choices=["init", "total", "daemon", "publish", "index", "image", "media", "text", "list-sites", "list-raw"],
        help="command to run",
    )
    parser.add_argument("--database", type=Path, default=None, help="SQLite database path")
    parser.add_argument("--sites", type=Path, default=None, help="target site JSON path")
    parser.add_argument("--output", type=Path, default=None, help="refined JSONL output directory")
    parser.add_argument("--front-data", type=Path, default=None, help="public data directory for published JSON")
    parser.add_argument("--limit", type=int, default=None, help="page or row limit")
    parser.add_argument("--interval", type=int, default=None, help="daemon interval seconds")
    parser.add_argument("--no-publish", action="store_true", help="crawl only; do not publish to public data")
    return parser


def make_settings(args: argparse.Namespace) -> CrawlerSettings:
    base = CrawlerSettings()
    return CrawlerSettings(
        database_path=args.database or base.database_path,
        target_sites_path=args.sites or base.target_sites_path,
        output_path=args.output or base.output_path,
        front_data_path=args.front_data or base.front_data_path,
        page_limit=max(1, args.limit or base.page_limit),
        hourly_limit=base.hourly_limit,
        daemon_interval_seconds=base.daemon_interval_seconds,
        request_timeout=base.request_timeout,
        recent_days=base.recent_days,
        user_agent=base.user_agent,
    )


def main() -> None:
    args = build_parser().parse_args()
    settings = make_settings(args)
    store = CrawlingStore(settings.database_path)
    crawler = TotalCrawler(settings=settings, store=store)

    if args.command == "init":
        crawler.init()
        print_json({"database": str(settings.database_path), "sites": str(settings.target_sites_path), "output": str(settings.output_path)})
        return

    if args.command == "list-sites":
        print_json([asdict(site) for site in load_target_sites(settings.target_sites_path)])
        return

    if args.command == "list-raw":
        store.init_db()
        print_json([asdict(page) for page in store.list_raw_pages(limit=args.limit or settings.page_limit)])
        return

    if args.command == "total":
        result = crawler.run(limit=args.limit or settings.page_limit, refine=True)
        payload = {"crawl": asdict(result)}
        if not args.no_publish:
            payload["publish"] = publish_front_data(settings, limit=args.limit or settings.page_limit)
        print_json(payload)
        return

    if args.command == "publish":
        print_json(publish_front_data(settings, limit=args.limit or settings.hourly_limit))
        return

    if args.command == "index":
        print_json({"searchIndexes": generate_front_search_indexes(settings.front_data_path)})
        return

    if args.command == "daemon":
        interval = max(60, args.interval or settings.daemon_interval_seconds)
        limit = max(1, args.limit or settings.hourly_limit)
        while True:
            result = crawler.run(limit=limit, refine=True)
            payload = {"crawl": asdict(result), "intervalSeconds": interval, "pageLimit": limit}
            if not args.no_publish:
                payload["publish"] = publish_front_data(settings, limit=limit)
            print_json(payload)
            time.sleep(interval)

    store.init_db()
    pages = store.list_raw_pages(limit=args.limit or 1000)
    settings.output_path.mkdir(parents=True, exist_ok=True)
    if args.command == "image":
        assets = [asset for page in pages for asset in extract_images(page)]
        inserted = store.save_images(assets)
        write_jsonl(settings.output_path / "images.jsonl", assets)
        print_json({"pages": len(pages), "images": len(assets), "inserted": inserted, "output": str(settings.output_path / "images.jsonl")})
        return
    if args.command == "media":
        assets = [asset for page in pages for asset in extract_media(page)]
        inserted = store.save_media(assets)
        write_jsonl(settings.output_path / "media.jsonl", assets)
        print_json({"pages": len(pages), "media": len(assets), "inserted": inserted, "output": str(settings.output_path / "media.jsonl")})
        return
    if args.command == "text":
        assets = [extract_text(page) for page in pages]
        inserted = store.save_texts(assets)
        write_jsonl(settings.output_path / "texts.jsonl", assets)
        print_json({"pages": len(pages), "texts": len(assets), "inserted": inserted, "output": str(settings.output_path / "texts.jsonl")})


def print_json(payload) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def publish_front_data(settings: CrawlerSettings, limit: int | None = None) -> dict:
    runner = ReconstructureRunner(
        settings.database_path,
        settings.front_data_path,
        pending_only=True,
    )
    result = runner.run(limit=limit)
    search_counts = generate_front_search_indexes(settings.front_data_path) if result.written else {}
    return {
        "frontData": str(settings.front_data_path),
        "written": result.written,
        "skipped": result.skipped,
        "classified": result.classified,
        "searchIndexes": search_counts,
    }


if __name__ == "__main__":
    main()
