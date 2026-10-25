"""Regenerate demo/sample-data.json from the real merge logic: python3 demo/generate_sample.py"""
from datetime import date, timedelta
import json
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parent.parent
exec((ROOT / "tests/conftest.py").read_text(), {"__file__": str(ROOT / "tests/conftest.py")})
sys.path.insert(0, str(ROOT))

from custom_components.shopping_helper.logic.categories import resolve_order  # noqa: E402
from custom_components.shopping_helper.logic.history import HistoryTracker  # noqa: E402
from custom_components.shopping_helper.logic.merge import SourceItem, merge_items  # noqa: E402

C, Z, E = "todo.cookidoo_einkaufsliste", "todo.cookidoo_zusatzliche_einkaufe", "todo.einkaufsliste"
NAMES = {C: "Cookidoo Einkaufsliste", Z: "Cookidoo Zusätzliche Einkäufe", E: "Einkaufsliste"}


def s(e, u, summary, desc=None, status="needs_action"):
    return SourceItem(e, NAMES[e], u, summary, desc, status, e != E)


SOURCES = [
    s(C, "c1", "Zwiebeln", "2 Stück"), s(C, "c2", "Knoblauchzehen", "3 Stück"), s(C, "c3", "Mehl", "250 g"),
    s(C, "c4", "Butter", "120 g"), s(C, "c5", "Milch", "300 g"), s(C, "c6", "Parmesan", "60 g"),
    s(C, "c7", "Spaghetti", "500 g"), s(C, "c8", "Tomaten, passiert", "400 g"), s(C, "c9", "Olivenöl", "2 EL"),
    s(C, "c10", "Salz", "1 Prise", "completed"), s(C, "c11", "Basilikum", "1 Bund"),
    s(C, "c12", "Hähnchenbrustfilet", "400 g"), s(C, "c13", "Kokosmilch", "400 g"),
    s(C, "c14", "Currypaste, rot", "2 EL"), s(C, "c15", "Basmatireis", "200 g"),
    s(Z, "z1", "Küchenrolle"), s(E, "e1", "2 l Milch"), s(E, "e2", "Zwiebel"), s(E, "e3", "1 kg Mehl"),
    s(E, "e4", "Brötchen (6)"), s(E, "e5", "Spülmittel"), s(E, "e6", "Bananen"),
    s(E, "e7", "Joghurt", status="completed"), s(E, "e8", "Kaffee"), s(E, "e9", "Toilettenpapier"),
    s(E, "e10", "Mineralwasser 6x"), s(E, "e11", "Eier (10)"),
]

result = merge_items(SOURCES, resolve_order(None), {})
history = HistoryTracker()
random.seed(3)
today = date(2026, 10, 25)
for i in range(14):
    d = (today - timedelta(days=13 - i)).isoformat()
    history.daily[d] = {"added": random.randint(0, 9), "done": random.randint(0, 8)}
for name, count in [("Milch", 14), ("Zwiebeln", 11), ("Eier", 9), ("Bananen", 8), ("Butter", 7),
                    ("Mehl", 6), ("Kaffee", 5), ("Tomaten", 5), ("Brötchen", 4), ("Parmesan", 3)]:
    history.frequency[name.lower()] = {"name": name, "count": count}
result["history"] = history.export(today.isoformat())
result["lists"] = [
    {"entity_id": e, "name": NAMES[e], "cookidoo": e != E, "available": True, "default": e == E}
    for e in (C, Z, E)
]
result["updated"] = "2026-10-25T08:15:00Z"
(ROOT / "demo/sample-data.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
print("ok", result["stats"]["total"], "items")
