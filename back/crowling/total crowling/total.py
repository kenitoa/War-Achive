from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowling.crowling_core import CrawlerSettings, CrawlingStore, TotalCrawler


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect raw War Archive crawling material")
    parser.add_argument("--database", type=Path, default=None)
    parser.add_argument("--sites", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    base = CrawlerSettings()
    settings = CrawlerSettings(
        database_path=args.database or base.database_path,
        target_sites_path=args.sites or base.target_sites_path,
        output_path=args.output or base.output_path,
        page_limit=max(1, args.limit or base.page_limit),
        request_timeout=base.request_timeout,
        recent_days=base.recent_days,
        user_agent=base.user_agent,
    )
    result = TotalCrawler(settings=settings, store=CrawlingStore(settings.database_path)).run(limit=settings.page_limit)
    print(json.dumps(asdict(result), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
