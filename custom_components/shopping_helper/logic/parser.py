"""Parse quantities and names from shopping list entries.

Handles Cookidoo style entries (name + quantity in the description, e.g.
``summary="Zwiebeln", description="2 Stück"``) as well as free text entries
from your own lists ("500 g Mehl", "Milch 1 l", "2x Butter", "Eier (10)").
"""
from __future__ import annotations

from dataclasses import dataclass
import re

# canonical unit -> (family, factor to family base)
UNITS: dict[str, tuple[str, float]] = {
    "g": ("mass", 1.0),
    "kg": ("mass", 1000.0),
    "mg": ("mass", 0.001),
    "ml": ("volume", 1.0),
    "cl": ("volume", 10.0),
    "dl": ("volume", 100.0),
    "l": ("volume", 1000.0),
}

# alias (lowercase, without trailing dot) -> canonical unit
UNIT_ALIASES: dict[str, str] = {
    "g": "g", "gr": "g", "gramm": "g",
    "kg": "kg", "kilo": "kg", "kilogramm": "kg",
    "mg": "mg",
    "ml": "ml", "milliliter": "ml",
    "cl": "cl", "dl": "dl",
    "l": "l", "liter": "l", "ltr": "l",
    "el": "EL", "essl": "EL", "esslöffel": "EL",
    "tl": "TL", "teel": "TL", "teelöffel": "TL",
    "prise": "Prise", "prisen": "Prise",
    "msp": "Msp.", "messerspitze": "Msp.", "messerspitzen": "Msp.",
    "stück": "Stück", "stk": "Stück", "st": "Stück", "stueck": "Stück", "x": "Stück",
    "bund": "Bund", "bd": "Bund",
    "dose": "Dose", "dosen": "Dose",
    "pck": "Pck.", "pkg": "Pck.", "pckg": "Pck.", "packung": "Pck.", "packungen": "Pck.",
    "päckchen": "Pck.", "pack": "Pck.",
    "zehe": "Zehe", "zehen": "Zehe",
    "scheibe": "Scheibe", "scheiben": "Scheibe",
    "becher": "Becher",
    "glas": "Glas", "gläser": "Glas",
    "flasche": "Flasche", "flaschen": "Flasche",
    "kopf": "Kopf", "köpfe": "Kopf",
    "zweig": "Zweig", "zweige": "Zweig",
    "blatt": "Blatt", "blätter": "Blatt",
    "tasse": "Tasse", "tassen": "Tasse",
    "würfel": "Würfel",
    "beutel": "Beutel",
    "stange": "Stange", "stangen": "Stange",
    "netz": "Netz",
    "handvoll": "Handvoll",
    "tube": "Tube", "tuben": "Tube",
    "rolle": "Rolle", "rollen": "Rolle",
}

UNICODE_FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125}
_UF = "".join(UNICODE_FRACTIONS)

_NUM = (
    rf"(?:\d+\s+\d+/\d+"  # 1 1/2
    rf"|\d+/\d+"  # 1/2
    rf"|\d+(?:[.,]\d+)?\s?[{_UF}]?"  # 1 | 1,5 | 1½
    rf"|[{_UF}])"  # ½
)
_UNIT = "|".join(sorted((re.escape(a) for a in UNIT_ALIASES), key=len, reverse=True))
_QTY = rf"(?P<a>{_NUM})(?:\s*[-–]\s*(?P<b>{_NUM}))?\s*(?:(?P<u>{_UNIT})\.?(?![a-zäöüß]))?"

QTY_FULL_RE = re.compile(rf"^\s*{_QTY}\s*$", re.IGNORECASE)
QTY_LEADING_RE = re.compile(rf"^\s*{_QTY}\s*(?:x\s+)?(?P<rest>\S.*)$", re.IGNORECASE)
QTY_TRAILING_PAREN_RE = re.compile(rf"^(?P<rest>.*\S)\s*\(\s*{_QTY}\s*\)\s*$", re.IGNORECASE)
QTY_TRAILING_RE = re.compile(rf"^(?P<rest>.*\S)\s+(?:x\s*)?{_QTY}\s*$", re.IGNORECASE)
SPLIT_RE = re.compile(r"\s*(?:\+|;|\bund\b|,\s+)\s*", re.IGNORECASE)


@dataclass(frozen=True)
class Quantity:
    """A single quantity, e.g. 200 g."""

    amount: float
    unit: str  # canonical unit ("g", "EL", "Stück", ...)

    @property
    def family(self) -> str:
        return UNITS[self.unit][0] if self.unit in UNITS else self.unit

    @property
    def base_amount(self) -> float:
        return self.amount * (UNITS[self.unit][1] if self.unit in UNITS else 1.0)


@dataclass
class ParsedEntry:
    name: str
    quantities: list[Quantity]
    notes: list[str]


def parse_number(text: str) -> float:
    """Parse '1', '1,5', '1/2', '1 1/2', '½', '1½'."""
    text = text.strip()
    total = 0.0
    for ch, val in UNICODE_FRACTIONS.items():
        if ch in text:
            total += val
            text = text.replace(ch, "").strip()
    if not text:
        return total
    if " " in text and "/" in text:
        whole, frac = text.split(None, 1)
        return total + float(whole) + parse_number(frac)
    if "/" in text:
        num, den = text.split("/", 1)
        return total + (float(num) / float(den) if float(den) else 0.0)
    return total + float(text.replace(",", "."))


def _quantity_from_match(m: re.Match) -> Quantity:
    amount = parse_number(m.group("a"))
    if m.group("b"):
        amount = max(amount, parse_number(m.group("b")))  # range: plan for the upper end
    unit = m.group("u")
    canonical = UNIT_ALIASES.get(unit.lower().rstrip("."), "Stück") if unit else "Stück"
    return Quantity(amount, canonical)


def parse_quantity_text(text: str | None) -> tuple[list[Quantity], list[str]]:
    """Parse a description like '200 g + 1 EL' -> quantities, notes."""
    if not text or not text.strip():
        return [], []
    quantities: list[Quantity] = []
    notes: list[str] = []
    for part in SPLIT_RE.split(text.strip()):
        if not part:
            continue
        m = QTY_FULL_RE.match(part)
        if m:
            quantities.append(_quantity_from_match(m))
        else:
            notes.append(part.strip())
    return quantities, notes


def parse_entry(summary: str, description: str | None = None) -> ParsedEntry:
    """Split an entry into name, quantities and free text notes."""
    name = (summary or "").strip()
    quantities, notes = parse_quantity_text(description)

    if not quantities:
        for regex in (QTY_TRAILING_PAREN_RE, QTY_LEADING_RE, QTY_TRAILING_RE):
            m = regex.match(name)
            if not (m and m.group("rest") and re.search(r"[a-zäöüß]", m.group("rest"), re.I)):
                continue
            num_end = m.end("b") if m.group("b") else m.end("a")
            if (
                regex is QTY_LEADING_RE
                and not m.group("u")
                and not name[num_end : num_end + 1].isspace()
            ):
                continue  # "7Up", "4Kids" – digits are part of the product name
            quantities = [_quantity_from_match(m)]
            name = m.group("rest").strip(" ,-")
            break

    return ParsedEntry(name=name or summary.strip(), quantities=quantities, notes=notes)


# --------------------------------------------------------------------------- keys
_STOPWORDS = {"bio", "frisch", "frische", "frischer", "frisches", "etwas", "ca", "ca."}
_IRREGULAR = {
    "eier": "ei", "äpfel": "apfel", "nüsse": "nuss", "kräuter": "kraut",
    "blätter": "blatt", "körner": "korn", "gläser": "glas", "würste": "wurst",
    "säfte": "saft", "brote": "brot",
}


def singularize(word: str) -> str:
    """Very small German plural normalization – only used for matching keys."""
    for plural, singular in _IRREGULAR.items():
        if word.endswith(plural):
            return word[: -len(plural)] + singular
    if len(word) > 4 and not word.endswith("chen"):
        if word.endswith(("en", "ln", "rn")):
            return word[:-1]
        if word.endswith("s") and not word.endswith(("ss", "us", "is", "as", "os")):
            return word[:-1]
    return word


def normalize_key(name: str) -> str:
    """Key used to detect identical products across lists."""
    text = name.casefold()
    text = re.sub(r"\(.*?\)", " ", text)
    text = text.split(",")[0]
    text = re.sub(r"[^\w\s-]", " ", text)
    words = [w for w in text.replace("-", " ").split() if w not in _STOPWORDS and not w.isdigit()]
    return " ".join(singularize(w) for w in words) or name.casefold().strip()


# --------------------------------------------------------------------------- formatting
def _fmt(num: float) -> str:
    rounded = round(num, 2)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def sum_quantities(quantities: list[Quantity]) -> list[Quantity]:
    """Sum quantities per unit family (g+kg, ml+l, EL, ...).

    If the same product shows up in grams *and* litres (Cookidoo lists milk in g,
    you write "2 l Milch"), mass is converted with ~1 g/ml – precise enough for shopping.
    """
    families = {q.family for q in quantities}
    mix = {"mass", "volume"} <= families
    totals: dict[str, float] = {}
    order: list[str] = []
    for q in quantities:
        family = "volume" if mix and q.family == "mass" else q.family
        if family not in totals:
            totals[family] = 0.0
            order.append(family)
        totals[family] += q.base_amount
    result: list[Quantity] = []
    for family in order:
        value = totals[family]
        if family == "mass":
            result.append(Quantity(value / 1000, "kg") if value >= 1000 else Quantity(value, "g"))
        elif family == "volume":
            result.append(Quantity(value / 1000, "l") if value >= 1000 else Quantity(value, "ml"))
        else:
            result.append(Quantity(value, family))
    return result


def format_quantities(quantities: list[Quantity]) -> str:
    return " + ".join(f"{_fmt(q.amount)} {q.unit}" for q in quantities)
