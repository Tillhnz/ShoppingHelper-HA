"""Shopping history: what was added, what was bought and when.

Used for the charts, the statistics tab and the suggestions of frequently bought items.
Everything is plain JSON so it can be stored with Home Assistant's Store helper.
"""
from __future__ import annotations

from datetime import date, timedelta
import math
from statistics import median

from .categories import categorize
from .merge import SourceItem
from .parser import normalize_key, parse_entry

MAX_DAYS = 400  # daily counters (enough for a year of weekly / weekday charts)
MAX_FREQUENCY = 300
MAX_PURCHASE_DATES = 30
WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def _d(value: str) -> date:
    return date.fromisoformat(value)


class HistoryTracker:
    """Keeps daily counters, list frequency and purchases, serializable to JSON."""

    def __init__(self, data: dict | None = None) -> None:
        data = data or {}
        self.seen: dict[str, str] = dict(data.get("seen", {}))  # "entity|uid" -> status
        self.daily: dict[str, dict[str, int]] = dict(data.get("daily", {}))
        self.frequency: dict[str, dict] = dict(data.get("frequency", {}))
        # key -> {"name", "category", "dates": [iso, ...], "count", "cookidoo", "own"}
        self.purchases: dict[str, dict] = {k: dict(v) for k, v in data.get("purchases", {}).items()}
        self.snoozed: dict[str, str] = dict(data.get("snoozed", {}))  # key -> iso date until
        self.counted: dict[str, str] = dict(data.get("counted", {}))  # ident -> purchase date
        self.initialized: bool = bool(data.get("initialized", False))

    def as_dict(self) -> dict:
        return {
            "seen": self.seen,
            "daily": self.daily,
            "frequency": self.frequency,
            "purchases": self.purchases,
            "snoozed": self.snoozed,
            "counted": self.counted,
            "initialized": self.initialized,
        }

    # ------------------------------------------------------------------ tracking
    def update(
        self,
        sources: list[SourceItem],
        today: str,
        overrides: dict[str, str] | None = None,
        not_bought: set[str] | None = None,
    ) -> bool:
        """Compare with the last snapshot. Returns True when something changed.

        ``not_bought`` holds "entity|uid" idents checked as "already at home" – they
        are not counted as purchases.
        """
        overrides = overrides or {}
        not_bought = not_bought or set()
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
                    if src.done and ident not in not_bought:  # added and checked between two polls
                        day["done"] += 1
                        self._purchase(src, today, overrides, ident)
                if not src.done:
                    self._count(src)
                changed = True
            elif previous != src.status:
                if self.initialized:
                    if src.done:
                        if ident not in not_bought:
                            day["done"] += 1
                            self._purchase(src, today, overrides, ident)
                    elif self.counted.get(ident) == today:
                        self._unpurchase(src, today)
                        day["done"] = max(0, day["done"] - 1)
                        del self.counted[ident]
                changed = True
        if set(current) != set(self.seen):
            changed = True
        self.seen = current
        self.counted = {i: d for i, d in self.counted.items() if i in current}
        if not self.initialized:
            self.initialized = True
            changed = True
        self._prune(today)
        return changed

    @staticmethod
    def _key_name(src: SourceItem) -> tuple[str, str]:
        parsed = parse_entry(src.summary, src.description)
        return normalize_key(parsed.name), parsed.name

    def _count(self, src: SourceItem) -> None:
        key, name = self._key_name(src)
        entry = self.frequency.setdefault(key, {"name": name, "count": 0})
        entry["count"] += 1
        entry["name"] = name
        if len(self.frequency) > MAX_FREQUENCY:
            keep = sorted(self.frequency.items(), key=lambda kv: -kv[1]["count"])[:MAX_FREQUENCY]
            self.frequency = dict(keep)

    def _purchase(
        self, src: SourceItem, today: str, overrides: dict[str, str], ident: str | None = None
    ) -> None:
        if ident:
            self.counted[ident] = today
        key, name = self._key_name(src)
        entry = self.purchases.setdefault(
            key, {"name": name, "category": "other", "dates": [], "count": 0, "cookidoo": 0, "own": 0}
        )
        entry["name"] = name
        entry["category"] = overrides.get(key) or categorize(name, key)
        entry["count"] += 1
        entry["cookidoo" if src.is_cookidoo else "own"] += 1
        entry["dates"] = (entry["dates"] + [today])[-MAX_PURCHASE_DATES:]
        self.snoozed.pop(key, None)

    def _unpurchase(self, src: SourceItem, today: str) -> None:
        """Unchecked again on the same day: take the purchase back."""
        key, _ = self._key_name(src)
        entry = self.purchases.get(key)
        if not entry or not entry["dates"] or entry["dates"][-1] != today:
            return
        entry["dates"].pop()
        entry["count"] = max(0, entry["count"] - 1)
        field = "cookidoo" if src.is_cookidoo else "own"
        entry[field] = max(0, entry[field] - 1)
        if entry["count"] == 0:
            del self.purchases[key]

    def _prune(self, today: str) -> None:
        cutoff = (_d(today) - timedelta(days=MAX_DAYS)).isoformat()
        self.daily = {d: v for d, v in self.daily.items() if d >= cutoff}
        self.snoozed = {k: v for k, v in self.snoozed.items() if v > today}

    def snooze(self, key: str, today: str, days: int = 7) -> None:
        self.snoozed[key] = (_d(today) + timedelta(days=days)).isoformat()

    # ------------------------------------------------------------------ analysis
    @staticmethod
    def _interval(dates: list[str]) -> float | None:
        """Typical number of days between two purchases (median, ignores same-day repeats)."""
        days = sorted({_d(d) for d in dates})
        gaps = [(b - a).days for a, b in zip(days, days[1:])]
        return float(median(gaps)) if gaps else None

    def suggestions(self, today: str, open_keys: set[str], limit: int = 8) -> list[dict]:
        """Frequently bought items that are not on the list – most overdue first."""
        now = _d(today)
        result: list[dict] = []
        for key, p in self.purchases.items():
            if key in open_keys or key in self.snoozed or p["count"] < 2:
                continue
            interval = self._interval(p["dates"])
            last = max(p["dates"])
            since = (now - _d(last)).days
            if since < 1:
                continue  # just bought
            if interval:
                ratio = since / max(interval, 1)
                if ratio < 0.75:
                    continue
                reason = "fällig" if ratio >= 1 else "bald fällig"
            else:
                ratio, reason = 0.6, "oft gekauft"
            result.append(
                {
                    "key": key,
                    "name": p["name"],
                    "category": p.get("category", "other"),
                    "count": p["count"],
                    "interval": round(interval) if interval else None,
                    "days_since": since,
                    "reason": reason,
                    "score": round(min(ratio, 3) * math.log2(p["count"] + 1), 3),
                }
            )
        # items that were often on the list but never checked off here (e.g. history before
        # the purchase tracking existed) still make good suggestions
        known = {s["key"] for s in result}
        for key, f in self.frequency.items():
            if key in known or key in open_keys or key in self.snoozed or key in self.purchases:
                continue
            if f["count"] >= 3:
                result.append(
                    {
                        "key": key, "name": f["name"], "category": categorize(f["name"], key),
                        "count": f["count"], "interval": None, "days_since": None,
                        "reason": "oft auf der Liste", "score": round(0.4 * math.log2(f["count"] + 1), 3),
                    }
                )
        result.sort(key=lambda s: (-s["score"], s["name"]))
        return result[:limit]

    def names(self, limit: int = 150) -> list[str]:
        """Known product names for autocompletion, most used first."""
        scores: dict[str, tuple[int, str]] = {}
        for key, f in self.frequency.items():
            scores[key] = (f["count"], f["name"])
        for key, p in self.purchases.items():
            count = p["count"] + scores.get(key, (0, ""))[0]
            scores[key] = (count, p["name"])
        ordered = sorted(scores.values(), key=lambda v: (-v[0], v[1]))
        return [name for _, name in ordered[:limit]]

    def statistics(self, today: str, weeks: int = 12) -> dict:
        now = _d(today)
        # weekly bought / added
        monday = now - timedelta(days=now.weekday())
        weekly = []
        for w in range(weeks - 1, -1, -1):
            start = monday - timedelta(weeks=w)
            bought = added = 0
            for i in range(7):
                values = self.daily.get((start + timedelta(days=i)).isoformat())
                if values:
                    bought += values["done"]
                    added += values["added"]
            weekly.append({"week": start.isoformat(), "bought": bought, "added": added})

        # weekday pattern and trips (days with at least one purchase) – last 90 days
        cutoff90 = (now - timedelta(days=89)).isoformat()
        cutoff30 = (now - timedelta(days=29)).isoformat()
        weekday = [0] * 7
        trips90 = trips30 = bought30 = 0
        for d, values in self.daily.items():
            if d < cutoff90 or not values["done"]:
                continue
            weekday[_d(d).weekday()] += values["done"]
            trips90 += 1
            if d >= cutoff30:
                trips30 += 1
                bought30 += values["done"]

        # categories & sources from purchases of the last 90 days
        categories: dict[str, int] = {}
        cookidoo = own = 0
        top = []
        for key, p in self.purchases.items():
            recent = [d for d in p["dates"] if d >= cutoff90]
            if recent:
                cat = p.get("category", "other")
                categories[cat] = categories.get(cat, 0) + len(recent)
            cookidoo += p.get("cookidoo", 0)
            own += p.get("own", 0)
            interval = self._interval(p["dates"])
            top.append(
                {
                    "key": key, "name": p["name"], "count": p["count"],
                    "interval": round(interval) if interval else None,
                    "last": max(p["dates"]) if p["dates"] else None,
                    "category": p.get("category", "other"),
                }
            )
        top.sort(key=lambda t: (-t["count"], t["name"]))

        total = cookidoo + own
        first = min(self.daily) if self.daily else today
        return {
            "kpis": {
                "bought_30d": bought30,
                "trips_30d": trips30,
                "avg_per_trip": round(bought30 / trips30, 1) if trips30 else 0,
                "cookidoo_share": round(cookidoo / total * 100) if total else 0,
                "total_purchases": total,
                "distinct_items": len(self.purchases),
                "tracking_since": first,
                "favorite_weekday": WEEKDAYS[weekday.index(max(weekday))] if any(weekday) else None,
            },
            "weekly": weekly,
            "weekday": [{"day": WEEKDAYS[i], "bought": weekday[i]} for i in range(7)],
            "categories": dict(sorted(categories.items(), key=lambda kv: -kv[1])),
            "sources": {"cookidoo": cookidoo, "own": own},
            "top": top[:12],
        }

    def export(self, today: str, days: int = 14, top: int = 10) -> dict:
        start = _d(today)
        series = []
        for offset in range(days - 1, -1, -1):
            d = (start - timedelta(days=offset)).isoformat()
            values = self.daily.get(d, {"added": 0, "done": 0})
            series.append({"date": d, "added": values["added"], "done": values["done"]})
        top_items = sorted(self.frequency.values(), key=lambda v: (-v["count"], v["name"]))[:top]
        return {"daily": series, "top": top_items}
