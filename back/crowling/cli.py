from __future__ import annotations

import argparse
import json
from pathlib import Path

from .daemon import CrawlingDaemon
from .crawler import HistoryCrawler
from .front_exporter import FrontDataExporter
from .settings import CrawlerSettings, DEFAULT_TARGET_SITES, save_target_sites
from .storage import ArticleStore


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="War Archive standalone history crawler")
    parser.add_argument("command", choices=["init", "run", "daemon", "export", "list-sites", "list-articles"], help="실행할 명령")
    parser.add_argument("--database", type=Path, default=None, help="SQLite DB 경로")
    parser.add_argument("--sites", type=Path, default=None, help="대상 사이트 JSON 경로")
    parser.add_argument("--front-data", type=Path, default=None, help="front/data 경로")
    parser.add_argument("--limit", type=int, default=None, help="전체 저장 기사 수")
    parser.add_argument("--per-site", type=int, default=None, help="사이트별 저장 기사 수")
    parser.add_argument("--recent-days", type=int, default=None, help="최근 기사로 인정할 일수")
    parser.add_argument("--hourly-limit", type=int, default=None, help="1시간 전체 크롤링 저장 상한")
    parser.add_argument("--interval", type=int, default=None, help="daemon 반복 간격(초)")
    return parser


def make_settings(args: argparse.Namespace) -> CrawlerSettings:
    base = CrawlerSettings()
    return CrawlerSettings(
        database_path=args.database or base.database_path,
        target_sites_path=args.sites or base.target_sites_path,
        front_data_path=args.front_data or base.front_data_path,
        article_limit=max(1, args.limit or base.article_limit),
        hourly_limit=max(1, args.hourly_limit or base.hourly_limit),
        daemon_interval_seconds=max(60, args.interval or base.daemon_interval_seconds),
        recent_article_days=max(1, args.recent_days or base.recent_article_days),
        request_timeout=base.request_timeout,
        user_agent=base.user_agent,
    )


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    settings = make_settings(args)
    store = ArticleStore(settings.database_path)

    if args.command == "init":
        store.init_db()
        if not settings.target_sites_path.exists():
            save_target_sites(DEFAULT_TARGET_SITES, settings.target_sites_path)
        settings.front_data_path.mkdir(parents=True, exist_ok=True)
        print(json.dumps({"database": str(settings.database_path), "sites": str(settings.target_sites_path), "front_data": str(settings.front_data_path)}, ensure_ascii=False, indent=2))
        return

    if args.command == "list-sites":
        from .settings import load_target_sites

        print(json.dumps(load_target_sites(settings.target_sites_path), ensure_ascii=False, indent=2))
        return

    if args.command == "list-articles":
        store.init_db()
        rows = store.list_articles(limit=args.limit or settings.article_limit)
        print(json.dumps([dict(row) for row in rows], ensure_ascii=False, indent=2))
        return

    if args.command == "export":
        exporter = FrontDataExporter(settings=settings, store=store)
        exported = exporter.export_pending(limit=args.limit or settings.article_limit)
        print(json.dumps([item.__dict__ for item in exported], ensure_ascii=False, indent=2))
        return

    if args.command == "daemon":
        daemon = CrawlingDaemon(settings=settings)
        daemon.run_forever(per_site=args.per_site, export_limit=args.limit or settings.hourly_limit)
        return

    crawler = HistoryCrawler(settings=settings, store=store)
    result = crawler.run(per_site=args.per_site, total_limit=args.limit or settings.article_limit)
    exported = FrontDataExporter(settings=settings, store=store).export_pending(limit=len(result["saved"]) or settings.article_limit)
    result["exported"] = [item.__dict__ for item in exported]
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
