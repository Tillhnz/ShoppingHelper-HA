from custom_components.shopping_helper.logic.categories import resolve_order
from custom_components.shopping_helper.logic.history import HistoryTracker
from custom_components.shopping_helper.logic.merge import SourceItem, merge_items


def src(entity, uid, summary, description=None, status="needs_action", cookidoo=False):
    return SourceItem(entity, entity.split(".")[1], uid, summary, description, status, cookidoo)


def _items(result):
    return {i["key"]: i for c in result["categories"] for i in c["items"]}


def test_merge_combines_cookidoo_and_own_items():
    result = merge_items(
        [
            src("todo.cookidoo_shopping_list", "1", "Zwiebeln", "2 Stück", cookidoo=True),
            src("todo.cookidoo_shopping_list", "2", "Mehl", "200 g", cookidoo=True),
            src("todo.shopping_list", "a", "1 kg Mehl"),
            src("todo.shopping_list", "b", "Zwiebel"),
            src("todo.shopping_list", "c", "Spülmittel"),
        ],
        resolve_order(None),
    )
    items = _items(result)
    assert items["mehl"]["quantity"] == "1,2 kg"
    assert items["mehl"]["cookidoo"] and items["mehl"]["own"]
    assert len(items["zwiebel"]["sources"]) == 2
    assert result["stats"]["total"] == 3
    assert result["stats"]["merged"] == 2
    ids = [c["id"] for c in result["categories"]]
    assert ids.index("produce") < ids.index("baking") < ids.index("household")


def test_checked_and_partial_state():
    result = merge_items(
        [
            src("todo.a", "1", "Milch", "1 l", status="completed"),
            src("todo.b", "2", "Milch", "500 ml"),
            src("todo.b", "3", "Butter", status="completed"),
        ],
        resolve_order(None),
    )
    items = _items(result)
    assert items["milch"]["partial"] and not items["milch"]["checked"]
    assert items["milch"]["quantity"] == "500 ml"  # only what is still open
    assert items["butter"]["checked"]
    assert result["stats"]["progress"] == 50


def test_category_override():
    result = merge_items([src("todo.a", "1", "Haferflocken")], resolve_order(None), {"haferflocke": "breakfast"})
    item = _items(result)["haferflocke"]
    assert item["category"] == "breakfast"
    assert item["category_overridden"]


def test_history_counts_added_and_done():
    tracker = HistoryTracker()
    tracker.update([src("todo.a", "1", "Milch")], "2026-10-24")  # first run seeds only
    assert tracker.daily["2026-10-24"]["added"] == 0
    tracker.update([src("todo.a", "1", "Milch", status="completed"), src("todo.a", "2", "Brot")], "2026-10-25")
    assert tracker.daily["2026-10-25"] == {"added": 1, "done": 1}
    export = tracker.export("2026-10-25", days=7)
    assert len(export["daily"]) == 7 and export["daily"][-1]["done"] == 1
    assert {t["name"] for t in export["top"]} == {"Milch", "Brot"}
    restored = HistoryTracker(tracker.as_dict())
    assert restored.seen == tracker.seen


def test_have_items_and_breakdown():
    result = merge_items(
        [
            src("todo.cookidoo", "1", "Salz", "1 Prise", status="completed", cookidoo=True),
            src("todo.cookidoo", "2", "Milch", "300 g", cookidoo=True),
            src("todo.own", "3", "2 l Milch"),
        ],
        resolve_order(None),
        have={("todo.cookidoo", "1")},
    )
    items = _items(result)
    assert items["salz"]["have"] and items["salz"]["checked"]
    milk = items["milch"]
    assert milk["mixed_units"] and milk["quantity"] == "2,3 l"
    assert [s["quantity"] for s in milk["sources"]] == ["300 g", "2 l"]
    assert result["stats"]["have"] == 1 and result["stats"]["bought"] == 0
