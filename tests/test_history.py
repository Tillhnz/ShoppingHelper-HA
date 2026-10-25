from custom_components.shopping_helper.logic.history import HistoryTracker
from custom_components.shopping_helper.logic.merge import SourceItem


def src(uid, summary, status="needs_action", cookidoo=False, entity="todo.list"):
    return SourceItem(entity, "Liste", uid, summary, None, status, cookidoo)


def _buy(tracker, uid, name, day, cookidoo=False):
    """Item appears open, then is checked off on the same day."""
    tracker.update([src(uid, name, cookidoo=cookidoo)], day)
    tracker.update([src(uid, name, "completed", cookidoo)], day)
    tracker.update([], day)  # removed from the list afterwards


def _tracker():
    t = HistoryTracker()
    t.update([], "2026-07-01")  # first run only seeds
    return t


def test_purchases_and_interval():
    t = _tracker()
    for i, day in enumerate(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]):
        _buy(t, f"m{i}", "Milch", day)
    p = t.purchases["milch"]
    assert p["count"] == 4 and p["category"] == "dairy"
    assert t._interval(p["dates"]) == 7


def test_suggestion_due_and_not_on_list():
    t = _tracker()
    for i, day in enumerate(["2026-09-01", "2026-09-08", "2026-09-15"]):
        _buy(t, f"m{i}", "Milch", day)
    assert t.suggestions("2026-09-18", set()) == []  # 3 of 7 days – not due yet
    due = t.suggestions("2026-09-23", set())
    assert due[0]["name"] == "Milch" and due[0]["reason"] == "fällig"
    assert t.suggestions("2026-09-23", {"milch"}) == []  # already on the list
    t.snooze("milch", "2026-09-23", 7)
    assert t.suggestions("2026-09-25", set()) == []


def test_uncheck_same_day_takes_purchase_back():
    t = _tracker()
    t.update([src("a", "Brot")], "2026-09-01")
    t.update([src("a", "Brot", "completed")], "2026-09-01")
    t.update([src("a", "Brot")], "2026-09-01")
    assert "brot" not in t.purchases
    assert t.daily["2026-09-01"]["done"] == 0


def test_statistics():
    t = _tracker()
    _buy(t, "1", "Milch", "2026-10-19", cookidoo=False)  # Monday
    _buy(t, "2", "Mehl", "2026-10-19", cookidoo=True)
    _buy(t, "3", "Milch", "2026-10-24")  # Saturday
    stats = t.statistics("2026-10-25")
    k = stats["kpis"]
    assert k["bought_30d"] == 3 and k["trips_30d"] == 2 and k["avg_per_trip"] == 1.5
    assert k["cookidoo_share"] == 33 and k["favorite_weekday"] == "Mo"
    assert stats["weekly"][-1]["bought"] == 3
    assert stats["categories"] == {"dairy": 2, "baking": 1}
    assert stats["top"][0]["name"] == "Milch"
    assert "Milch" in t.names()


def test_old_storage_format_still_loads():
    t = HistoryTracker({"seen": {}, "daily": {}, "frequency": {"ei": {"name": "Eier", "count": 4}}, "initialized": True})
    assert t.purchases == {} and t.suggestions("2026-10-25", set())[0]["reason"] == "oft auf der Liste"


def test_items_at_home_are_not_purchases():
    t = _tracker()
    t.update([src("a", "Salz")], "2026-09-01")
    t.update([src("a", "Salz", "completed")], "2026-09-01", not_bought={"todo.list|a"})
    assert "salz" not in t.purchases and t.daily["2026-09-01"]["done"] == 0
    # a second "Salz" on another list is really bought ...
    nb = {"todo.list|a"}
    t.update([src("a", "Salz", "completed"), src("b", "Salz")], "2026-09-01", not_bought=nb)
    t.update([src("a", "Salz", "completed"), src("b", "Salz", "completed")], "2026-09-01", not_bought=nb)
    assert t.purchases["salz"]["count"] == 1
    # ... and putting the "at home" one back on the list must not undo that purchase
    t.update([src("a", "Salz"), src("b", "Salz", "completed")], "2026-09-01")
    assert t.purchases["salz"]["count"] == 1
