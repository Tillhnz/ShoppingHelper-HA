import pytest

from custom_components.shopping_helper.logic.parser import (
    Quantity,
    format_quantities,
    normalize_key,
    parse_entry,
    parse_number,
    sum_quantities,
)


@pytest.mark.parametrize(
    ("text", "expected"),
    [("1", 1), ("1,5", 1.5), ("1.5", 1.5), ("1/2", 0.5), ("1 1/2", 1.5), ("½", 0.5), ("1½", 1.5)],
)
def test_parse_number(text, expected):
    assert parse_number(text) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("summary", "description", "name", "quantities"),
    [
        ("Zwiebeln", "2 Stück", "Zwiebeln", [Quantity(2, "Stück")]),
        ("Mehl", "200 g", "Mehl", [Quantity(200, "g")]),
        ("500g Mehl", None, "Mehl", [Quantity(500, "g")]),
        ("Milch 1,5 l", None, "Milch", [Quantity(1.5, "l")]),
        ("2x Butter", None, "Butter", [Quantity(2, "Stück")]),
        ("Eier (10)", None, "Eier", [Quantity(10, "Stück")]),
        ("Olivenöl", "2 EL + 1 TL", "Olivenöl", [Quantity(2, "EL"), Quantity(1, "TL")]),
        ("Tomaten", "2-3", "Tomaten", [Quantity(3, "Stück")]),
        ("2 Stangen Lauch", None, "Lauch", [Quantity(2, "Stange")]),
        ("7Up", None, "7Up", []),
        ("Brot", None, "Brot", []),
    ],
)
def test_parse_entry(summary, description, name, quantities):
    parsed = parse_entry(summary, description)
    assert parsed.name == name
    assert parsed.quantities == quantities


def test_notes_are_kept():
    parsed = parse_entry("Petersilie", "nach Belieben")
    assert parsed.quantities == []
    assert parsed.notes == ["nach Belieben"]


@pytest.mark.parametrize(
    ("a", "b"),
    [("Zwiebeln", "Zwiebel"), ("Eier", "Ei"), ("Tomaten", "Tomate"), ("Bio Möhren", "Möhre"),
     ("Champignons", "Champignon"), ("Zwiebel, rot", "Zwiebeln")],
)
def test_normalize_key_matches_plural(a, b):
    assert normalize_key(a) == normalize_key(b)


def test_sum_quantities_converts_units():
    total = sum_quantities([Quantity(800, "g"), Quantity(0.5, "kg"), Quantity(2, "EL")])
    assert format_quantities(total) == "1,3 kg + 2 EL"
    assert format_quantities(sum_quantities([Quantity(250, "ml"), Quantity(0.25, "l")])) == "500 ml"


def test_mass_and_volume_are_combined():
    total = sum_quantities([Quantity(300, "g"), Quantity(2, "l")])
    assert format_quantities(total) == "2,3 l"
