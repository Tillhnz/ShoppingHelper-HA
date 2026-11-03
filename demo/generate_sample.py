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
from custom_components.shopping_helper.logic.recipes import Recipe, RecipeIngredient as I, build_recipes  # noqa: E402

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
    s(C, "c16", "Zwiebeln", "1 Stück"), s(C, "c17", "Knoblauchzehen", "2 Stück", "completed"),
    s(C, "c18", "Butter", "100 g", "completed"),
    s(Z, "z1", "Küchenrolle"), s(E, "e1", "2 l Milch"), s(E, "e2", "Zwiebel"), s(E, "e3", "1 kg Mehl"),
    s(E, "e4", "Brötchen (6)"), s(E, "e5", "Spülmittel"), s(E, "e6", "Bananen"),
    s(E, "e7", "Joghurt", status="completed"), s(E, "e8", "Kaffee"), s(E, "e9", "Toilettenpapier"),
    s(E, "e10", "Mineralwasser 6x"), s(E, "e11", "Eier (10)"),
]

# ---- simulate ~4 months of shopping so history, suggestions and statistics look real
random.seed(7)
today = date(2026, 10, 25)
REGULARS = {  # name -> (typical days between purchases, cookidoo?)
    "Milch": (5, False), "Bananen": (6, False), "Brötchen": (7, False), "Eier": (9, False),
    "Butter": (10, False), "Kaffee": (14, False), "Joghurt": (6, False), "Äpfel": (8, False),
    "Toilettenpapier": (21, False), "Spülmittel": (28, False), "Käse": (8, False),
    "Zwiebeln": (9, True), "Knoblauch": (16, True), "Mehl": (18, True), "Parmesan": (15, True),
    "Tomaten": (7, True), "Sahne": (11, True), "Reis": (20, True), "Haferflocken": (12, False),
    "Mineralwasser": (7, False),
}
history = HistoryTracker()
start = today - timedelta(days=120)
history.update([], start.isoformat())
next_due = {n: start + timedelta(days=random.randint(0, iv)) for n, (iv, _) in REGULARS.items()}
uid = 0
day = start
while day < today - timedelta(days=6):
    day += timedelta(days=random.choice([2, 3, 3, 4, 5]))
    if day >= today:
        break
    basket = [n for n, due in next_due.items() if due <= day]
    items = []
    for n in basket:
        uid += 1
        items.append(SourceItem(C if REGULARS[n][1] else E, "", f"h{uid}", n, None, "needs_action", REGULARS[n][1]))
    iso = day.isoformat()
    added_day = (day - timedelta(days=1)).isoformat()
    history.update(items, added_day)
    history.update([SourceItem(**{**i.__dict__, "status": "completed"}) for i in items], iso)
    history.update([], iso)
    for n in basket:
        iv = REGULARS[n][0]
        next_due[n] = day + timedelta(days=max(1, round(random.gauss(iv, iv * 0.2))))

HAVE = {(C, "c10"), (C, "c17")}  # Salz, Knoblauch: already at home
result = merge_items(SOURCES, resolve_order(None), {}, HAVE)
RECIPES = [
    Recipe("r1", "Spaghetti mit Tomatensauce", [
        I("Spaghetti", "500 g"), I("Tomaten, passiert", "400 g"), I("Zwiebeln", "2 Stück"),
        I("Knoblauchzehen", "3 Stück"), I("Olivenöl", "2 EL"), I("Basilikum", "1 Bund"),
        I("Parmesan", "60 g"), I("Salz", "1 Prise")]),
    Recipe("r2", "Hähnchen-Curry mit Basmatireis", [
        I("Hähnchenbrustfilet", "400 g"), I("Kokosmilch", "400 g"), I("Currypaste, rot", "2 EL"),
        I("Basmatireis", "200 g"), I("Zwiebeln", "1 Stück")]),
    Recipe("r3", "Béchamelsauce", [I("Mehl", "250 g"), I("Butter", "120 g"), I("Milch", "300 g")]),
    Recipe("r4", "Knoblauchbutter", [I("Knoblauchzehen", "2 Stück"), I("Butter", "100 g")]),
]
for r in RECIPES:
    r.url = f"https://cookidoo.de/recipes/recipe/de-DE/{r.id}"
item_keys = {(src["entity_id"], src["uid"]): it["key"]
             for c in result["categories"] for it in c["items"] for src in it["sources"]}
result["recipes"] = {"status": "ok", "items": build_recipes(
    RECIPES, [x for x in SOURCES if x.entity_id == C], HAVE, set(), item_keys)}
open_keys = {i["key"] for c in result["categories"] for i in c["items"] if not i["checked"]}
result["history"] = history.export(today.isoformat())
result["suggestions"] = history.suggestions(today.isoformat(), open_keys)
result["statistics"] = history.statistics(today.isoformat())
result["known_names"] = history.names()
result["lists"] = [
    {"entity_id": e, "name": NAMES[e], "cookidoo": e != E, "available": True, "default": e == E,
     "can_add": e != C}
    for e in (C, Z, E)
]
result["updated"] = "2026-10-25T08:15:00Z"
(ROOT / "demo/sample-data.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
(ROOT / "demo/sample-data.js").write_text(
    "window.SHOPPING_HELPER_SAMPLE = " + json.dumps(result, ensure_ascii=False) + ";\n", encoding="utf-8"
)
print("ok", result["stats"]["total"], "items,", len(result["suggestions"]), "suggestions")
print([(s["name"], s["reason"], s["interval"], s["days_since"]) for s in result["suggestions"]])
print(result["statistics"]["kpis"])
