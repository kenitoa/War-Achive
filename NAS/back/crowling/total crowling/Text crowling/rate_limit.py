from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class HourlyRateLimiter:
    state_path: Path
    hourly_limit: int

    def load(self) -> dict[str, int]:
        if not self.state_path.exists():
            return {"window_start": int(time.time()), "count": 0}
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"window_start": int(time.time()), "count": 0}
        return {
            "window_start": int(data.get("window_start", int(time.time()))),
            "count": int(data.get("count", 0)),
        }

    def state(self) -> dict[str, int]:
        data = self.load()
        now = int(time.time())
        if now - data["window_start"] >= 3600:
            data = {"window_start": now, "count": 0}
            self.save(data)
        return data

    def remaining(self) -> int:
        data = self.state()
        return max(0, self.hourly_limit - data["count"])

    def seconds_until_reset(self) -> int:
        data = self.state()
        return max(1, 3600 - (int(time.time()) - data["window_start"]))

    def record(self, amount: int) -> None:
        if amount <= 0:
            return
        data = self.state()
        data["count"] = min(self.hourly_limit, data["count"] + amount)
        self.save(data)

    def save(self, data: dict[str, int]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
