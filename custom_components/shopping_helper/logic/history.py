"""Track additions / completions over time for the statistics charts."""
from __future__ import annotations

from datetime import date, timedelta

from .merge import SourceItem
from .parser import normalize_key, parse_entry

MAX_DAYS = 90
MAX_FREQUENCY = 300


class HistoryTracker:
    """Keeps daily counters and purchase frequency, serializable to JSON."""

    def __init__(self, data: dict | None = None) -> None:
        data = data or {}
        self.seen: dict[str, str] = dict(data.get("seen", {}))  # "entity|uid" -> status
        self.daily: dict[str, dict[str, int]] = dict(data.get("daily", {}))
        self.frequency: dict[str, dict] = dict(data.get("frequency", {}))
        self.initialized: bool = bool(data.get("initialized", False))

    def as_dict(self) -> dict:
        return {
            "seen": self.seen,
            "daily": self.daily,
            "frequency": self.frequency,
            "initialized": self.initialized,
        }

    def update(self, sources: list[SourceItem], today: str) -> bool:
        """Compare with the last snapshot. Returns True when something changed."""
        changed = False
        current: dict[str, str] = {}
        day = self.daily.setdefault(today, {"added": 0, "done": 0})
        for src in sources:
            ident = f"{src.entity_id}|{src.uid}"
            current[ident] = src.status
            previous = self.seen.get(ident)
            if previous is None:
                if self.initialized:
                    day["added"] += 1
                if not src.done:
                    self._count(src)
                changed = True
            elif previous != src.status:
                if src.done and self.initialized:
                    day["done"] += 1
                changed = True
        if set(current) != set(self.seen):
            changed = True
        self.seen = current
        if not self.initialized:
            self.initialized = True
            changed = True
        self._prune(today)
        return changed

    def _count(self, src: SourceItem) -> None:
        parsed = parse_entry(src.summary, src.description)
        key = normalize_key(parsed.name)
        entry = self.frequency.setdefault(key, {"name": parsed.name, "count": 0})
        entry["count"] += 1
        entry["name"] = parsed.name
        if len(self.frequency) > MAX_FREQUENCY:
            keep = sorted(self.frequency.items(), key=lambda kv: -kv[1]["count"])[:MAX_FREQUENCY]
            self.frequency = dict(keep)

    def _prune(self, today: str) -> None:
        cutoff = (date.fromisoformat(today) - timedelta(days=MAX_DAYS)).isoformat()
        self.daily = {d: v for d, v in self.daily.items() if d >= cutoff}

    def export(self, today: str, days: int = 14, top: int = 10) -> dict:
        start = date.fromisoformat(today)
        series = []
        for offset in range(days - 1, -1, -1):
            d = (start - timedelta(days=offset)).isoformat()
            values = self.daily.get(d, {"added": 0, "done": 0})
            series.append({"date": d, "added": values["added"], "done": values["done"]})
        top_items = sorted(self.frequency.values(), key=lambda v: (-v["count"], v["name"]))[:top]
        return {"daily": series, "top": top_items}
