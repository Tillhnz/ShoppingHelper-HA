# 🛒 Shopping Helper für Home Assistant

Eine Home-Assistant-Integration mit eigenem **Seitenleisten-Panel**, die die Einkaufslisten aus
**Cookidoo®** (Thermomix) mit deinen **eigenen Einkaufslisten** zusammenführt – Mengen werden
summiert, Artikel nach Supermarkt-Kategorien sortiert und alles mit Diagrammen dargestellt.

```
Cookidoo: Mehl 250 g    ┐
Eigene:   1 kg Mehl     ┘──►  Mehl · 1,25 kg   [Cookidoo] [Einkaufsliste]   → Backzutaten
Cookidoo: Milch 300 g   ┐
Eigene:   2 l Milch     ┘──►  Milch · 2,3 l                                  → Milch, Käse & Eier
```

## Funktionen

- **Zusammenführen** – gleiche Produkte aus allen Listen werden erkannt (auch Singular/Plural:
  „Zwiebeln“ = „Zwiebel“, „Eier“ = „Ei“) und zu einem Eintrag kombiniert.
- **Mengen addieren** – g/kg, ml/l, EL, TL, Stück, Bund, Dose … werden erkannt und summiert,
  egal ob die Menge in der Beschreibung (Cookidoo) oder im Text steht („500 g Mehl“, „Milch 1 l“,
  „2x Butter“, „Eier (10)“).
- **Ordnen** – 17 Supermarkt-Kategorien mit großer deutscher Schlagwortliste. Die Reihenfolge
  entspricht deinem Weg durch den Laden und ist einstellbar. Falsch einsortiert? Im Panel über
  „⋮“ dauerhaft umsortieren.
- **Abhaken überall** – ein Haken im Panel hakt den Artikel in *allen* Ursprungslisten ab
  (bei Cookidoo wird er als „vorhanden“ markiert). Abgehakte Artikel wandern in „Im Wagen“.
- **Bereits vorhanden** – das Haus-Symbol an jedem Eintrag markiert Dinge, die noch zu Hause
  sind: Sie verschwinden von der Liste (Bereich „Bereits vorhanden“), werden in Cookidoo als
  vorhanden markiert, zählen aber nicht als Einkauf in der Statistik.
- **Zwei Ansichten** – oben rechts in der Liste zwischen **Liste** und **Kacheln** umschalten
  (wird pro Gerät gemerkt). Die Kachelansicht zeigt jedes Lebensmittel als Kachel mit Symbol
  (🧅 🥛 🧀 …, rund 480 Begriffe erkannt, sonst das Symbol der Kategorie). Antippen = gekauft,
  Haus = vorhanden, gedrückt halten = Details. Gekaufte Kacheln unter „Im Wagen“ lassen sich mit
  einem Tipp zurück auf die Liste holen.
- **Nachvollziehbar zusammengefasst** – der Pfeil an einem Eintrag zeigt, aus welchen Listen und
  Originaleinträgen er besteht, welche Menge jeweils erkannt wurde und wie die Summe zustande kommt.
- **Vorschläge** – Shopping Helper merkt sich, was du wie oft kaufst. Artikel, die wieder fällig
  sind („alle ~7 Tage, zuletzt vor 8 Tagen“) und nicht auf der Liste stehen, erscheinen als
  Vorschläge über der Liste – ein Tipp fügt sie hinzu, „×“ blendet sie eine Woche aus. Beim Tippen
  im Eingabefeld werden bekannte Artikel automatisch ergänzt.
- **Übersicht** – Kennzahlen zur aktuellen Liste, Donut nach Kategorien, Balken nach Herkunft,
  Fortschrittsring.
- **Statistik** – gekaufte Artikel pro Woche (12 Wochen), Einkaufstage nach Wochentag, Käufe nach
  Kategorie, Anteil Cookidoo vs. eigene Listen, Ø Artikel pro Einkauf und die am häufigsten gekauften
  Artikel mit typischem Kaufrhythmus. Als Kauf zählt jeder abgehakte Artikel.
- **Sensoren** – `sensor.shopping_helper_offene_artikel` (inkl. Kategorien und Artikelliste als
  Attribute), `sensor.shopping_helper_einkaufsfortschritt` und `sensor.shopping_helper_vorschlage`
  (fällige Artikel als Attribut) für Automationen und Dashboards (die Entitäts-IDs richten sich nach der Systemsprache).
- **Dashboard-Karte** – `custom:shopping-helper-card` zeigt die zusammengeführte Liste direkt im
  Dashboard: abhaken, hinzufügen, Vorschläge antippen. Wird automatisch geladen, kein Ressourcen-Eintrag nötig.
- **Aktionen** – `shopping_helper.add_item`, `refresh`, `clear_completed`, `set_category`.
- Hell/Dunkel-Theme, mobil-tauglich (auch in der Companion-App), keine Abhängigkeiten, kein Build-Schritt.

## Voraussetzungen

- Home Assistant **2025.3** oder neuer (funktioniert mit voluptuous und mit probatio, das ab 2026.11 verwendet wird)
- Die offizielle **Cookidoo-Integration** (Einstellungen → Geräte & Dienste → „Cookidoo“).
  Sie liefert zwei To-do-Entitäten: *Einkaufsliste* (Zutaten aus Rezepten) und *Zusätzliche Einkäufe*.
- Optional beliebige weitere To-do-Listen: die eingebaute Einkaufsliste, Bring!, Todoist,
  Local To-do, Google Tasks …

## Installation

### Über HACS (empfohlen)
1. HACS → ⋮ → *Benutzerdefinierte Repositories* → `https://github.com/Tillhnz/ShoppingHelper-HA`, Typ **Integration**.
2. „Shopping Helper“ installieren und Home Assistant neu starten.

### Manuell
1. Den Ordner `custom_components/shopping_helper` nach `<config>/custom_components/` kopieren.
2. Home Assistant neu starten.

### Einrichten
Einstellungen → Geräte & Dienste → **Integration hinzufügen** → „Shopping Helper“.
Cookidoo-Listen werden automatisch erkannt und vorausgewählt. Danach erscheint in der
Seitenleiste der Eintrag **Einkaufen**.

Über **Konfigurieren** lassen sich später ändern: Listen, Standardliste für neue Artikel,
Titel/Icon der Seitenleiste, Sichtbarkeit nur für Admins und die **Laden-Reihenfolge**
(eine Kategorie pro Zeile).

## Dashboard-Karte

Dashboard bearbeiten → **Karte hinzufügen** → „Shopping Helper“. Alles lässt sich im visuellen
Editor einstellen, gegliedert in *Kopfzeile*, *Listen & Kategorien*, *Artikel* und *Funktionen*.
Dieselben Optionen per YAML (alle optional, hier mit ihren Standardwerten):

```yaml
type: custom:shopping-helper-card
# Kopfzeile
show_header: true
title: Einkaufsliste
icon: mdi:cart-variant
show_badge: true           # „12 offen“
show_panel_button: true    # Symbol zum Öffnen des Panels
show_progress: true
# Listen & Kategorien
filter: all                # all | cookidoo | own
entities: []               # nur Artikel aus diesen To-do-Listen, leer = alle
group_by_category: true
hide_categories: []        # z. B. [drugstore, household]
# Artikel
show_done: false
show_quantity: true
show_sources: true         # Punkte: grün = Cookidoo, blau = eigene Liste
compact: false
max_items: 0               # 0 = alle, sonst „… weitere“ mit Link zum Panel
max_height: 0              # px, 0 = wächst mit, sonst scrollt die Liste
# Funktionen
show_add: true
add_list: ""               # Ziel für neue Artikel, leer = Standardliste
show_suggestions: true
max_suggestions: 8
show_clear: true           # „Erledigte entfernen“
```

Kategorie-IDs für `hide_categories`: `produce`, `bakery`, `dairy`, `meat`, `fish`, `frozen`, `pasta`,
`baking`, `spices`, `oils`, `canned`, `breakfast`, `snacks`, `drinks`, `drugstore`, `household`, `other`.

Ein Tipp auf einen Artikel hakt ihn in allen Ursprungslisten ab; abgehakte Artikel bleiben ein paar
Sekunden sichtbar, damit sich ein Fehltipp rückgängig machen lässt.

Die Karte wird von der Integration automatisch geladen, ein Ressourcen-Eintrag ist nicht nötig. Nach
der Installation bzw. einem Update: Home Assistant neu starten und die Seite im Browser neu laden
(in der Companion-App: Einstellungen → Companion-App → Fehlerbehebung → Frontend-Cache leeren).
Taucht sie trotzdem nicht in der Kartenauswahl auf, prüfe in der Browser-Konsole, ob
`SHOPPING-HELPER-CARD geladen` erscheint.

## Beispiele

Artikel per Sprachassistent oder Automation hinzufügen:

```yaml
action: shopping_helper.add_item
data:
  name: "2 l Milch"
```

Benachrichtigung, wenn noch viel auf der Liste steht:

```yaml
triggers:
  - trigger: zone
    entity_id: person.ich
    zone: zone.supermarkt
    event: enter
conditions:
  - condition: numeric_state
    entity_id: sensor.shopping_helper_offene_artikel
    above: 0
actions:
  - action: notify.mobile_app_handy
    data:
      title: "Einkaufsliste"
      message: >
        {{ states('sensor.shopping_helper_offene_artikel') }} Artikel offen:
        {{ state_attr('sensor.shopping_helper_offene_artikel', 'items')[:10] | join(', ') }}
```

## Demo ohne Home Assistant

`demo/index.html` im Browser öffnen – das Panel läuft dort mit Beispieldaten und simulierten
Aktionen, `demo/card.html` zeigt die Dashboard-Karte in mehreren Varianten. `python3 demo/generate_sample.py` erzeugt die Beispieldaten neu aus der echten Logik.

## Aufbau

```
custom_components/shopping_helper/
├── __init__.py          Setup, Panel-Registrierung, Aktionen
├── config_flow.py       Einrichtung & Optionen
├── coordinator.py       Liest alle To-do-Listen (todo.get_items), führt zusammen, schreibt zurück
├── websocket_api.py     Befehle für das Panel (subscribe, check, add, remove, set_category …)
├── sensor.py            Offene Artikel & Fortschritt
├── logic/               Reine Python-Logik, ohne Home-Assistant-Abhängigkeit
│   ├── parser.py        Mengen & Namen erkennen, Einheiten umrechnen
│   ├── categories.py    Kategorien, Schlagworte, Laden-Reihenfolge
│   ├── merge.py         Zusammenführen & Statistik
│   └── history.py       Verlauf & Häufigkeit
└── frontend/
    ├── shopping-helper-panel.js   Seitenleisten-Panel (Web Component, ohne Build)
    └── shopping-helper-card.js    Dashboard-Karte (Web Component, ohne Build)
```

## Entwicklung

```bash
pip install pytest
pytest            # testet Parser, Kategorien, Zusammenführung, Verlauf
```

Die GitHub-Action prüft zusätzlich mit **hassfest** und der **HACS-Validierung**.

## Hinweise

- **Cookidoo nach dem Einkauf leeren:** Cookidoo kann einzelne Zutaten nicht löschen, nur die ganze
  Liste. Aktiviere dafür bei der Cookidoo-Integration den (standardmäßig deaktivierten) Knopf
  **„Einkaufsliste leeren“** (Einstellungen → Geräte & Dienste → Cookidoo → Entitäten).
  Sind danach alle Cookidoo-Artikel abgehakt – in *Einkaufsliste* und *Zusätzliche Einkäufe* –,
  leert „Erledigte entfernen“ die Cookidoo-Liste automatisch mit. Ist noch etwas offen, werden die
  abgehakten Zutaten nur im Panel ausgeblendet und beim nächsten vollständigen Einkauf mit entfernt.
  Abschaltbar in den Optionen („Cookidoo-Liste nach dem Einkauf leeren“).
- Gramm und Liter für dasselbe Produkt werden mit ≈ 1 g/ml zusammengerechnet (Cookidoo gibt
  z. B. Milch in Gramm an) – für den Einkauf genau genug.
- Cookidoo® und Thermomix® sind Marken der Vorwerk-Gruppe. Dieses Projekt steht in keiner
  Verbindung zu Vorwerk.

## Lizenz

MIT
