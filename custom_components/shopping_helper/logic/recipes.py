"""Group Cookidoo shopping list ingredients by recipe.

Cookidoo's shopping list is built from recipes: every ingredient of every recipe is
its own entry on the list (two recipes with onions → two onion entries). The to-do
list in Home Assistant only carries name and quantity, so the recipes are fetched
separately and their ingredients are matched to the list entries here.

Both come from the same Cookidoo response in the same order, so entries are matched
in order and confirmed by name; if the order ever differs, matching falls back to
name (and quantity) alone.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .icons import emoji_for
from .categories import categorize
from .merge import SourceItem
from .parser import normalize_key

STATE_OPEN = "open"
STATE_BOUGHT = "bought"
STATE_HAVE = "have"
_STATE_ORDER = {STATE_OPEN: 0, STATE_BOUGHT: 1, STATE_HAVE: 2}


@dataclass
class RecipeIngredient:
    name: str
    description: str = ""


@dataclass
class Recipe:
    id: str
    name: str
    ingredients: list[RecipeIngredient] = field(default_factory=list)
    url: str | None = None
    thumbnail: str | None = None


def _norm(text: str) -> str:
    return " ".join((text or "").casefold().split())


def match_ingredients(recipes: list[Recipe], items: list[SourceItem]) -> list[list[SourceItem | None]]:
    """For each recipe, the list entry belonging to each of its ingredients (or None)."""
    used: set[int] = set()
    pointer = 0
    result: list[list[SourceItem | None]] = []
    for recipe in recipes:
        matched: list[SourceItem | None] = []
        for ing in recipe.ingredients:
            name, desc = _norm(ing.name), _norm(ing.description)
            index: int | None = None
            # 1) same order as the list
            if pointer < len(items) and pointer not in used and _norm(items[pointer].summary) == name:
                index = pointer
            # 2) same name and quantity anywhere, 3) same name anywhere
            if index is None:
                for check_desc in (True, False):
                    index = next(
                        (
                            i
                            for i, it in enumerate(items)
                            if i not in used
                            and _norm(it.summary) == name
                            and (not check_desc or _norm(it.description or "") == desc)
                        ),
                        None,
                    )
                    if index is not None:
                        break
            if index is None:
                matched.append(None)
                continue
            used.add(index)
            pointer = index + 1
            matched.append(items[index])
        result.append(matched)
    return result


def build_recipes(
    recipes: list[Recipe],
    items: list[SourceItem],
    have: set[tuple[str, str]],
    hidden: set[tuple[str, str]],
    item_keys: dict[tuple[str, str], str],
) -> list[dict]:
    """Recipe cards for the panel: ingredients with their state, and what is still missing.

    ``item_keys`` maps (entity_id, uid) to the key of the merged list item, so the panel
    can check off or mark an ingredient with the same actions as on the shopping list.
    """
    cards: list[dict] = []
    for recipe, matched in zip(recipes, match_ingredients(recipes, items)):
        ingredients: list[dict] = []
        for ing, src in zip(recipe.ingredients, matched):
            if src is None:
                continue  # not on the list (anymore) – nothing to buy for it
            ident = (src.entity_id, src.uid)
            if ident in have:
                state = STATE_HAVE
            elif src.done or ident in hidden:
                state = STATE_BOUGHT
            else:
                state = STATE_OPEN
            key = normalize_key(ing.name)
            ingredients.append(
                {
                    "name": ing.name,
                    "quantity": ing.description,
                    "state": state,
                    "key": item_keys.get(ident, key),
                    "entity_id": src.entity_id,
                    "uid": src.uid,
                    "emoji": emoji_for(ing.name, key, categorize(ing.name, key)),
                }
            )
        if not ingredients:
            continue
        missing = sum(1 for i in ingredients if i["state"] == STATE_OPEN)
        # missing first, then bought, then at home – each in the recipe's order
        ingredients.sort(key=lambda i: _STATE_ORDER[i["state"]])
        cards.append(
            {
                "id": recipe.id,
                "name": recipe.name,
                "url": recipe.url,
                "thumbnail": recipe.thumbnail,
                "total": len(ingredients),
                "missing": missing,
                "have": sum(1 for i in ingredients if i["state"] == STATE_HAVE),
                "complete": missing == 0,
                "ingredients": ingredients,
            }
        )
    # recipes that still need something first, keep Cookidoo's order otherwise
    cards.sort(key=lambda c: c["complete"])
    return cards
