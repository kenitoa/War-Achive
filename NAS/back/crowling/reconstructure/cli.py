from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

NAS_ROOT = Path(__file__).resolve().parents[3]

if __package__ in {None, ""}:
    ROOT = Path(__file__).resolve().parents[2]
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from crowling.reconstructure.converter import ReconstructureRunner
else:
    from .converter import ReconstructureRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert refined crawling data into front/data JSON files")
    parser.add_argument("--database", type=Path, default=NAS_ROOT / "back" / "crowling" / "data" / "raw-crawling.sqlite3")
    parser.add_argument("--front-data", type=Path, default=NAS_ROOT / "front" / "data")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--overwrite", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    runner = ReconstructureRunner(args.database, args.front_data, overwrite=args.overwrite)
    result = runner.run(limit=args.limit)
    print(json.dumps(asdict(result), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
