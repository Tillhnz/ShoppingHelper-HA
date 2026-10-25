"""Merge items from several to-do lists into one categorized shopping list."""
from __future__ import annotations

from dataclasses import asdict, dataclass

from .categories import CATEGORY_BY_ID, FALLBACK_CATEGORY, categorize
from .parser import format_quantities, normalize_key, parse_entry, sum_quantities

STATUS_DONE = "completed"
STATUS_OPEN = "needs_action"

_SORT_MAP = str.maketrans({"ä": "a", "ö": "o", "ü": "u", "ß": "ss"})


@dataclass
class SourceItem:
    """One item as delivered by a to-do entity."""

    entity_id: str
    list_name: str
    uid: str
    summary: str
    description: str | None
    status: str
    is_cookidoo: bool

    @property
    def done(self) -> bool:
        return self.status == STATUS_DONE


def _sort_key(text: str) -> str:
    return text.casefold().translate(_SORT_MAP)


def merge_items(
    sources: list[SourceItem],
    category_order: list[str],
    overrides: dict[str, str] | None = None,
    have: set[tuple[str, str]] | None = None,
) -> dict:
    """Combine identical products, sum quantities, assign and order categories.

    ``have`` holds (entity_id, uid) pairs that were marked "already at home": they are
    checked at the source but were not bought.
    """
    overrides = overrides or {}
    have = have or set()
    groups: dict[str, list[tuple[SourceItem, object]]] = {}
    for src in sources:
        parsed = parse_entry(src.summary, src.description)
        key = normalize_key(parsed.name)
        groups.setdefault(key, []).append((src, parsed))

    items: list[dict] = []
    for key, members in groups.items():
        open_members = [(s, p) for s, p in members if not s.done]
        relevant = open_members or members
        all_quantities = [q for _, p in relevant for q in p.quantities]
        quantities = sum_quantities(all_quantities)
        families = {q.family for q in all_quantities}
        notes = sorted({n for _, p in relevant for n in p.notes})
        name = _pick_name([p.name for s, p in (open_members or members)])
        category = overrides.get(key)
        if category not in CATEGORY_BY_ID:
            category = categorize(name, key)
        items.append(
            {
                "key": key,
                "name": name,
                "category": category,
                "category_overridden": key in overrides,
                "quantity": format_quantities(quantities),
                "quantities": [{"amount": round(q.amount, 3), "unit": q.unit} for q in quantities],
                "notes": notes,
                "checked": not open_members,
                "have": not open_members and all((s.entity_id, s.uid) in have for s, _ in members),
                "mixed_units": {"mass", "volume"} <= families,
                "partial": bool(open_members) and len(open_members) < len(members),
                "cookidoo": any(s.is_cookidoo for s, _ in members),
                "own": any(not s.is_cookidoo for s, _ in members),
                "sources": [
                    {
                        **asdict(s),
                        "done": s.done,
                        "have": (s.entity_id, s.uid) in have,
                        "parsed_name": p.name,
                        "quantity": format_quantities(sum_quantities(p.quantities)),
                        "notes": p.notes,
                    }
                    for s, p in members
                ],
            }
        )

    items.sort(key=lambda i: (i["checked"], _sort_key(i["name"])))

    position = {cid: idx for idx, cid in enumerate(category_order)}
    categories: list[dict] = []
    for cid in sorted(
        {i["category"] for i in items},
        key=lambda c: position.get(c, len(position)),
    ):
        cat_items = [i for i in items if i["category"] == cid]
        cat = CATEGORY_BY_ID.get(cid, CATEGORY_BY_ID[FALLBACK_CATEGORY])
        categories.append(
            {
                **cat.as_dict(),
                "position": position.get(cid, len(position)),
                "items": cat_items,
                "open": sum(1 for i in cat_items if not i["checked"]),
                "done": sum(1 for i in cat_items if i["checked"]),
            }
        )

    return {
        "categories": categories,
        "stats": _stats(items, sources),
        "all_categories": [
            CATEGORY_BY_ID[c].as_dict() for c in category_order if c in CATEGORY_BY_ID
        ],
    }


def _pick_name(names: list[str]) -> str:
    """Most frequent spelling wins, ties go to the shortest, capitalized."""
    counts: dict[str, int] = {}
    for n in names:
        counts[n] = counts.get(n, 0) + 1
    best = sorted(counts, key=lambda n: (-counts[n], len(n), n))[0]
    return best[:1].upper() + best[1:]


def _stats(items: list[dict], sources: list[SourceItem]) -> dict:
    lists: dict[str, dict] = {}
    for s in sources:
        entry = lists.setdefault(
            s.entity_id,
            {"entity_id": s.entity_id, "name": s.list_name, "cookidoo": s.is_cookidoo,
             "total": 0, "open": 0, "done": 0},
        )
        entry["total"] += 1
        entry["done" if s.done else "open"] += 1
    total = len(items)
    done = sum(1 for i in items if i["checked"])
    have = sum(1 for i in items if i["have"])
    return {
        "total": total,
        "open": total - done,
        "done": done,  # checked in any way (bought or already at home)
        "bought": done - have,
        "have": have,
        "progress": round(done / total * 100) if total else 0,
        "merged": sum(1 for i in items if len(i["sources"]) > 1),
        "cookidoo_items": sum(1 for i in items if i["cookidoo"]),
        "own_items": sum(1 for i in items if i["own"]),
        "lists": list(lists.values()),
    }
