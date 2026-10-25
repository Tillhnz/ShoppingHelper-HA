"""Supermarket categories with German keywords.

The order of DEFAULT_CATEGORIES is the default walking route through the store
and can be changed in the integration options.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import re


@dataclass(frozen=True)
class Category:
    id: str
    name: str
    icon: str
    color: str
    keywords: tuple[str, ...] = field(default_factory=tuple)

    def as_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "icon": self.icon, "color": self.color}


def _kw(text: str) -> tuple[str, ...]:
    return tuple(w.strip() for w in text.split(",") if w.strip())


DEFAULT_CATEGORIES: list[Category] = [
    Category("produce", "Obst & Gemüse", "mdi:food-apple", "#43a047", _kw(
        "apfel, birne, banane, orange, mandarine, clementine, zitrone, limette, grapefruit, "
        "traube, erdbeere, himbeere, preiselbeere, cranberry, heidelbeere, blaubeere, brombeere, johannisbeere, kirsche, "
        "pflaume, zwetschge, pfirsich, nektarine, aprikose, mango, ananas, kiwi, melone, avocado, "
        "granatapfel, feige, rhabarber, tomate, gurke, paprika, zucchini, aubergine, kartoffel, "
        "süßkartoffel, zwiebel, schalotte, knoblauch, ingwer, möhre, karotte, sellerie, lauch, "
        "porree, frühlingszwiebel, lauchzwiebel, brokkoli, blumenkohl, kohlrabi, weißkohl, "
        "rotkohl, wirsing, spitzkohl, rosenkohl, grünkohl, spinat, mangold, salat, rucola, "
        "feldsalat, eisberg, radieschen, rettich, rote bete, pastinake, kürbis, fenchel, "
        "spargel, champignon, pilz, pfifferling, mais, maiskolben, zuckerschote, bohne, grüne bohne, wassermelone, "
        "petersilie, schnittlauch, basilikum, koriander, dill, minze, rosmarin, thymian, "
        "salbei, kresse, chili, peperoni, olive, chicorée, artischocke, "
        "staudensellerie, knollensellerie, meerrettich, kraut"
    )),
    Category("bakery", "Brot & Backwaren", "mdi:baguette", "#c58b4c", _kw(
        "brot, brötchen, semmel, baguette, toast, croissant, brezel, laugen, ciabatta, "
        "fladenbrot, wrap, tortilla, knäckebrot, zwieback, burger bun, pita, naan, kuchen"
    )),
    Category("dairy", "Milch, Käse & Eier", "mdi:cheese", "#f9a825", _kw(
        "milch, butter, sahne, schmand, crème fraîche, creme fraiche, saure sahne, quark, "
        "joghurt, skyr, kefir, buttermilch, käse, gouda, emmentaler, parmesan, mozzarella, "
        "feta, hirtenkäse, mascarpone, ricotta, frischkäse, hüttenkäse, camembert, brie, "
        "bergkäse, cheddar, halloumi, ei, margarine, cremefine, tofu, schlagsahne, kochsahne, pudding"
    )),
    Category("meat", "Fleisch & Wurst", "mdi:food-steak", "#e53935", _kw(
        "fleisch, hackfleisch, hack, rind, rinder, schwein, hähnchen, hühnchen, huhn, pute, "
        "truthahn, steak, schnitzel, filet, gulasch, braten, kotelett, bratwurst, wurst, "
        "würstchen, wiener, schinken, speck, bacon, salami, aufschnitt, chorizo, lamm, "
        "kalb, ente, entenbrust, leberwurst, mett, frikadelle, geschnetzeltes, keule, brust, pancetta"
    )),
    Category("fish", "Fisch & Meeresfrüchte", "mdi:fish", "#1e88e5", _kw(
        "fisch, lachs, thunfisch frisch, kabeljau, seelachs, forelle, dorade, zander, "
        "garnele, shrimp, krabbe, muschel, tintenfisch, calamari, hering, matjes, makrele, "
        "scampi, räucherlachs"
    )),
    Category("frozen", "Tiefkühl", "mdi:snowflake", "#29b6f6", _kw(
        "tiefkühl, tk, tk-, gefroren, eis, eiscreme, pommes, fischstäbchen, tiefkühlpizza, "
        "rahmspinat, kroketten, blätterteig tk, erbsen tk"
    )),
    Category("pasta", "Nudeln, Reis & Getreide", "mdi:pasta", "#ffb74d", _kw(
        "nudel, spaghetti, penne, fusilli, farfalle, tagliatelle, lasagneplatte, lasagne, "
        "makkaroni, spätzle, gnocchi, reis, risottoreis, basmati, jasminreis, couscous, "
        "bulgur, quinoa, hirse, linse, kichererbse, polenta, graupen, haferflocke, "
        "bandnudel, tortellini, ravioli, glasnudel, reisnudel, mie nudel"
    )),
    Category("baking", "Backzutaten", "mdi:cupcake", "#ec407a", _kw(
        "mehl, weizenmehl, dinkelmehl, roggenmehl, zucker, puderzucker, rohrzucker, "
        "vanillezucker, vanille, backpulver, natron, hefe, trockenhefe, speisestärke, "
        "stärke, gelatine, kakao, schokolade backen, kuvertüre, schokotropfen, mandel, "
        "haselnuss, walnuss, nuss, rosine, kokosraspel, marzipan, mohn, sesam, "
        "leinsamen, sonnenblumenkern, kürbiskern, pinienkern, backoblate, zuckerguss, "
        "lebensmittelfarbe, agar, blätterteig, mürbeteig, pizzateig, hefeteig"
    )),
    Category("spices", "Gewürze & Würzmittel", "mdi:shaker-outline", "#8d6e63", _kw(
        "salz, meersalz, pfeffer, paprikapulver, curry, currypulver, kurkuma, kreuzkümmel, "
        "kümmel, zimt, muskat, muskatnuss, nelke, lorbeer, chiliflocke, cayenne, oregano, "
        "majoran, gewürz, brühe, gemüsebrühe, hühnerbrühe, rinderbrühe, fond, bouillon, "
        "senf, ketchup, mayonnaise, mayo, sojasauce, sojasoße, worcestersauce, tabasco, "
        "sriracha, kräuter der provence, italienische kräuter, garam masala, sambal, "
        "harissa, wasabi, tahin, miso, gewürzpaste, currypaste"
    )),
    Category("oils", "Öl, Essig & Saucen", "mdi:bottle-tonic-outline", "#7cb342", _kw(
        "öl, olivenöl, rapsöl, sonnenblumenöl, sesamöl, kokosöl, essig, balsamico, "
        "weißweinessig, apfelessig, rotweinessig, sauce, soße, pesto, dressing, "
        "tomatensauce, passierte tomate, passiert, passata, bbq"
    )),
    Category("canned", "Konserven & Fertiges", "mdi:food-variant", "#78909c", _kw(
        "dose, dosentomate, konserve, gehackte tomate, geschälte tomate, tomatenmark, kokosmilch, "
        "mais dose, kidneybohne, weiße bohne, thunfisch, sardine, gurken glas, gewürzgurke, "
        "essiggurke, kapern, oliven glas, suppe, fertiggericht, instant, rote bete glas, "
        "sauerkraut, apfelmus, kichererbse dose"
    )),
    Category("breakfast", "Frühstück & Aufstriche", "mdi:bowl-mix-outline", "#a1887f", _kw(
        "müsli, cornflakes, granola, porridge, honig, marmelade, konfitüre, nutella, "
        "nussnougatcreme, erdnussbutter, aufstrich, sirup, ahornsirup, agavendicksaft"
    )),
    Category("snacks", "Süßes & Snacks", "mdi:candy", "#ab47bc", _kw(
        "schokolade, chips, keks, cracker, gummibärchen, bonbon, praline, riegel, "
        "salzstange, popcorn, nüsse snack, studentenfutter, waffel, lakritz, flips"
    )),
    Category("drinks", "Getränke", "mdi:cup-water", "#26a69a", _kw(
        "wasser, mineralwasser, sprudel, saft, orangensaft, apfelsaft, schorle, limonade, "
        "cola, fanta, sprite, eistee, tee, kaffee, espresso, kaffeebohne, kakao getränk, "
        "bier, wein, weißwein, rotwein, sekt, prosecco, spirituose, gin, rum, wodka, "
        "hafermilch, sojamilch, mandelmilch, smoothie, energy"
    )),
    Category("drugstore", "Drogerie & Hygiene", "mdi:toothbrush-paste", "#7e57c2", _kw(
        "zahnpasta, zahnbürste, zahnseide, shampoo, duschgel, seife, deo, deodorant, "
        "rasierer, rasierschaum, creme, sonnencreme, lotion, toilettenpapier, klopapier, "
        "taschentuch, wattepad, wattestäbchen, tampon, binde, windel, feuchttücher, "
        "pflaster, haargel, haarspray, lippenpflege, kosmetik"
    )),
    Category("household", "Haushalt", "mdi:spray-bottle", "#5c6bc0", _kw(
        "spülmittel, spültabs, spülmaschinentabs, waschmittel, weichspüler, reiniger, "
        "allzweckreiniger, putzmittel, schwamm, lappen, küchenrolle, küchenpapier, "
        "müllbeutel, mülltüte, alufolie, frischhaltefolie, backpapier, gefrierbeutel, "
        "batterie, glühbirne, kerze, streichholz, serviette, entkalker, wc-reiniger, "
        "katzenfutter, hundefutter, katzenstreu"
    )),
    Category("other", "Sonstiges", "mdi:cart-outline", "#9e9e9e"),
]

CATEGORY_BY_ID: dict[str, Category] = {c.id: c for c in DEFAULT_CATEGORIES}
FALLBACK_CATEGORY = "other"

# keyword -> category id, longest keywords first so "kokosmilch" beats "milch"
_KEYWORDS: list[tuple[str, str]] = sorted(
    ((kw.casefold(), c.id) for c in DEFAULT_CATEGORIES for kw in c.keywords),
    key=lambda item: len(item[0]),
    reverse=True,
)


def _matches(keyword: str, text: str, words: list[str]) -> bool:
    """Short keywords only match whole words / word edges ("ei" must not hit "Reis")."""
    if " " in keyword or len(keyword) >= 5:
        return keyword in text
    if len(keyword) == 4:
        return any(w == keyword or w.startswith(keyword) or w.endswith(keyword) for w in words)
    return any(w == keyword or w.endswith(keyword) for w in words)


def categorize(name: str, key: str | None = None) -> str:
    """Return the best matching category id for a product."""
    texts = [name.casefold()] + ([key.casefold()] if key else [])
    prepared = [(t, re.findall(r"[\wäöüß]+", t)) for t in texts]
    for keyword, category_id in _KEYWORDS:
        if any(_matches(keyword, text, words) for text, words in prepared):
            return category_id
    return FALLBACK_CATEGORY


def resolve_order(custom: str | list[str] | None) -> list[str]:
    """Build the store route from a user option (ids or names, comma/newline separated).

    Categories the user did not mention keep their default relative position at the end,
    "Sonstiges" is always last unless explicitly placed.
    """
    if isinstance(custom, str):
        tokens = [t.strip() for t in custom.replace("\n", ",").split(",")]
    else:
        tokens = [t.strip() for t in (custom or [])]
    lookup = {c.id.casefold(): c.id for c in DEFAULT_CATEGORIES}
    lookup.update({c.name.casefold(): c.id for c in DEFAULT_CATEGORIES})
    order: list[str] = []
    for token in tokens:
        cid = lookup.get(token.casefold())
        if cid and cid not in order:
            order.append(cid)
    rest = [c.id for c in DEFAULT_CATEGORIES if c.id not in order]
    if FALLBACK_CATEGORY in rest and FALLBACK_CATEGORY not in order:
        rest.remove(FALLBACK_CATEGORY)
        rest.append(FALLBACK_CATEGORY)
    return order + rest
