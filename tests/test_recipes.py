from custom_components.shopping_helper.logic.merge import SourceItem
from custom_components.shopping_helper.logic.recipes import (
    Recipe,
    RecipeIngredient as I,
    build_recipes,
    match_ingredients,
)

E = "todo.cookidoo"


def item(uid, name, desc="", status="needs_action"):
    return SourceItem(E, "Cookidoo", uid, name, desc, status, True)


PASTA = Recipe("r1", "Spaghetti mit Tomatensauce", [I("Spaghetti", "500 g"), I("Zwiebeln", "1 Stück"), I("Salz", "1 Prise")])
CURRY = Recipe("r2", "Hähnchen-Curry", [I("Zwiebeln", "2 Stück"), I("Kokosmilch", "400 g")])
ITEMS = [
    item("a", "Spaghetti", "500 g"), item("b", "Zwiebeln", "1 Stück"), item("c", "Salz", "1 Prise", "completed"),
    item("d", "Zwiebeln", "2 Stück"), item("e", "Kokosmilch", "400 g", "completed"),
]


def test_same_ingredient_in_two_recipes_keeps_its_own_entry():
    matched = match_ingredients([PASTA, CURRY], ITEMS)
    assert [m.uid for m in matched[0]] == ["a", "b", "c"]
    assert [m.uid for m in matched[1]] == ["d", "e"]


def test_falls_back_to_name_and_quantity_when_order_differs():
    shuffled = [ITEMS[3], ITEMS[4], ITEMS[0], ITEMS[2], ITEMS[1]]
    matched = match_ingredients([PASTA, CURRY], shuffled)
    assert [m.uid for m in matched[0]] == ["a", "b", "c"]
    assert [m.uid for m in matched[1]] == ["d", "e"]


def test_cards_show_what_is_missing():
    cards = build_recipes(
        [PASTA, CURRY], ITEMS, have={(E, "c")}, hidden=set(), item_keys={(E, "b"): "zwiebel", (E, "d"): "zwiebel"}
    )
    pasta = next(c for c in cards if c["id"] == "r1")
    curry = next(c for c in cards if c["id"] == "r2")
    assert pasta["missing"] == 2 and pasta["have"] == 1 and not pasta["complete"]
    assert [i["state"] for i in pasta["ingredients"]] == ["open", "open", "have"]
    assert curry["missing"] == 1 and curry["ingredients"][0]["key"] == "zwiebel"
    assert cards[0]["missing"] and pasta["ingredients"][0]["emoji"] == "🍝"


def test_complete_recipes_go_last_and_unknown_ingredients_are_skipped():
    done = [item("x", "Mehl", "100 g", "completed")]
    cards = build_recipes(
        [Recipe("r3", "Teig", [I("Mehl", "100 g"), I("Wasser", "50 ml")]), PASTA],
        done + ITEMS[:3], have=set(), hidden=set(), item_keys={},
    )
    assert cards[-1]["id"] == "r3" and cards[-1]["complete"] and cards[-1]["total"] == 1
