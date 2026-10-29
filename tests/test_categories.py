import pytest

from custom_components.shopping_helper.logic.categories import categorize, resolve_order
from custom_components.shopping_helper.logic.parser import normalize_key


@pytest.mark.parametrize(
    ("name", "category"),
    [
        ("Zwiebeln", "produce"), ("Reis", "pasta"), ("Eier", "dairy"), ("Kokosmilch", "canned"),
        ("Milch", "dairy"), ("Paprikapulver", "spices"), ("Paprika", "produce"),
        ("Olivenöl", "oils"), ("Tomatenmark", "canned"), ("Hähnchenbrust", "meat"),
        ("Preiselbeeren", "produce"), ("Speiseeis", "frozen"), ("Spülmittel", "household"),
        ("Toilettenpapier", "drugstore"), ("Gemüsebrühe", "spices"), ("Irgendwas", "other"),
        ("Tofu, alle Sorten", "veggie"), ("Kidney-Bohnen, aus der Dose", "canned"),
        ("Tomatenpüree", "canned"), ("Erbsen, tiefgekühlt", "frozen"), ("Spinat, TK", "frozen"),
        ("Erbsen", "produce"), ("Glasnudeln", "pasta"), ("Dosenbier", "drinks"),
    ],
)
def test_categorize(name, category):
    assert categorize(name, normalize_key(name)) == category


def test_resolve_order_accepts_names_and_ids():
    order = resolve_order("Getränke\nproduce, Unbekannt")
    assert order[:2] == ["drinks", "produce"]
    assert order[-1] == "other"
    assert len(order) == len(set(order))
