from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crowling.crowling_core.cli import main as core_main


def main() -> None:
    sys.argv = [sys.argv[0], "media", *sys.argv[1:]]
    core_main()


if __name__ == "__main__":
    main()
