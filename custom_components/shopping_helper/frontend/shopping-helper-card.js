/**
 * Shopping Helper – Lovelace dashboard card.
 *
 *   type: custom:shopping-helper-card
 *
 * Loaded automatically by the integration (no resource entry needed).
 * Plain web component, no build step required.
 */
const SH_DOMAIN = "shopping_helper";
const SH_PANEL_PATH = "/shopping-helper";
const SH_RECENT_MS = 4000; // checked items stay visible this long (to undo a mis-tap)

const shEsc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SH_CATEGORIES = [
  ["produce", "Obst & Gemüse"],
  ["bakery", "Brot & Backwaren"],
  ["dairy", "Milch, Käse & Eier"],
  ["meat", "Fleisch & Wurst"],
  ["fish", "Fisch & Meeresfrüchte"],
  ["frozen", "Tiefkühl"],
  ["pasta", "Nudeln, Reis & Getreide"],
  ["baking", "Backzutaten"],
  ["spices", "Gewürze & Würzmittel"],
  ["oils", "Öl, Essig & Saucen"],
  ["canned", "Konserven & Fertiges"],
  ["breakfast", "Frühstück & Aufstriche"],
  ["snacks", "Süßes & Snacks"],
  ["drinks", "Getränke"],
  ["drugstore", "Drogerie & Hygiene"],
  ["household", "Haushalt"],
  ["other", "Sonstiges"],
];

const SH_DEFAULTS = {
  // header
  show_header: true,
  title: "Einkaufsliste",
  icon: "mdi:cart-variant",
  show_badge: true,
  show_panel_button: true,
  show_progress: true,
  // lists & categories
  filter: "all", // all | cookidoo | own
  entities: [], // only items from these to-do lists (empty = all)
  hide_categories: [],
  group_by_category: true,
  // items
  show_done: false,
  show_quantity: true,
  show_sources: true,
  compact: false,
  max_items: 0, // 0 = no limit
  max_height: 0, // px, 0 = grow with content
  // actions
  show_add: true,
  add_list: "", // empty = default list from the integration options
  show_suggestions: true,
  max_suggestions: 8,
  show_clear: true,
};

const SH_LABELS = {
  header: "Kopfzeile",
  show_header: "Kopfzeile anzeigen",
  title: "Titel",
  icon: "Symbol",
  show_badge: "Anzahl offener Artikel",
  show_panel_button: "Knopf zum Öffnen des Panels",
  show_progress: "Fortschrittsbalken",
  content: "Listen & Kategorien",
  filter: "Herkunft",
  entities: "Nur diese Listen",
  hide_categories: "Ausgeblendete Kategorien",
  group_by_category: "Nach Kategorien gruppieren",
  items: "Artikel",
  show_done: "Erledigte anzeigen",
  show_quantity: "Mengen anzeigen",
  show_sources: "Herkunft-Punkte anzeigen (grün = Cookidoo, blau = eigene)",
  compact: "Kompakte Zeilen",
  max_items: "Maximal angezeigte Artikel",
  max_height: "Maximale Höhe der Liste",
  actions: "Funktionen",
  show_add: "Eingabefeld zum Hinzufügen",
  add_list: "Neue Artikel landen in",
  show_suggestions: "Vorschläge anzeigen",
  max_suggestions: "Maximale Anzahl Vorschläge",
  show_clear: "Knopf „Erledigte entfernen“",
};

const SH_HELPERS = {
  entities: "Leer lassen für alle Listen des Shopping Helpers.",
  max_items: "0 = alle. Darüber hinaus erscheint „… weitere“ mit Link zum Panel.",
  max_height: "0 = wächst mit dem Inhalt, sonst scrollt die Liste.",
  add_list: "Leer lassen für die Standardliste aus den Integrations-Optionen.",
};

class ShoppingHelperCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...SH_DEFAULTS };
    this._data = null;
    this._error = null;
    this._pending = new Set();
    this._recent = new Map(); // key -> timeout id
  }

  /* ------------------------------------------------------------ Lovelace API */
  static getStubConfig() {
    return { title: SH_DEFAULTS.title };
  }

  static getConfigForm() {
    const bool = { boolean: {} };
    const section = (name, icon, schema, expanded = false) => ({
      name, type: "expandable", flatten: true, icon, expanded, schema,
    });
    return {
      schema: [
        section("header", "mdi:page-layout-header", [
          { name: "show_header", selector: bool },
          { name: "title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
          {
            type: "grid",
            name: "",
            schema: [
              { name: "show_badge", selector: bool },
              { name: "show_panel_button", selector: bool },
              { name: "show_progress", selector: bool },
            ],
          },
        ], true),
        section("content", "mdi:format-list-bulleted-type", [
          {
            name: "filter",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "all", label: "Alle Listen" },
                  { value: "cookidoo", label: "Nur Cookidoo" },
                  { value: "own", label: "Nur eigene Listen" },
                ],
              },
            },
          },
          { name: "entities", selector: { entity: { multiple: true, filter: { domain: "todo" } } } },
          { name: "group_by_category", selector: bool },
          {
            name: "hide_categories",
            selector: {
              select: { multiple: true, mode: "dropdown", options: SH_CATEGORIES.map(([value, label]) => ({ value, label })) },
            },
          },
        ]),
        section("items", "mdi:checkbox-marked-circle-outline", [
          {
            type: "grid",
            name: "",
            schema: [
              { name: "show_done", selector: bool },
              { name: "show_quantity", selector: bool },
              { name: "show_sources", selector: bool },
              { name: "compact", selector: bool },
            ],
          },
          { name: "max_items", selector: { number: { min: 0, max: 200, mode: "box" } } },
          { name: "max_height", selector: { number: { min: 0, max: 2000, step: 10, mode: "box", unit_of_measurement: "px" } } },
        ]),
        section("actions", "mdi:gesture-tap", [
          { name: "show_add", selector: bool },
          { name: "add_list", selector: { entity: { filter: { domain: "todo" } } } },
          { name: "show_suggestions", selector: bool },
          { name: "max_suggestions", selector: { number: { min: 1, max: 30, mode: "box" } } },
          { name: "show_clear", selector: bool },
        ]),
      ],
      computeLabel: (s) => SH_LABELS[s.name] ?? s.name,
      computeHelper: (s) => SH_HELPERS[s.name],
      assertConfig: (config) => {
        if (config.filter && !["all", "cookidoo", "own"].includes(config.filter)) {
          throw new Error("filter muss all, cookidoo oder own sein");
        }
      },
    };
  }

  setConfig(config) {
    if (config.filter && !["all", "cookidoo", "own"].includes(config.filter)) {
      throw new Error("filter muss all, cookidoo oder own sein");
    }
    const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    this._config = {
      ...SH_DEFAULTS,
      ...config,
      entities: arr(config.entities),
      hide_categories: arr(config.hide_categories),
    };
    this._render();
  }

  getCardSize() {
    const items = this._data?.stats?.open ?? 4;
    return 2 + Math.min(this._config.max_items || items, items);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, min_rows: 3 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._unsub && this.isConnected) this._subscribe();
  }

  connectedCallback() {
    if (this._hass && !this._unsub) this._subscribe();
    this._render();
  }

  disconnectedCallback() {
    if (this._unsub) {
      this._unsub.then((unsub) => unsub()).catch(() => {});
      this._unsub = null;
    }
    this._recent.forEach((t) => clearTimeout(t));
    this._recent.clear();
  }

  /* ------------------------------------------------------------ data */
  _subscribe() {
    this._unsub = this._hass.connection.subscribeMessage(
      (data) => {
        this._data = data;
        this._error = null;
        this._pending.clear();
        this._render();
      },
      { type: `${SH_DOMAIN}/subscribe` }
    );
    this._unsub.catch((err) => {
      this._unsub = null;
      this._error =
        err?.code === "unknown_command"
          ? "Die Integration Shopping Helper ist nicht installiert."
          : err?.message || "Verbindung zum Shopping Helper fehlgeschlagen.";
      this._render();
    });
  }

  async _ws(payload, okMessage) {
    try {
      const result = await this._hass.callWS({ ...payload, type: `${SH_DOMAIN}/${payload.type}` });
      const message = typeof okMessage === "function" ? okMessage(result) : okMessage;
      if (message) this._toast(message);
      return result;
    } catch (err) {
      this._pending.clear();
      this._render();
      this._toast(err?.message || "Aktion fehlgeschlagen");
      return null;
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  _openPanel() {
    history.pushState(null, "", SH_PANEL_PATH);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  /* ------------------------------------------------------------ events */
  _onClick(ev) {
    const t = ev.target;
    if (t.closest("[data-open-panel]")) return this._openPanel();

    const clear = t.closest("[data-clear]");
    if (clear) return this._onClear(clear.dataset.clear);

    const sugg = t.closest("[data-sugg-add]");
    if (sugg) {
      const name = sugg.dataset.name;
      this._pending.add("sugg:" + sugg.dataset.suggAdd);
      this._render();
      this._ws({ type: "add", name, ...this._target() }, `„${name}“ hinzugefügt`);
      return;
    }

    const row = t.closest("[data-key]");
    if (row) {
      const key = row.dataset.key;
      const checked = row.dataset.checked !== "true";
      this._pending.add(key);
      clearTimeout(this._recent.get(key));
      if (checked && !this._config.show_done) {
        this._recent.set(
          key,
          setTimeout(() => {
            this._recent.delete(key);
            this._render();
          }, SH_RECENT_MS)
        );
      } else {
        this._recent.delete(key);
      }
      row.classList.toggle("checked", checked);
      row.classList.add("pending");
      row.dataset.checked = String(checked);
      this._ws({ type: "check", key, checked });
    }
  }

  _onSubmit(ev) {
    ev.preventDefault();
    const input = this.shadowRoot.getElementById("add-input");
    const name = input.value.trim();
    if (!name) return;
    input.value = "";
    this._ws({ type: "add", name, ...this._target() }, `„${name}“ hinzugefügt`);
  }

  _target() {
    return this._config.add_list ? { entity_id: this._config.add_list } : {};
  }

  /* Two-step confirmation inside the card – confirm() is blocked in the companion app. */
  _onClear(action) {
    clearTimeout(this._confirmTimer);
    if (action === "ask") {
      this._confirmClear = true;
      this._confirmTimer = setTimeout(() => {
        this._confirmClear = false;
        this._render();
      }, 6000);
    } else if (action === "cancel") {
      this._confirmClear = false;
    } else if (action === "confirm") {
      this._confirmClear = false;
      this._ws({ type: "clear_completed" }, (r) => {
        const n = (r?.removed ?? 0) + (r?.hidden ?? 0);
        return n ? `${n} erledigte Artikel entfernt` : "Keine erledigten Artikel gefunden";
      });
    }
    this._render();
  }

  /* ------------------------------------------------------------ render */
  /* item belongs to this card (source/list/category filters), regardless of its checked state */
  _matches(item) {
    const c = this._config;
    if (c.filter === "cookidoo" && !item.cookidoo) return false;
    if (c.filter === "own" && !item.own) return false;
    if (c.entities.length && !item.sources.some((s) => c.entities.includes(s.entity_id))) return false;
    if (c.hide_categories.includes(item.category)) return false;
    return true;
  }

  _visible(item) {
    if (!this._matches(item)) return false;
    if (item.checked && !this._config.show_done && !this._pending.has(item.key) && !this._recent.has(item.key)) return false;
    return true;
  }

  _render() {
    const root = this.shadowRoot;
    if (!root.firstChild) {
      root.innerHTML = `<style>${SH_CARD_STYLES}</style><ha-card><div id="body"></div></ha-card>`;
      root.addEventListener("click", (ev) => this._onClick(ev));
      root.addEventListener("submit", (ev) => this._onSubmit(ev));
    }
    const body = root.getElementById("body");

    // keep focus and typed text in the add field across re-renders
    const input = root.getElementById("add-input");
    const typed = input?.value ?? "";
    const focused = input && root.activeElement === input;

    body.innerHTML = this._html();

    const newInput = root.getElementById("add-input");
    if (newInput) {
      newInput.value = typed;
      if (focused) newInput.focus();
    }
  }

  _html() {
    const c = this._config;
    const header = (badge = "") =>
      c.show_header
        ? `<div class="header">
            ${c.icon ? `<ha-icon icon="${shEsc(c.icon)}" class="header-icon"></ha-icon>` : ""}
            <div class="title">${shEsc(c.title)}</div>
            ${c.show_badge ? badge : ""}
            ${c.show_panel_button ? `<button class="icon-btn" data-open-panel title="Shopping Helper öffnen"><ha-icon icon="mdi:open-in-new"></ha-icon></button>` : ""}
          </div>`
        : "";

    if (this._error) {
      return `${header()}<div class="state error"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>${shEsc(this._error)}</span></div>`;
    }
    if (!this._data) {
      return `${header()}<div class="state muted">Lade Einkaufsliste …</div>`;
    }

    const { categories = [], stats = {} } = this._data;
    const mine = categories.flatMap((cat) => cat.items.filter((i) => this._matches(i)));
    const total = mine.length;
    const done = mine.filter((i) => i.checked).length;
    const openCount = total - done;
    const progressPct = total ? Math.round((done / total) * 100) : 0;

    const groups = categories
      .map((cat) => ({ cat, items: cat.items.filter((i) => this._visible(i)) }))
      .filter((g) => g.items.length);

    // limit the number of rows
    let budget = c.max_items > 0 ? c.max_items : Infinity;
    let hiddenCount = 0;
    const shown = [];
    for (const g of groups) {
      if (budget <= 0) {
        hiddenCount += g.items.length;
        continue;
      }
      const items = g.items.slice(0, budget);
      hiddenCount += g.items.length - items.length;
      budget -= items.length;
      shown.push({ cat: g.cat, items });
    }

    const badge = `<span class="badge ${openCount ? "" : "done"}">${openCount ? `${openCount} offen` : "✓"}</span>`;
    const progress =
      c.show_progress && total
        ? `<div class="progress ${c.show_header ? "" : "top"}" title="${progressPct}% erledigt"><div style="width:${progressPct}%"></div></div>`
        : "";

    const add = c.show_add
      ? `<form class="add ${c.show_header || progress ? "" : "top"}" autocomplete="off">
          <input id="add-input" list="sh-known" placeholder="Artikel hinzufügen …" enterkeyhint="done" />
          <datalist id="sh-known">${(this._data.known_names || []).map((n) => `<option value="${shEsc(n)}"></option>`).join("")}</datalist>
          <button type="submit" class="icon-btn add-btn" title="Hinzufügen"><ha-icon icon="mdi:plus"></ha-icon></button>
        </form>`
      : "";

    let list;
    if (!shown.length) {
      list = `<div class="state muted"><ha-icon icon="mdi:cart-check"></ha-icon><span>${
        total ? "Alles erledigt 🎉" : "Die Einkaufsliste ist leer."
      }</span></div>`;
    } else if (c.group_by_category) {
      list = shown
        .map(
          (g) => `<div class="group" style="--cat:${shEsc(g.cat.color)}">
            <div class="group-title"><ha-icon icon="${shEsc(g.cat.icon)}"></ha-icon>${shEsc(g.cat.name)}</div>
            <ul>${g.items.map((i) => this._itemHtml(i)).join("")}</ul>
          </div>`
        )
        .join("");
    } else {
      list = `<ul class="flat">${shown
        .flatMap((g) => g.items.map((i) => this._itemHtml(i, g.cat.color)))
        .join("")}</ul>`;
    }

    const more = hiddenCount
      ? `<button class="text-btn" data-open-panel><ha-icon icon="mdi:dots-horizontal"></ha-icon>${hiddenCount} weitere</button>`
      : "";
    const clear = c.show_clear ? this._clearHtml(stats) : "";
    const footer = more || clear ? `<div class="footer">${more}<span class="spacer"></span>${clear}</div>` : "";
    const listStyle = c.max_height > 0 ? `style="max-height:${Number(c.max_height)}px"` : "";

    return `<div class="${c.compact ? "compact" : ""} wrap">${header(badge)}${progress}${add}${this._suggestionsHtml()}
      <div class="list" ${listStyle}>${list}</div>${footer}</div>`;
  }

  _itemHtml(item, color) {
    const c = this._config;
    const pending = this._pending.has(item.key);
    const dots = c.show_sources
      ? `<span class="dots">${item.cookidoo ? `<span class="dot cookidoo" title="Cookidoo"></span>` : ""}${
          item.own ? `<span class="dot own" title="Eigene Liste"></span>` : ""
        }</span>`
      : "";
    return `<li class="item ${item.checked ? "checked" : ""} ${item.partial ? "partial" : ""} ${pending ? "pending" : ""}"
              ${color ? `style="--cat:${shEsc(color)}"` : ""} data-key="${shEsc(item.key)}" data-checked="${item.checked}">
        <span class="check"><ha-icon icon="mdi:check"></ha-icon></span>
        <span class="name">${shEsc(item.name)}</span>
        ${c.show_quantity && item.quantity ? `<span class="qty">${shEsc(item.quantity)}</span>` : ""}
        ${dots}
      </li>`;
  }

  _suggestionsHtml() {
    if (!this._config.show_suggestions) return "";
    const items = (this._data.suggestions || []).filter((s) => !this._pending.has("sugg:" + s.key)).slice(0, Math.max(1, Number(this._config.max_suggestions) || 8));
    if (!items.length) return "";
    const colors = Object.fromEntries((this._data.all_categories || []).map((c) => [c.id, c.color]));
    return `<div class="suggest">${items
      .map(
        (s) => `<button class="sugg ${s.reason === "fällig" ? "due" : ""}" style="--cat:${shEsc(colors[s.category] || "#9e9e9e")}"
            data-sugg-add="${shEsc(s.key)}" data-name="${shEsc(s.name)}" title="${shEsc(s.reason)}${s.interval ? ` · alle ~${s.interval} Tage` : ""}">
            <ha-icon icon="mdi:plus"></ha-icon>${shEsc(s.name)}
          </button>`
      )
      .join("")}</div>`;
  }

  _clearHtml(stats) {
    if (!stats.done) return "";
    if (this._confirmClear) {
      return `<span class="confirm">${stats.done} entfernen?</span>
        <button class="text-btn danger" data-clear="confirm">Ja</button>
        <button class="text-btn" data-clear="cancel">Nein</button>`;
    }
    return `<button class="text-btn" data-clear="ask"><ha-icon icon="mdi:broom"></ha-icon>${stats.done} erledigte entfernen</button>`;
  }
}

const SH_CARD_STYLES = `
  :host {
    --sh-cookidoo: #2e9e5b;
    --sh-own: var(--primary-color, #03a9f4);
    --sh-muted: var(--secondary-text-color);
    --sh-divider: var(--divider-color, rgba(0,0,0,.12));
  }
  * { box-sizing: border-box; }
  button { font: inherit; color: inherit; }
  ha-card { overflow: hidden; height: 100%; display: flex; flex-direction: column; }
  #body, .wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .progress.top, .add.top { margin-top: 12px; }
  .compact .item { padding-top: 4px; padding-bottom: 4px; }
  .compact .name { font-size: 14px; }
  .compact .group-title { padding-top: 6px; }
  .header { display: flex; align-items: center; gap: 10px; padding: 12px 8px 8px 16px; }
  .header-icon { color: var(--state-icon-color, var(--primary-color)); }
  .title { flex: 1; font-size: 18px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge {
    font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 12px; white-space: nowrap;
    background: color-mix(in srgb, var(--primary-color) 15%, transparent); color: var(--primary-color);
  }
  .badge.done { background: color-mix(in srgb, var(--success-color, #43a047) 18%, transparent); color: var(--success-color, #43a047); }
  .icon-btn {
    background: none; border: none; cursor: pointer; border-radius: 50%; color: var(--sh-muted);
    width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    --mdc-icon-size: 20px;
  }
  .icon-btn:hover { background: rgba(127,127,127,.15); }
  .progress { height: 4px; margin: 0 16px 10px; border-radius: 2px; background: var(--sh-divider); overflow: hidden; flex-shrink: 0; }
  .progress > div { height: 100%; background: var(--success-color, #43a047); transition: width .4s; }
  .add {
    display: flex; align-items: center; margin: 0 12px 8px; padding-left: 12px; border-radius: 10px;
    background: var(--secondary-background-color, rgba(127,127,127,.08)); flex-shrink: 0;
  }
  .add input {
    flex: 1; min-width: 0; border: none; background: transparent; outline: none;
    font: inherit; font-size: 15px; color: var(--primary-text-color); padding: 9px 0;
  }
  .add-btn { color: var(--primary-color); }
  .suggest { display: flex; gap: 6px; overflow-x: auto; padding: 0 12px 8px; scrollbar-width: none; flex-shrink: 0; }
  .suggest::-webkit-scrollbar { display: none; }
  .sugg {
    display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; cursor: pointer; white-space: nowrap;
    border: 1px solid var(--sh-divider); background: none; border-radius: 16px; padding: 4px 10px 4px 6px; font-size: 13px;
    --mdc-icon-size: 16px;
  }
  .sugg ha-icon { color: var(--cat); }
  .sugg.due { border-color: color-mix(in srgb, var(--cat) 55%, transparent); }
  .sugg:hover { background: rgba(127,127,127,.1); }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 6px; }
  .group-title {
    display: flex; align-items: center; gap: 6px; padding: 8px 16px 2px; font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em; color: var(--cat); --mdc-icon-size: 15px;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  ul.flat { padding-top: 2px; }
  .item {
    display: flex; align-items: center; gap: 12px; padding: 7px 16px; cursor: pointer;
    transition: opacity .2s, background .15s; -webkit-tap-highlight-color: transparent;
  }
  .item:hover { background: rgba(127,127,127,.07); }
  .item.pending { opacity: .6; }
  .check {
    width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--cat, var(--primary-color));
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; --mdc-icon-size: 14px;
    color: transparent; transition: background .15s;
  }
  .item.partial .check { background: linear-gradient(90deg, color-mix(in srgb, var(--cat) 45%, transparent) 50%, transparent 50%); }
  .item.checked .check { background: var(--cat, var(--primary-color)); color: #fff; }
  .name { flex: 1; min-width: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item.checked .name { text-decoration: line-through; color: var(--sh-muted); }
  .qty {
    font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 10px; white-space: nowrap;
    background: var(--secondary-background-color, rgba(127,127,127,.12));
  }
  .item.checked .qty { opacity: .5; }
  .dots { display: inline-flex; gap: 3px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .dot.cookidoo { background: var(--sh-cookidoo); }
  .dot.own { background: var(--sh-own); }
  .state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 16px 24px; text-align: center; --mdc-icon-size: 36px; }
  .muted { color: var(--sh-muted); }
  .error { color: var(--error-color, #db4437); }
  .footer {
    display: flex; align-items: center; gap: 4px; padding: 4px 8px 8px; font-size: 13px;
    border-top: 1px solid var(--sh-divider); flex-shrink: 0;
  }
  .spacer { flex: 1; }
  .confirm { color: var(--sh-muted); }
  .text-btn {
    background: none; border: none; cursor: pointer; color: var(--primary-color); font-size: 13px;
    display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 8px; --mdc-icon-size: 16px;
  }
  .text-btn:hover { background: rgba(127,127,127,.1); }
  .text-btn.danger { color: var(--error-color, #db4437); }
`;

/*
 * Registration. The integration loads this file as an extra frontend module, which can run before
 * Home Assistant's scoped custom-element registry polyfill replaces window.customElements – an element
 * defined that early is silently lost (home-assistant/frontend#53890). So wait until the app itself is
 * defined in the current registry, always re-reading window.customElements.
 */
(() => {
  const NAME = "shopping-helper-card";
  const define = () => {
    const registry = window.customElements;
    if (registry.get(NAME)) return;
    registry.define(NAME, ShoppingHelperCard);
    window.customCards = window.customCards || [];
    if (!window.customCards.some((c) => c.type === NAME)) {
      window.customCards.push({
        type: NAME,
        name: "Shopping Helper",
        description: "Zusammengeführte Einkaufsliste aus Cookidoo und eigenen Listen – abhaken, hinzufügen, Vorschläge.",
        preview: true,
        documentationURL: "https://github.com/Tillhnz/ShoppingHelper-HA",
      });
    }
    console.info("%c SHOPPING-HELPER-CARD %c geladen ", "background:#2e9e5b;color:#fff;font-weight:600", "");
  };
  const appReady = () => !!window.customElements.get("home-assistant");
  const inHomeAssistant = () => !!document.querySelector("home-assistant");

  if (appReady() || !inHomeAssistant()) {
    define(); // loaded as a dashboard resource after startup, or outside HA (demo)
    return;
  }
  let tries = 0;
  const timer = setInterval(() => {
    if (appReady() || ++tries > 600) {
      clearInterval(timer);
      define();
    }
  }, 50);
})();
