import pytest

from custom_components.shopping_helper.logic.categories import categorize
from custom_components.shopping_helper.logic.icons import emoji_for
from custom_components.shopping_helper.logic.parser import normalize_key


@pytest.mark.parametrize(
    ("name", "emoji"),
    [
        ("Zwiebeln", "🧅"), ("Milch", "🥛"), ("Kokosmilch", "🥥"), ("Olivenöl", "🫒"), ("Eier", "🥚"),
        ("Basmatireis", "🍚"), ("Weintrauben", "🍇"), ("Speiseeis", "🍦"), ("Toilettenpapier", "🧻"),
        ("Tomaten, passiert", "🍅"), ("Hähnchenbrustfilet", "🍗"),
    ],
)
def test_emoji_for(name, emoji):
    key = normalize_key(name)
    assert emoji_for(name, key, categorize(name, key)) == emoji


def test_unknown_products_use_the_category_symbol():
    assert emoji_for("Irgendwas", "irgendwas", "other") == "🛒"
    assert emoji_for("Schwarzwurzel", "schwarzwurzel", "produce") == "🥬"
