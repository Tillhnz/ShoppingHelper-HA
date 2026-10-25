"""Emoji symbols for products (used by the tile layout).

Emoji are part of every operating system's font, need no image files and work in the
companion app. Only emoji up to Unicode 14 are used so older phones render them too.
"""
from __future__ import annotations

import re

from .categories import FALLBACK_CATEGORY, _matches

CATEGORY_EMOJI: dict[str, str] = {
    "produce": "🥬", "bakery": "🍞", "dairy": "🧀", "meat": "🥩", "fish": "🐟",
    "frozen": "🧊", "pasta": "🍝", "baking": "🧁", "spices": "🧂", "oils": "🫒",
    "canned": "🥫", "breakfast": "🥣", "snacks": "🍫", "drinks": "🥤",
    "drugstore": "🧴", "household": "🧽", "other": "🛒",
}

_RAW: dict[str, str] = {
    # fruit
    "🍎": "apfel, äpfel", "🍐": "birne", "🍊": "orange, mandarine, clementine, grapefruit, blutorange",
    "🍋": "zitrone, limette, zitronensaft", "🍌": "banane", "🍉": "wassermelone", "🍈": "melone, honigmelone",
    "🍇": "traube, weintraube, rosine", "🍓": "erdbeere, himbeere, johannisbeere, brombeere, preiselbeere, cranberry",
    "🫐": "heidelbeere, blaubeere", "🍒": "kirsche", "🍑": "pfirsich, nektarine, aprikose, pflaume, zwetschge",
    "🥭": "mango", "🍍": "ananas", "🥥": "kokos, kokosmilch, kokosraspel, kokosöl", "🥝": "kiwi",
    # vegetables
    "🍅": "tomate, cherrytomate, kirschtomate, tomatenmark, passata, passierte tomate, passiert, tomatensauce",
    "🍆": "aubergine", "🥑": "avocado", "🥦": "brokkoli, blumenkohl, romanesco",
    "🥬": "salat, spinat, mangold, kohl, wirsing, rucola, feldsalat, chinakohl, pak choi, grünkohl",
    "🥒": "gurke, zucchini, gewürzgurke, essiggurke", "🌶️": "chili, peperoni, jalapeño, chiliflocke, sambal, sriracha, harissa",
    "🫑": "paprika", "🌽": "mais", "🥕": "möhre, karotte, pastinake", "🫒": "olive, olivenöl",
    "🧄": "knoblauch", "🧅": "zwiebel, schalotte, frühlingszwiebel, lauchzwiebel", "🥔": "kartoffel, pommes, kroketten, gnocchi",
    "🍠": "süßkartoffel", "🍄": "pilz, champignon, pfifferling, steinpilz, shiitake", "🌿": "petersilie, basilikum, koriander, "
    "dill, minze, rosmarin, thymian, salbei, schnittlauch, kräuter, oregano, majoran, lorbeer, kresse",
    "🫘": "bohne, kidneybohne, kichererbse, linse, edamame", "🥜": "erdnuss, erdnussbutter",
    "🌰": "nuss, haselnuss, walnuss, mandel, cashew, pistazie, maronen, pinienkern",
    "🎃": "kürbis", "🥗": "rote bete, radieschen, rettich, sellerie, fenchel, kohlrabi, lauch, porree, spargel, artischocke",
    # bakery & breakfast
    "🍞": "brot, toast, vollkornbrot, knäckebrot, zwieback", "🥐": "croissant, blätterteig",
    "🥖": "baguette, ciabatta, brötchen, semmel", "🫓": "fladenbrot, pita, naan, wrap, tortilla",
    "🥨": "brezel, laugen, salzstange", "🥯": "bagel", "🥞": "pfannkuchen, pancake", "🧇": "waffel",
    "🥣": "müsli, cornflakes, granola, porridge, haferflocke", "🍯": "honig, ahornsirup, sirup, agavendicksaft",
    "🫙": "marmelade, konfitüre, nutella, nussnougatcreme, aufstrich, pesto, glas, senf, mayonnaise, mayo, ketchup, kapern",
    # dairy & eggs
    "🥛": "milch, hafermilch, sojamilch, mandelmilch, buttermilch, sahne, schlagsahne, kochsahne, kefir",
    "🧀": "käse, gouda, emmentaler, parmesan, mozzarella, feta, cheddar, camembert, brie, halloumi, frischkäse, mascarpone, ricotta",
    "🧈": "butter, margarine, butterschmalz", "🥚": "ei, eier",
    "🍶": "joghurt, skyr, quark, schmand, crème fraîche, creme fraiche, saure sahne, pudding",
    # meat & fish
    "🥩": "fleisch, rind, steak, gulasch, braten, schwein, lamm, kalb, filet, schnitzel, hack, hackfleisch, mett",
    "🍗": "hähnchen, hühnchen, huhn, pute, truthahn, chicken, ente, keule", "🥓": "speck, bacon, schinken, pancetta",
    "🌭": "wurst, würstchen, bratwurst, wiener, salami, chorizo, aufschnitt",
    "🐟": "fisch, lachs, thunfisch, kabeljau, seelachs, forelle, dorade, zander, hering, matjes, makrele, sardine, fischstäbchen",
    "🦐": "garnele, shrimp, scampi, krabbe", "🦑": "tintenfisch, calamari", "🦪": "muschel, auster",
    "🍔": "burger", "🍕": "pizza, pizzateig", "🥟": "tortellini, ravioli, maultasche, teigtasche",
    # grains & baking
    "🍝": "nudel, spaghetti, penne, fusilli, farfalle, tagliatelle, lasagne, makkaroni, spätzle, bandnudel, pasta",
    "🍜": "glasnudel, reisnudel, mie, ramen, instant", "🍚": "reis, basmati, jasminreis, risotto, milchreis, sushi",
    "🌾": "mehl, weizenmehl, dinkelmehl, roggenmehl, couscous, bulgur, quinoa, hirse, grieß, polenta, graupen, speisestärke, stärke",
    "🍬": "zucker, puderzucker, rohrzucker, vanillezucker, bonbon, gummibärchen, lakritz",
    "🧁": "backpulver, natron, hefe, trockenhefe, gelatine, vanille, kuvertüre, schokotropfen, streusel, lebensmittelfarbe",
    "🍫": "schokolade, kakao, praline, riegel, nougat",
    "🍪": "keks, cookie, kekse, löffelbiskuit, cracker", "🍿": "popcorn, chips, flips, nachos",
    "🎂": "kuchen, torte, tortenboden", "🍦": "eis, eiscreme, speiseeis",
    # spices, oils, cans
    "🧂": "salz, pfeffer, gewürz, paprikapulver, curry, kurkuma, kreuzkümmel, kümmel, zimt, muskat, nelke, garam masala",
    "🍲": "brühe, gemüsebrühe, hühnerbrühe, rinderbrühe, fond, bouillon, suppe, eintopf",
    "🛢️": "öl, rapsöl, sonnenblumenöl, sesamöl, bratöl", "🍾": "essig, balsamico, apfelessig",
    "🥫": "dose, konserve, sauerkraut, apfelmus, ravioli dose", "🍛": "currypaste, sojasauce, sojasoße, sauce, soße, dressing, bbq",
    # drinks
    "💧": "wasser, mineralwasser, sprudel", "🧃": "saft, orangensaft, apfelsaft, schorle, smoothie",
    "🥤": "cola, limonade, fanta, sprite, eistee, energy", "☕": "kaffee, espresso, kaffeebohne, kaffeepad, kapsel",
    "🍵": "tee, grüntee, kräutertee", "🍺": "bier, radler, weizen", "🍷": "wein, rotwein, weißwein, rosé",
    "🥂": "sekt, prosecco, champagner", "🥃": "whisky, rum, gin, wodka, spirituose, likör", "🧊": "eiswürfel, tiefkühl, tk",
    # drugstore & household
    "🧻": "toilettenpapier, klopapier, küchenrolle, küchenpapier, taschentuch, serviette",
    "🪥": "zahnbürste, zahnpasta, zahnseide, mundspülung", "🧼": "seife, handseife, duschgel, shampoo, spülung",
    "🧴": "creme, sonnencreme, lotion, deo, deodorant, bodylotion, haargel, haarspray, rasierschaum",
    "🪒": "rasierer, rasierklinge", "🩹": "pflaster", "👶": "windel, feuchttücher, babybrei",
    "🧽": "schwamm, spülmittel, spültabs, spülmaschinentabs, reiniger, putzmittel, allzweckreiniger, wc-reiniger, entkalker, lappen",
    "🧺": "waschmittel, weichspüler, fleckenentferner", "🗑️": "müllbeutel, mülltüte",
    "📜": "alufolie, frischhaltefolie, backpapier, gefrierbeutel", "🔋": "batterie, akku",
    "💡": "glühbirne, lampe, leuchtmittel", "🕯️": "kerze, teelicht", "🐱": "katzenfutter, katzenstreu", "🐶": "hundefutter",
}

_KEYWORDS: list[tuple[str, str]] = sorted(
    ((kw.strip().casefold(), emoji) for emoji, kws in _RAW.items() for kw in kws.split(",") if kw.strip()),
    key=lambda item: len(item[0]),
    reverse=True,
)


def emoji_for(name: str, key: str | None = None, category: str | None = None) -> str:
    """Best emoji for a product, falling back to the category's symbol."""
    texts = [name.casefold()] + ([key.casefold()] if key else [])
    prepared = [(t, re.findall(r"[\wäöüß]+", t)) for t in texts]
    for keyword, emoji in _KEYWORDS:
        if any(_matches(keyword, text, words) for text, words in prepared):
            return emoji
    return CATEGORY_EMOJI.get(category or FALLBACK_CATEGORY, CATEGORY_EMOJI[FALLBACK_CATEGORY])
