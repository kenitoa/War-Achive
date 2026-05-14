from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowling.crowling_core import TotalCrawler

AutoPilotCrawler = TotalCrawler
HistoryCrawler = TotalCrawler
