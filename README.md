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
  (bei Cookidoo wird er als „vorhanden“ markiert).
- **Darstellungen** – Übersicht mit Kennzahlen, Donut nach Kategorien, Balken nach Herkunft,
  Fortschrittsring, Verlauf der letzten 14 Tage und „Häufig auf der Liste“.
- **Sensoren** – `sensor.shopping_helper_offene_artikel` (inkl. Kategorien und Artikelliste als
  Attribute) und `sensor.shopping_helper_einkaufsfortschritt` für Automationen und Dashboards (die Entitäts-IDs richten sich nach der Systemsprache).
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
Aktionen. `python3 demo/generate_sample.py` erzeugt die Beispieldaten neu aus der echten Logik.

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
    └── shopping-helper-panel.js   Seitenleisten-Panel (Web Component, ohne Build)
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
