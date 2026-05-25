from __future__ import annotations

import time
from typing import Any

from .crawler import HistoryCrawler
from .front_exporter import FrontDataExporter
from .rate_limit import HourlyRateLimiter
from .settings import CrawlerSettings
from .storage import ArticleStore


class CrawlingDaemon:
    def __init__(self, settings: CrawlerSettings | None = None) -> None:
        self.settings = settings or CrawlerSettings()
        self.store = ArticleStore(self.settings.database_path)
        self.crawler = HistoryCrawler(settings=self.settings, store=self.store)
        self.exporter = FrontDataExporter(settings=self.settings, store=self.store)
        self.limiter = HourlyRateLimiter(
            state_path=self.settings.database_path.parent / "crawler-rate-limit.json",
            hourly_limit=self.settings.hourly_limit,
        )

    def run_forever(self, per_site: int | None = None, export_limit: int | None = None) -> None:
        while True:
            cycle = self.run_once(per_site=per_site, export_limit=export_limit)
            if cycle["remaining"] <= 0:
                sleep_for = self.limiter.seconds_until_reset()
            else:
                sleep_for = self.settings.daemon_interval_seconds
            print(cycle, flush=True)
            time.sleep(sleep_for)

    def run_once(self, per_site: int | None = None, export_limit: int | None = None) -> dict[str, Any]:
        remaining = self.limiter.remaining()
        saved_count = 0
        failed_count = 0
        if remaining > 0:
            crawl_result = self.crawler.run(per_site=per_site, total_limit=remaining)
            saved_count = len(crawl_result["saved"])
            failed_count = len(crawl_result["failed"])
            self.limiter.record(saved_count)
        exported = self.exporter.export_pending(limit=export_limit or self.settings.hourly_limit)
        return {
            "saved": saved_count,
            "failed": failed_count,
            "exported": len(exported),
            "remaining": self.limiter.remaining(),
            "hourly_limit": self.settings.hourly_limit,
        }
