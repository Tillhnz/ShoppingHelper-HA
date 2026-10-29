/**
 * Shopping Helper – Home Assistant sidebar panel.
 * Plain web component, no build step required.
 */
const DOMAIN = "shopping_helper";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

class ShoppingHelperPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._tab = "list";
    this._filter = "all"; // all | cookidoo | own
    this._search = "";
    this._showSearch = false;
    this._layout = "list"; // list | tiles
    this._sheet = null; // key of the item shown in the details sheet (tile layout)
    this._tilesHint = true;
    this._expanded = null;
    this._pending = new Set();
    this._collapsed = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem("shopping-helper-ui") || "{}");
      // "done" and "have" sections start collapsed
      this._collapsed = new Set(saved.collapsed || ["__done", "__have"]);
      this._layout = saved.layout === "tiles" ? "tiles" : "list";
      this._tilesHint = saved.tilesHint !== false;
    } catch (e) {
      /* storage not available */
    }
  }

  /* ------------------------------------------------------------ HA hooks */
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._menuButton) this._menuButton.hass = hass;
    if (first) {
      this._buildShell();
      this._subscribe();
    }
  }
  get hass() {
    return this._hass;
  }
  set narrow(narrow) {
    this._narrow = narrow;
    if (this._menuButton) this._menuButton.narrow = narrow;
    this.toggleAttribute("narrow", !!narrow);
  }
  set panel(panel) {
    this._panel = panel;
  }

  connectedCallback() {
    if (this._hass && !this._unsub) this._subscribe();
  }

  disconnectedCallback() {
    if (this._unsub) {
      this._unsub.then((unsub) => unsub()).catch(() => {});
      this._unsub = null;
    }
  }

  _subscribe() {
    if (!this._hass || this._unsub) return;
    this._unsub = this._hass.connection.subscribeMessage(
      (data) => {
        this._data = data;
        this._pending.clear();
        this._render();
      },
      { type: `${DOMAIN}/subscribe` }
    );
    this._unsub.catch((err) => {
      this._unsub = null;
      this._showError(err?.message || "Verbindung zum Shopping Helper fehlgeschlagen.");
    });
  }

  async _ws(payload, okMessage) {
    try {
      const result = await this._hass.callWS({ ...payload, type: `${DOMAIN}/${payload.type}` });
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

  _saveUi() {
    try {
      localStorage.setItem(
        "shopping-helper-ui",
        JSON.stringify({ collapsed: [...this._collapsed], layout: this._layout, tilesHint: this._tilesHint })
      );
    } catch (e) {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------ shell */
  _buildShell() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${STYLES}</style>
      <div class="header">
        <div class="menu"></div>
        <div class="title">${esc(this._panel?.title || "Einkaufen")}</div>
        <button class="icon-btn" id="refresh" title="Aktualisieren"><ha-icon icon="mdi:refresh"></ha-icon></button>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="list"><ha-icon icon="mdi:format-list-checks"></ha-icon>Einkaufsliste</button>
        <button class="tab" data-tab="stats"><ha-icon icon="mdi:chart-donut"></ha-icon>Übersicht</button>
        <button class="tab" data-tab="insights"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon>Statistik</button>
      </div>
      <div class="content">
        <section id="list-tab">
          <form class="add card" id="add-form" autocomplete="off">
            <input id="add-input" placeholder="Artikel hinzufügen …" enterkeyhint="done" autocomplete="off" />
            <select id="add-list" title="Ziel-Liste" hidden></select>
            <button type="submit" class="add-btn" title="Hinzufügen"><ha-icon icon="mdi:plus"></ha-icon></button>
          </form>
          <div id="suggestions"></div>
          <div class="listbar">
            <div id="summary" class="summary"></div>
            <div class="seg" role="group" aria-label="Filter">
              <button class="active" data-filter="all">Alle</button>
              <button data-filter="cookidoo">Cookidoo</button>
              <button data-filter="own">Eigene</button>
            </div>
            <button class="icon-btn small" id="search-toggle" title="Suchen"><ha-icon icon="mdi:magnify"></ha-icon></button>
            <button class="icon-btn small" id="layout-toggle"></button>
          </div>
          <div class="search" id="search-row" hidden><ha-icon icon="mdi:magnify"></ha-icon><input id="search" placeholder="In der Liste suchen" /></div>
          <div id="list"></div>
        </section>
        <section id="stats-tab" hidden></section>
        <section id="insights-tab" hidden></section>
        <div id="sheet"></div>
      </div>`;

    this._menuButton = document.createElement("ha-menu-button");
    this._menuButton.hass = this._hass;
    this._menuButton.narrow = this._narrow;
    root.querySelector(".menu").appendChild(this._menuButton);

    root.getElementById("refresh").addEventListener("click", () => this._ws({ type: "refresh" }, "Listen aktualisiert"));
    root.querySelectorAll(".tab").forEach((btn) =>
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        root.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
        root.getElementById("list-tab").hidden = this._tab !== "list";
        root.getElementById("stats-tab").hidden = this._tab !== "stats";
        root.getElementById("insights-tab").hidden = this._tab !== "insights";
        this._render();
      })
    );
    root.querySelectorAll("[data-filter]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this._filter = btn.dataset.filter;
        root.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("active", b === btn));
        this._render();
      })
    );
    const layoutBtn = root.getElementById("layout-toggle");
    const paintLayoutBtn = () => {
      const tiles = this._layout === "tiles";
      layoutBtn.innerHTML = `<ha-icon icon="${tiles ? "mdi:format-list-bulleted" : "mdi:view-grid-outline"}"></ha-icon>`;
      layoutBtn.title = tiles ? "Als Liste anzeigen" : "Als Kacheln anzeigen";
    };
    paintLayoutBtn();
    layoutBtn.addEventListener("click", () => {
      this._layout = this._layout === "tiles" ? "list" : "tiles";
      this._expanded = null;
      this._sheet = null;
      paintLayoutBtn();
      this._saveUi();
      this._render();
    });
    root.getElementById("search-toggle").addEventListener("click", () => {
      this._showSearch = !this._showSearch;
      const row = root.getElementById("search-row");
      row.hidden = !this._showSearch;
      if (this._showSearch) root.getElementById("search").focus();
      else {
        root.getElementById("search").value = "";
        this._search = "";
        this._render();
      }
    });
    root.getElementById("search").addEventListener("input", (ev) => {
      this._search = ev.target.value.trim().toLowerCase();
      this._render();
    });
    root.getElementById("add-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const input = root.getElementById("add-input");
      const name = input.value.trim();
      if (!name) return;
      const entity_id = root.getElementById("add-list").value || undefined;
      input.value = "";
      this._ws({ type: "add", name, entity_id }, `„${name}“ hinzugefügt`);
    });

    // event delegation for the dynamic list
    const list = root.getElementById("list");
    list.addEventListener("click", (ev) => this._onListClick(ev));
    // tile layout: long press / right click opens the details sheet
    list.addEventListener("pointerdown", (ev) => {
      const tile = ev.target.closest(".tile[data-key]");
      if (!tile || ev.target.closest("[data-have-btn],[data-more]")) return;
      clearTimeout(this._pressTimer);
      this._pressTimer = setTimeout(() => {
        this._suppressClick = true;
        setTimeout(() => (this._suppressClick = false), 700);
        this._openSheet(tile.dataset.key);
      }, 480);
    });
    ["pointerup", "pointerleave", "pointercancel", "scroll"].forEach((t) =>
      list.addEventListener(t, () => clearTimeout(this._pressTimer), { passive: true })
    );
    list.addEventListener("contextmenu", (ev) => {
      const tile = ev.target.closest(".tile[data-key]");
      if (!tile) return;
      ev.preventDefault();
      this._openSheet(tile.dataset.key);
    });
    list.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".tile[data-key]")) {
        ev.preventDefault();
        ev.target.click();
      }
    });
    const sheet = root.getElementById("sheet");
    sheet.addEventListener("click", (ev) => this._onSheetClick(ev));
    sheet.addEventListener("change", (ev) => {
      const sel = ev.target.closest("select[data-category-for]");
      if (sel) this._ws({ type: "set_category", key: sel.dataset.categoryFor, category: sel.value || null }, "Kategorie gespeichert");
    });
    list.addEventListener("change", (ev) => {
      const sel = ev.target.closest("select[data-category-for]");
      if (!sel) return;
      const key = sel.dataset.categoryFor;
      this._ws({ type: "set_category", key, category: sel.value || null }, "Kategorie gespeichert");
    });
    root.getElementById("stats-tab").addEventListener("click", (ev) => {
      this._onClearClick(ev);
    });
    root.getElementById("suggestions").addEventListener("click", (ev) => this._onSuggestionClick(ev));
  }

  _onListClick(ev) {
    const header = ev.target.closest("[data-toggle-cat]");
    if (header) {
      const id = header.dataset.toggleCat;
      this._collapsed.has(id) ? this._collapsed.delete(id) : this._collapsed.add(id);
      this._saveUi();
      this._render();
      return;
    }
    if (this._onClearClick(ev)) return;
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    const more = ev.target.closest("[data-more]");
    if (more && this._layout === "tiles") {
      this._openSheet(more.dataset.more);
      return;
    }
    if (more) {
      this._expanded = this._expanded === more.dataset.more ? null : more.dataset.more;
      this._render();
      return;
    }
    const haveBtn = ev.target.closest("[data-have-btn]");
    if (haveBtn) {
      const row = haveBtn.closest("[data-key]");
      const key = row.dataset.key;
      const have = row.dataset.have !== "true";
      this._pending.add(key);
      row.classList.add("pending");
      this._ws({ type: "have", key, have }, have ? "Als vorhanden markiert" : "Wieder auf der Liste");
      return;
    }
    const del = ev.target.closest("[data-remove]");
    if (del) {
      const key = del.dataset.remove;
      this._expanded = null;
      this._ws({ type: "remove", key }, (r) =>
        r?.hidden && !r?.removed ? "Cookidoo-Zutat ausgeblendet" : "Artikel entfernt"
      );
      return;
    }
    if (ev.target.closest(".details")) return;
    const row = ev.target.closest("[data-key]");
    if (row) {
      const key = row.dataset.key;
      // tapping a "have" item puts it back on the list; otherwise toggle bought
      if (row.dataset.have === "true") {
        this._pending.add(key);
        row.classList.add("pending");
        this._ws({ type: "have", key, have: false }, "Wieder auf der Liste");
        return;
      }
      const checked = row.dataset.checked !== "true";
      this._pending.add(key);
      row.classList.toggle("checked", checked);
      row.classList.add("pending");
      this._ws({ type: "check", key, checked });
    }
  }

  /* Two-step confirmation inside the page – confirm() is blocked in the companion app. */
  _onClearClick(ev) {
    const btn = ev.target.closest("[data-clear]");
    if (!btn) return false;
    clearTimeout(this._confirmTimer);
    const action = btn.dataset.clear;
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
      this._clearing = true;
      this._ws({ type: "clear_completed" }, (r) => this._clearMessage(r)).finally(() => {
        this._clearing = false;
        this._render();
      });
    }
    this._render();
    return true;
  }

  _clearMessage(r) {
    const removed = r?.removed ?? 0;
    const hidden = r?.hidden ?? 0;
    if (!removed && !hidden) return "Keine erledigten Artikel gefunden";
    if (r?.cookidoo_cleared) return `${removed + hidden} erledigte entfernt, Cookidoo-Liste geleert`;
    if (!hidden) return `${removed} erledigte Artikel entfernt`;
    const hints = {
      open_items: "Cookidoo wird geleert, sobald dort alles abgehakt ist.",
      button_disabled: "Aktiviere bei der Cookidoo-Integration den Knopf „Einkaufsliste leeren“, dann wird Cookidoo mitgeleert.",
      button_missing: "Aktiviere bei der Cookidoo-Integration den Knopf „Einkaufsliste leeren“, dann wird Cookidoo mitgeleert.",
      button_unavailable: "Der Cookidoo-Knopf „Einkaufsliste leeren“ ist gerade nicht erreichbar.",
      press_failed: "Cookidoo konnte nicht geleert werden.",
    };
    const hint = hints[r?.cookidoo_hint] ? ` ${hints[r.cookidoo_hint]}` : "";
    return `${removed + hidden} erledigte entfernt (${hidden} Cookidoo-Zutaten ausgeblendet).${hint}`;
  }

  _clearFooter(stats) {
    const hiddenOnly = !stats.done && stats.hidden > 0;
    if (!stats.done && !hiddenOnly && !this._clearing) return "";
    let inner;
    if (this._clearing) {
      inner = `<span class="muted">Entferne erledigte Artikel …</span>`;
    } else if (this._confirmClear) {
      inner = `<span>${hiddenOnly ? "Ausgeblendete Zutaten aus Cookidoo entfernen?" : `${stats.done} erledigte aus allen Listen entfernen?`}</span>
        <button class="text-btn danger" data-clear="confirm"><ha-icon icon="mdi:check"></ha-icon>Entfernen</button>
        <button class="text-btn" data-clear="cancel">Abbrechen</button>`;
    } else {
      inner = `<button class="text-btn" data-clear="ask"><ha-icon icon="mdi:broom"></ha-icon>${
        hiddenOnly ? `${stats.hidden} ausgeblendete Cookidoo-Zutaten entfernen` : `${stats.done} erledigte entfernen`
      }</button>`;
    }
    return `<div class="footer-actions">${inner}</div>`;
  }

  _showError(message) {
    const list = this.shadowRoot?.getElementById("list");
    if (list) list.innerHTML = `<div class="card empty error"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><p>${esc(message)}</p></div>`;
  }

  /* ------------------------------------------------------------ render */
  _render() {
    if (!this.shadowRoot.getElementById("list")) return;
    if (!this._data) {
      this.shadowRoot.getElementById("list").innerHTML = `<div class="loading">Lade Einkaufslisten …</div>`;
      return;
    }
    this._renderListSelect();
    if (this._tab === "list") this._renderList();
    else if (this._tab === "stats") this._renderStats();
    else this._renderInsights();
  }

  /* ------------------------------------------------------------ suggestions */
  _renderSuggestions() {
    const el = this.shadowRoot.getElementById("suggestions");
    const items = (this._data.suggestions || []).filter((s) => !this._pending.has("sugg:" + s.key));
    if (!items.length || this._search) {
      el.innerHTML = "";
      return;
    }
    const colors = Object.fromEntries((this._data.all_categories || []).map((c) => [c.id, c.color]));
    const detail = (s) => (s.interval ? `${s.reason} · alle ~${s.interval} Tage` : s.reason);
    el.innerHTML = `<div class="suggest" aria-label="Vorschläge">
      <ha-icon class="suggest-icon" icon="mdi:lightbulb-on-outline" title="Vorschläge aus deinen Einkäufen"></ha-icon>
      <div class="suggest-row">${items
        .map(
          (s) => `<span class="suggestion ${s.reason === "fällig" ? "due" : ""}" style="--cat:${esc(colors[s.category] || "#9e9e9e")}" title="${esc(s.name)}: ${esc(detail(s))}">
            <button class="sugg-add" data-sugg-add="${esc(s.key)}" data-name="${esc(s.name)}"><ha-icon icon="mdi:plus"></ha-icon>${esc(s.name)}</button>
            <button class="sugg-x" data-sugg-snooze="${esc(s.key)}" title="Eine Woche nicht vorschlagen" aria-label="${esc(s.name)} eine Woche nicht vorschlagen"><ha-icon icon="mdi:close"></ha-icon></button>
          </span>`
        )
        .join("")}</div>
    </div>`;
  }

  _onSuggestionClick(ev) {
    const add = ev.target.closest("[data-sugg-add]");
    if (add) {
      const name = add.dataset.name;
      const entity_id = this.shadowRoot.getElementById("add-list").value || undefined;
      this._pending.add("sugg:" + add.dataset.suggAdd);
      this._renderSuggestions();
      this._ws({ type: "add", name, entity_id }, `„${name}“ hinzugefügt`);
      return;
    }
    const snooze = ev.target.closest("[data-sugg-snooze]");
    if (snooze) {
      this._pending.add("sugg:" + snooze.dataset.suggSnooze);
      this._renderSuggestions();
      this._ws({ type: "snooze", key: snooze.dataset.suggSnooze, days: 7 }, "Eine Woche lang nicht vorgeschlagen");
    }
  }

  _renderListSelect() {
    const select = this.shadowRoot.getElementById("add-list");
    const lists = (this._data.lists || []).filter((l) => l.available && l.can_add !== false);
    const sig = lists.map((l) => l.entity_id + l.name).join("|");
    if (select.dataset.sig === sig) return;
    const current = select.value;
    select.innerHTML = lists
      .map((l) => `<option value="${esc(l.entity_id)}" ${l.default ? "selected" : ""}>${esc(l.name)}</option>`)
      .join("");
    if (current && lists.some((l) => l.entity_id === current)) select.value = current;
    select.hidden = lists.length < 2;
    select.dataset.sig = sig;
  }

  _visible(item) {
    if (this._filter === "cookidoo" && !item.cookidoo) return false;
    if (this._filter === "own" && !item.own) return false;
    if (this._search && !item.name.toLowerCase().includes(this._search)) return false;
    return true;
  }

  _renderList() {
    const { categories = [], stats = {}, all_categories = [] } = this._data;
    const root = this.shadowRoot;
    this._renderSuggestions();

    root.getElementById("summary").innerHTML = stats.total
      ? `<span><b>${stats.open}</b> offen</span>
         <span class="progress" title="${stats.progress}% erledigt"><span style="width:${stats.progress}%"></span></span>`
      : "";

    const keep = (i) => this._pending.has(i.key); // keep a just-tapped row in place until the update
    const openItem = (i) => !i.checked || (keep(i) && !i.have);
    if (this._layout === "tiles") {
      this._renderTiles(categories, stats, keep, openItem);
      this._renderSheet();
      return;
    }
    this.shadowRoot.getElementById("sheet").innerHTML = "";
    const sections = categories
      .map((cat) => {
        const items = cat.items.filter((i) => this._visible(i) && openItem(i));
        if (!items.length) return "";
        const collapsed = this._collapsed.has(cat.id) && !this._search;
        return `<section class="category card" style="--cat:${esc(cat.color)}">
          <button class="cat-header" data-toggle-cat="${esc(cat.id)}" aria-expanded="${!collapsed}">
            <span class="cat-icon"><ha-icon icon="${esc(cat.icon)}"></ha-icon></span>
            <span class="cat-name">${esc(cat.name)}</span>
            <span class="cat-count">${items.length}</span>
            <ha-icon class="chevron ${collapsed ? "" : "open"}" icon="mdi:chevron-down"></ha-icon>
          </button>
          ${collapsed ? "" : `<ul>${items.map((i) => this._itemHtml(i, all_categories, cat.color)).join("")}</ul>`}
        </section>`;
      })
      .join("");

    const all = categories.flatMap((c) => c.items.map((i) => ({ ...i, color: c.color }))).filter((i) => this._visible(i));
    const bought = all.filter((i) => i.checked && !i.have && !keep(i));
    const have = all.filter((i) => i.have);
    const group = (id, title, icon, items, extra = "") => {
      if (!items.length) return "";
      const collapsed = this._collapsed.has(id) && !this._search;
      return `<section class="category card done-group">
        <button class="cat-header" data-toggle-cat="${id}" aria-expanded="${!collapsed}">
          <span class="cat-icon plain"><ha-icon icon="${icon}"></ha-icon></span>
          <span class="cat-name">${title}</span>
          <span class="cat-count">${items.length}</span>
          <ha-icon class="chevron ${collapsed ? "" : "open"}" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${collapsed ? "" : `<ul>${items.map((i) => this._itemHtml(i, all_categories, i.color)).join("")}</ul>${extra}`}
      </section>`;
    };

    const empty = !sections
      ? `<div class="card empty">
          <ha-icon icon="mdi:cart-check"></ha-icon>
          <p>${stats.total ? (this._search || this._filter !== "all" ? "Keine passenden Artikel." : "Alles erledigt.") : "Die Listen sind leer."}</p>
        </div>`
      : "";

    root.getElementById("list").innerHTML =
      (sections || empty) +
      group("__done", "Im Wagen", "mdi:cart-check", bought) +
      group("__have", "Bereits vorhanden", "mdi:home-outline", have) +
      this._clearFooter(stats);
  }

  /* ------------------------------------------------------------ tile layout */
  _renderTiles(categories, stats, keep, openItem) {
    const root = this.shadowRoot;
    const tile = (i, color) => {
      const pending = this._pending.has(i.key);
      return `<div class="tile ${i.checked ? "checked" : ""} ${i.have ? "have" : ""} ${i.partial ? "partial" : ""} ${pending ? "pending" : ""}"
          role="button" tabindex="0" style="--cat:${esc(color)}" data-key="${esc(i.key)}" data-checked="${i.checked}" data-have="${i.have}"
          aria-label="${esc(i.name)}${i.quantity ? ", " + esc(i.quantity) : ""}">
        <span class="tile-emoji" aria-hidden="true">${esc(i.emoji || "🛒")}</span>
        <span class="tile-name">${esc(i.name)}</span>
        <span class="tile-qty">${esc(i.quantity || "")}</span>
        ${i.sources.length > 1 ? `<span class="tile-merged" title="Aus ${i.sources.length} Einträgen">${i.sources.length}</span>` : ""}
        ${!i.checked || i.have ? `<button class="tile-have ${i.have ? "on" : ""}" data-have-btn title="${i.have ? "Doch einkaufen" : "Bereits vorhanden"}" aria-label="${esc(i.name)}: ${i.have ? "doch einkaufen" : "bereits vorhanden"}"><ha-icon icon="${i.have ? "mdi:home" : "mdi:home-outline"}"></ha-icon></button>` : ""}
        <button class="tile-more" data-more="${esc(i.key)}" title="Details" aria-label="Details zu ${esc(i.name)}"><ha-icon icon="mdi:dots-horizontal"></ha-icon></button>
      </div>`;
    };
    const grid = (items, colorOf) => `<div class="tiles">${items.map((i) => tile(i, colorOf(i))).join("")}</div>`;
    const header = (id, title, count, icon, color) => {
      const collapsed = this._collapsed.has(id) && !this._search;
      return [
        collapsed,
        `<button class="tile-head" data-toggle-cat="${esc(id)}" aria-expanded="${!collapsed}" ${color ? `style="--cat:${esc(color)}"` : ""}>
          ${icon ? `<ha-icon icon="${icon}"></ha-icon>` : `<span class="dot" style="background:var(--cat)"></span>`}
          <span>${title}</span><span class="cat-count">${count}</span>
          <ha-icon class="chevron ${collapsed ? "" : "open"}" icon="mdi:chevron-down"></ha-icon>
        </button>`,
      ];
    };

    let html = "";
    for (const cat of categories) {
      const items = cat.items.filter((i) => this._visible(i) && openItem(i));
      if (!items.length) continue;
      const [collapsed, head] = header(cat.id, esc(cat.name), items.length, null, cat.color);
      html += `<section class="tile-group">${head}${collapsed ? "" : grid(items, () => cat.color)}</section>`;
    }
    if (!html) {
      html = `<div class="card empty"><ha-icon icon="mdi:cart-check"></ha-icon>
        <p>${stats.total ? (this._search || this._filter !== "all" ? "Keine passenden Artikel." : "Alles erledigt.") : "Die Listen sind leer."}</p></div>`;
    }
    const all = categories.flatMap((c) => c.items.map((i) => ({ ...i, color: c.color }))).filter((i) => this._visible(i));
    const bought = all.filter((i) => i.checked && !i.have && !keep(i));
    const have = all.filter((i) => i.have);
    for (const [id, title, icon, items] of [
      ["__done", "Im Wagen", "mdi:cart-check", bought],
      ["__have", "Bereits vorhanden", "mdi:home-outline", have],
    ]) {
      if (!items.length) continue;
      const [collapsed, head] = header(id, title, items.length, icon);
      html += `<section class="tile-group muted-group">${head}${collapsed ? "" : grid(items, (i) => i.color)}</section>`;
    }
    const hint = this._tilesHint && stats.open
      ? `<p class="tile-hint">Antippen: gekauft · <ha-icon icon="mdi:home-outline"></ha-icon> vorhanden · gedrückt halten oder <ha-icon icon="mdi:dots-horizontal"></ha-icon>: Details</p>`
      : "";
    root.getElementById("list").innerHTML = hint + html + this._clearFooter(stats);
  }

  _findItem(key) {
    for (const cat of this._data?.categories || []) {
      const item = cat.items.find((i) => i.key === key);
      if (item) return { item, color: cat.color };
    }
    return null;
  }

  _openSheet(key) {
    this._sheet = key;
    this._sheetOpenedAt = Date.now();
    if (this._tilesHint) {
      this._tilesHint = false;
      this._saveUi();
    }
    this._render();
  }

  _renderSheet() {
    const el = this.shadowRoot.getElementById("sheet");
    const found = this._sheet && this._findItem(this._sheet);
    if (!found) {
      this._sheet = null;
      el.innerHTML = "";
      return;
    }
    const { item, color } = found;
    const options = [`<option value="">Automatisch</option>`]
      .concat(
        (this._data.all_categories || []).map(
          (c) => `<option value="${esc(c.id)}" ${item.category_overridden && c.id === item.category ? "selected" : ""}>${esc(c.name)}</option>`
        )
      )
      .join("");
    el.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(item.name)}" style="--cat:${esc(color)}">
        <div class="sheet-head">
          <span class="sheet-emoji">${esc(item.emoji || "🛒")}</span>
          <div class="sheet-title"><b>${esc(item.name)}</b><span>${esc(item.quantity || "ohne Mengenangabe")}</span></div>
          <button class="icon-btn small" data-sheet-close title="Schließen"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <div class="sheet-actions">
          <button class="sheet-btn primary-btn" data-sheet-check>${item.checked && !item.have ? `<ha-icon icon="mdi:undo"></ha-icon>Wieder auf die Liste` : `<ha-icon icon="mdi:cart-check"></ha-icon>Gekauft`}</button>
          <button class="sheet-btn ${item.have ? "on" : ""}" data-sheet-have><ha-icon icon="${item.have ? "mdi:home" : "mdi:home-outline"}"></ha-icon>${item.have ? "Doch einkaufen" : "Bereits vorhanden"}</button>
        </div>
        ${this._breakdown(item)}
        <div class="detail-actions">
          <label>Kategorie <select data-category-for="${esc(item.key)}">${options}</select></label>
          <button class="text-btn danger" data-remove="${esc(item.key)}"><ha-icon icon="mdi:delete-outline"></ha-icon>Löschen</button>
        </div>
      </div>`;
  }

  _onSheetClick(ev) {
    const t = ev.target;
    const close = () => {
      this._sheet = null;
      this._render();
    };
    // the finger that long-pressed is lifted onto the backdrop – don't close right away
    if (Date.now() - (this._sheetOpenedAt || 0) < 450) return;
    if (t.closest("[data-sheet-close]")) return close();
    const found = this._sheet && this._findItem(this._sheet);
    if (!found) return close();
    const { item } = found;
    if (t.closest("[data-sheet-check]")) {
      const checked = !(item.checked && !item.have);
      this._pending.add(item.key);
      close();
      this._ws({ type: "check", key: item.key, checked }, checked ? `„${item.name}“ gekauft` : "Wieder auf der Liste");
    } else if (t.closest("[data-sheet-have]")) {
      this._pending.add(item.key);
      close();
      this._ws({ type: "have", key: item.key, have: !item.have }, !item.have ? "Als vorhanden markiert" : "Wieder auf der Liste");
    } else if (t.closest("[data-remove]")) {
      close();
      this._ws({ type: "remove", key: item.key }, (r) => (r?.hidden && !r?.removed ? "Cookidoo-Zutat ausgeblendet" : "Artikel entfernt"));
    }
  }

  _breakdown(item) {
    const rows = item.sources
      .map((s) => {
        const original = s.description ? `${s.summary} · ${s.description}` : s.summary;
        const state = s.have ? "vorhanden" : s.done ? "gekauft" : "";
        return `<li>
          <span class="dot ${s.is_cookidoo ? "cookidoo" : "own"}"></span>
          <span class="b-list">${esc(s.list_name)}</span>
          <span class="b-orig">„${esc(original)}“${state ? ` <span class="b-state">${state}</span>` : ""}</span>
          <span class="b-qty">${esc(s.quantity || "–")}</span>
        </li>`;
      })
      .join("");
    const notes = item.notes.length ? `<p class="b-note">Notiz: ${esc(item.notes.join(", "))}</p>` : "";
    const mixed = item.mixed_units ? `<p class="b-note">Gramm und Liter mit ≈ 1 g/ml zusammengerechnet.</p>` : "";
    const partial = item.partial ? `<p class="b-note">Summe enthält nur die noch offenen Einträge.</p>` : "";
    return `<div class="breakdown">
      <div class="b-title">${item.sources.length > 1 ? `Zusammengefasst aus ${item.sources.length} Einträgen` : "Herkunft"}</div>
      <ul>${rows}</ul>
      ${item.sources.length > 1 && item.quantity ? `<div class="b-total"><span>Gesamt</span><b>${esc(item.quantity)}</b></div>` : ""}
      ${partial}${mixed}${notes}
    </div>`;
  }

  _itemHtml(item, allCategories, color) {
    const pending = this._pending.has(item.key);
    const expanded = this._expanded === item.key;
    const options = [`<option value="">Automatisch</option>`]
      .concat(
        allCategories.map(
          (c) =>
            `<option value="${esc(c.id)}" ${item.category_overridden && c.id === item.category ? "selected" : ""}>${esc(c.name)}</option>`
        )
      )
      .join("");
    const dots = item.sources
      .map((s) => `<span class="dot ${s.is_cookidoo ? "cookidoo" : "own"}" title="${esc(s.list_name)}"></span>`)
      .join("");
    const showHave = !item.checked || item.have;
    return `<li class="item ${item.checked ? "checked" : ""} ${item.have ? "have" : ""} ${item.partial ? "partial" : ""} ${pending ? "pending" : ""} ${expanded ? "expanded" : ""}"
              style="--cat:${esc(color)}" data-key="${esc(item.key)}" data-checked="${item.checked}" data-have="${item.have}">
      <div class="row">
        <span class="check">${item.have ? `<ha-icon icon="mdi:home"></ha-icon>` : `<ha-icon icon="mdi:check"></ha-icon>`}</span>
        <span class="item-name">${esc(item.name)}</span>
        <span class="dots">${dots}</span>
        ${item.quantity ? `<span class="qty">${esc(item.quantity)}</span>` : ""}
        ${
          showHave
            ? `<button class="have-btn ${item.have ? "on" : ""}" data-have-btn title="${item.have ? "Doch einkaufen" : "Bereits vorhanden"}" aria-label="${esc(item.name)}: ${item.have ? "doch einkaufen" : "bereits vorhanden"}"><ha-icon icon="${item.have ? "mdi:home" : "mdi:home-outline"}"></ha-icon></button>`
            : ""
        }
        <button class="icon-btn small more" data-more="${esc(item.key)}" title="Details" aria-expanded="${expanded}"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      </div>
      ${
        expanded
          ? `<div class="details">
              ${this._breakdown(item)}
              <div class="detail-actions">
                <label>Kategorie <select data-category-for="${esc(item.key)}">${options}</select></label>
                <button class="text-btn danger" data-remove="${esc(item.key)}"><ha-icon icon="mdi:delete-outline"></ha-icon>Löschen</button>
              </div>
            </div>`
          : ""
      }
    </li>`;
  }

  /* ------------------------------------------------------------ statistics */
  _renderStats() {
    const { categories = [], stats = {} } = this._data;
    const openCats = categories.filter((c) => c.open > 0);
    const el = this.shadowRoot.getElementById("stats-tab");
    el.innerHTML = `
      <div class="kpis">
        ${this._kpi("mdi:cart-outline", stats.open ?? 0, "Offen")}
        ${this._kpi("mdi:cart-check", stats.bought ?? stats.done ?? 0, "Im Wagen")}
        ${this._kpi("mdi:home-outline", stats.have ?? 0, "Bereits vorhanden")}
        ${this._kpi("mdi:call-merge", stats.merged ?? 0, "Zusammengeführt")}
      </div>
      <div class="grid">
        <div class="card chart-card">
          <h3>Offene Artikel nach Kategorie</h3>
          ${openCats.length ? this._donut(openCats, stats.open) : `<p class="muted">Keine offenen Artikel.</p>`}
        </div>
        <div class="card chart-card">
          <h3>Herkunft</h3>
          ${this._sourceBars(stats)}
          <h3 class="mt">Fortschritt</h3>
          ${this._ring(stats.progress || 0)}
        </div>
      </div>
      ${this._clearFooter(stats)}
      <p class="muted small center">Aktualisiert: ${esc(new Date(this._data.updated).toLocaleTimeString("de-DE"))}</p>`;
  }

  /* ------------------------------------------------------------ insights (history) */
  _renderInsights() {
    const st = this._data.statistics || {};
    const k = st.kpis || {};
    const history = this._data.history || {};
    const el = this.shadowRoot.getElementById("insights-tab");
    if (!k.total_purchases) {
      el.innerHTML = `<div class="card empty">
        <ha-icon icon="mdi:chart-timeline-variant"></ha-icon>
        <p>Die Statistik füllt sich, sobald du Artikel abhakst.<br>Jeder abgehakte Artikel zählt als Einkauf.</p>
      </div>
      <div class="card chart-card"><h3>Letzte 14 Tage</h3>${this._dailyChart(history.daily || [])}</div>`;
      return;
    }
    const catMeta = Object.fromEntries((this._data.all_categories || []).map((c) => [c.id, c]));
    const cats = Object.entries(st.categories || {}).map(([id, count]) => ({
      name: catMeta[id]?.name || id,
      color: catMeta[id]?.color || "#9e9e9e",
      open: count,
    }));
    const catTotal = cats.reduce((a, c) => a + c.open, 0);
    const since = new Date(k.tracking_since + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    el.innerHTML = `
      <div class="kpis">
        ${this._kpi("mdi:cart-check", k.bought_30d, "Gekauft (30 Tage)")}
        ${this._kpi("mdi:store-outline", k.trips_30d, "Einkäufe (30 Tage)")}
        ${this._kpi("mdi:basket-outline", String(k.avg_per_trip).replace(".", ","), "Ø Artikel pro Einkauf")}
        ${this._kpi("mdi:calendar-star", k.favorite_weekday || "–", "Häufigster Einkaufstag")}
      </div>
      <div class="grid">
        <div class="card chart-card wide">
          <h3>Gekaufte Artikel pro Woche</h3>
          ${this._weeklyChart(st.weekly || [])}
        </div>
        <div class="card chart-card">
          <h3>Einkaufstage</h3>
          <p class="muted small sub">Gekaufte Artikel nach Wochentag, letzte 90 Tage</p>
          ${this._weekdayChart(st.weekday || [])}
        </div>
        <div class="card chart-card">
          <h3>Woher die Artikel kommen</h3>
          ${this._sourceSplit(st.sources || {})}
          <h3 class="mt">Gesamt</h3>
          <div class="facts">
            <div><b>${k.total_purchases}</b><span>Käufe seit ${esc(since)}</span></div>
            <div><b>${k.distinct_items}</b><span>verschiedene Artikel</span></div>
          </div>
        </div>
        <div class="card chart-card wide">
          <h3>Gekauft nach Kategorie</h3>
          <p class="muted small sub">Letzte 90 Tage</p>
          ${cats.length ? this._donut(cats, catTotal, "gekauft") : `<p class="muted">Noch keine Daten.</p>`}
        </div>
        <div class="card chart-card wide">
          <h3>Am häufigsten gekauft</h3>
          ${this._purchaseTable(st.top || [], catMeta)}
        </div>
        <div class="card chart-card wide">
          <h3>Letzte 14 Tage</h3>
          ${this._dailyChart(history.daily || [])}
        </div>
      </div>`;
  }

  _barChart(values, labels, { highlightLast = false, title = (v) => v } = {}) {
    const w = 560, h = 160, pad = 26, bottom = 22, top = 14;
    const max = Math.max(...values, 1);
    const step = (w - pad) / values.length;
    const bw = Math.min(28, step * 0.62);
    const y = (v) => h - bottom - (v / max) * (h - bottom - top);
    const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
    const grid = ticks
      .map((v) => `<line x1="${pad}" x2="${w}" y1="${y(v)}" y2="${y(v)}" class="grid-line"/><text x="${pad - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`)
      .join("");
    const bars = values
      .map((v, i) => {
        const x = pad + i * step + step / 2;
        const cls = highlightLast && i === values.length - 1 ? "bar-current" : "bar-bought";
        return `<g><rect x="${x - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(h - bottom - y(v), 0)}" rx="4" class="${cls}"><title>${esc(title(v, i))}</title></rect>
          ${v ? `<text x="${x}" y="${y(v) - 4}" text-anchor="middle" class="bar-num">${v}</text>` : ""}
          <text x="${x}" y="${h - 6}" text-anchor="middle" class="axis">${esc(labels[i])}</text></g>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${w} ${h}" class="daily" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>`;
  }

  _weeklyChart(weeks) {
    if (!weeks.length) return `<p class="muted">Noch keine Daten.</p>`;
    const labels = weeks.map((w, i) => {
      const d = new Date(w.week + "T12:00:00");
      return i % 2 === (weeks.length - 1) % 2 ? `${d.getDate()}.${d.getMonth() + 1}.` : "";
    });
    return (
      this._barChart(weeks.map((w) => w.bought), labels, {
        highlightLast: true,
        title: (v, i) => `Woche ab ${weeks[i].week}: ${v} gekauft, ${weeks[i].added} hinzugefügt`,
      }) + `<div class="bar-legend"><span><i class="bar-key bought"></i>gekauft</span><span><i class="bar-key current"></i>diese Woche</span></div>`
    );
  }

  _weekdayChart(days) {
    const max = Math.max(...days.map((d) => d.bought), 1);
    return `<div class="weekday">${days
      .map(
        (d) => `<div class="wd ${d.bought === max && d.bought ? "top" : ""}" title="${esc(d.day)}: ${d.bought} Artikel">
          <div class="wd-track"><div class="wd-bar" style="height:${(d.bought / max) * 100}%"></div></div>
          <span class="wd-num">${d.bought}</span><span class="wd-day">${esc(d.day)}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  _sourceSplit(src) {
    const c = src.cookidoo || 0, o = src.own || 0, t = c + o || 1;
    const cp = Math.round((c / t) * 100);
    return `<div class="split">
        <div class="split-bar"><div class="split-c" style="width:${cp}%"></div><div class="split-o" style="width:${100 - cp}%"></div></div>
        <div class="split-legend">
          <span><span class="dot cookidoo"></span>Cookidoo <b>${cp}%</b> <span class="muted">(${c})</span></span>
          <span><span class="dot own"></span>Eigene Listen <b>${100 - cp}%</b> <span class="muted">(${o})</span></span>
        </div>
      </div>`;
  }

  _purchaseTable(top, catMeta) {
    if (!top.length) return `<p class="muted">Noch keine Daten.</p>`;
    const max = Math.max(...top.map((t) => t.count), 1);
    const today = new Date(new Date().toDateString());
    const ago = (iso) => {
      if (!iso) return "–";
      const days = Math.round((today - new Date(iso + "T00:00:00")) / 86400000);
      return days <= 0 ? "heute" : days === 1 ? "gestern" : `vor ${days} Tagen`;
    };
    return `<div class="ptable">${top
      .map(
        (t) => `<div class="prow" style="--cat:${esc(catMeta[t.category]?.color || "#9e9e9e")}">
          <span class="swatch"></span>
          <span class="pname">${esc(t.name)}</span>
          <span class="ptrack"><span style="width:${(t.count / max) * 100}%"></span></span>
          <span class="pcount">${t.count}×</span>
          <span class="pmeta">${t.interval ? `alle ~${t.interval} Tage` : "&nbsp;"}</span>
          <span class="pmeta">${ago(t.last)}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  _kpi(icon, value, label) {
    return `<div class="card kpi"><ha-icon icon="${icon}"></ha-icon><div><div class="kpi-value">${esc(value)}</div><div class="kpi-label">${label}</div></div></div>`;
  }

  _donut(cats, total, label = "offen") {
    const r = 70;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const gap = cats.length > 1 ? 2 : 0;
    const arcs = cats
      .map((cat) => {
        const len = (cat.open / total) * c;
        const seg = `<circle r="${r}" cx="90" cy="90" fill="none" stroke="${esc(cat.color)}" stroke-width="26"
          stroke-dasharray="${Math.max(len - gap, 0.5)} ${c}" stroke-dashoffset="${-offset}"
          transform="rotate(-90 90 90)"><title>${esc(cat.name)}: ${cat.open}</title></circle>`;
        offset += len;
        return seg;
      })
      .join("");
    const legend = cats
      .map(
        (cat) =>
          `<li><span class="swatch" style="background:${esc(cat.color)}"></span><span class="legend-name">${esc(cat.name)}</span><b>${cat.open}</b></li>`
      )
      .join("");
    return `<div class="donut-wrap">
      <svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Verteilung nach Kategorie">
        ${arcs}
        <text x="90" y="88" text-anchor="middle" class="donut-value">${total}</text>
        <text x="90" y="108" text-anchor="middle" class="donut-label">${esc(label)}</text>
      </svg>
      <ul class="legend">${legend}</ul>
    </div>`;
  }

  _sourceBars(stats) {
    const lists = stats.lists || [];
    if (!lists.length) return `<p class="muted">Keine Listen verfügbar.</p>`;
    const max = Math.max(...lists.map((l) => l.total), 1);
    return `<div class="bars">${lists
      .map(
        (l) => `<div class="bar-row">
          <div class="bar-label"><span class="dot ${l.cookidoo ? "cookidoo" : "own"}"></span>${esc(l.name)}</div>
          <div class="bar-track">
            <div class="bar open ${l.cookidoo ? "cookidoo" : "own"}" style="width:${(l.open / max) * 100}%"></div>
            <div class="bar done" style="width:${(l.done / max) * 100}%"></div>
          </div>
          <div class="bar-value">${l.open}<span class="muted">/${l.total}</span></div>
        </div>`
      )
      .join("")}
      <div class="bar-legend"><span><i class="bar-key open"></i>offen</span><span><i class="bar-key done"></i>erledigt</span></div>
    </div>`;
  }

  _ring(progress) {
    const r = 34;
    const c = 2 * Math.PI * r;
    return `<div class="ring-wrap">
      <svg viewBox="0 0 84 84" class="ring">
        <circle r="${r}" cx="42" cy="42" fill="none" class="ring-bg" stroke-width="9"/>
        <circle r="${r}" cx="42" cy="42" fill="none" class="ring-fg" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${(progress / 100) * c} ${c}" transform="rotate(-90 42 42)"/>
        <text x="42" y="47" text-anchor="middle" class="ring-text">${progress}%</text>
      </svg>
      <p class="muted">${progress >= 100 ? "Alles im Wagen 🎉" : progress > 0 ? "Weiter so!" : "Noch nichts abgehakt"}</p>
    </div>`;
  }

  _dailyChart(days) {
    if (!days.length) return `<p class="muted">Noch keine Daten.</p>`;
    const w = 560, h = 170, pad = 24, bottom = 22;
    const max = Math.max(...days.map((d) => Math.max(d.added, d.done)), 1);
    const step = (w - pad) / days.length;
    const bw = Math.min(12, step / 2.8);
    const y = (v) => h - bottom - (v / max) * (h - bottom - 14);
    const grid = [0, 0.5, 1]
      .map((f) => {
        const v = Math.round(max * f);
        return `<line x1="${pad}" x2="${w}" y1="${y(v)}" y2="${y(v)}" class="grid-line"/><text x="${pad - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`;
      })
      .join("");
    const bars = days
      .map((d, i) => {
        const x = pad + i * step + step / 2;
        const date = new Date(d.date + "T12:00:00");
        return `<g>
          <rect x="${x - bw - 1}" y="${y(d.added)}" width="${bw}" height="${h - bottom - y(d.added)}" rx="3" class="bar-added"><title>${d.date}: ${d.added} hinzugefügt</title></rect>
          <rect x="${x + 1}" y="${y(d.done)}" width="${bw}" height="${h - bottom - y(d.done)}" rx="3" class="bar-done"><title>${d.date}: ${d.done} erledigt</title></rect>
          <text x="${x}" y="${h - 6}" text-anchor="middle" class="axis">${i % 2 === days.length % 2 ? "" : WEEKDAYS[date.getDay()]}</text>
        </g>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${w} ${h}" class="daily" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>
      <div class="bar-legend"><span><i class="bar-key added"></i>hinzugefügt</span><span><i class="bar-key done-strong"></i>erledigt</span></div>`;
  }

  _topList(top) {
    if (!top.length) return `<p class="muted">Sobald Artikel auf deinen Listen landen, siehst du hier die Favoriten.</p>`;
    const max = Math.max(...top.map((t) => t.count), 1);
    return `<ol class="top">${top
      .map(
        (t, i) => `<li><span class="rank">${i + 1}</span><span class="top-name">${esc(t.name)}</span>
          <span class="top-track"><span style="width:${(t.count / max) * 100}%"></span></span><b>${t.count}×</b></li>`
      )
      .join("")}</ol>`;
  }
}

const STYLES = `
  :host {
    display: block;
    min-height: 100vh;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    --sh-card: var(--card-background-color, var(--ha-card-background, #fff));
    --sh-radius: var(--ha-card-border-radius, 12px);
    --sh-cookidoo: #2e9e5b;
    --sh-own: var(--primary-color, #03a9f4);
    --sh-muted: var(--secondary-text-color);
    --sh-divider: var(--divider-color, rgba(0,0,0,.12));
  }
  * { box-sizing: border-box; }
  button { font: inherit; color: inherit; }
  [hidden] { display: none !important; }
  .header {
    display: flex; align-items: center; gap: 4px;
    height: var(--header-height, 56px); padding: 0 8px 0 4px;
    background: var(--app-header-background-color, var(--primary-color));
    color: var(--app-header-text-color, #fff);
    position: sticky; top: 0; z-index: 3;
    border-bottom: var(--app-header-border-bottom, none);
  }
  .menu { min-width: 8px; }
  .title { flex: 1; font-size: 20px; font-weight: 400; margin-left: 8px; }
  .icon-btn {
    background: none; border: none; cursor: pointer; border-radius: 50%;
    width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { background: rgba(127,127,127,.15); }
  .icon-btn.small { width: 34px; height: 34px; color: var(--sh-muted); flex-shrink: 0; }
  .tabs {
    display: flex; justify-content: center; gap: 4px;
    background: var(--app-header-background-color, var(--primary-color));
    position: sticky; top: var(--header-height, 56px); z-index: 2;
  }
  .tab {
    background: none; border: none; cursor: pointer; padding: 10px 18px 12px;
    color: var(--app-header-text-color, #fff); opacity: .7; display: flex; gap: 6px; align-items: center;
    border-bottom: 3px solid transparent; --mdc-icon-size: 20px;
  }
  .tab.active { opacity: 1; border-bottom-color: var(--app-header-text-color, #fff); }
  .content { max-width: 920px; margin: 0 auto; padding: 16px; }
  .card {
    background: var(--sh-card); border-radius: var(--sh-radius);
    box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.12));
    border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--sh-divider));
  }
  /* add form */
  .add { display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 14px; margin-bottom: 10px; }
  .add input {
    flex: 1; min-width: 0; border: none; background: transparent; font-size: 16px;
    color: var(--primary-text-color); padding: 10px 0; outline: none;
  }
  select {
    font: inherit; font-size: 14px; color: var(--primary-text-color);
    background: var(--secondary-background-color, transparent);
    border: 1px solid var(--sh-divider); border-radius: 8px; padding: 6px 8px; max-width: 160px;
  }
  .add select {
    max-width: 45%; flex-shrink: 0; padding: 6px 4px 6px 8px; font-size: 14px;
    text-overflow: ellipsis; background-color: var(--secondary-background-color, transparent);
  }
  .add-btn {
    width: 40px; height: 40px; flex-shrink: 0; border-radius: 50%; border: none; cursor: pointer;
    background: var(--primary-color); color: var(--text-primary-color, #fff);
    display: inline-flex; align-items: center; justify-content: center;
  }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  /* list bar: summary + filter */
  .listbar { display: flex; align-items: center; gap: 10px; margin: 0 2px 10px; }
  .summary { flex: 1; display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--sh-muted); min-width: 0; }
  .summary b { color: var(--primary-text-color); font-size: 16px; font-variant-numeric: tabular-nums; }
  .progress { flex: 1; max-width: 140px; height: 4px; border-radius: 2px; background: var(--sh-divider); overflow: hidden; }
  .progress > span { display: block; height: 100%; background: var(--success-color, #43a047); transition: width .4s; }
  .seg { display: inline-flex; border: 1px solid var(--sh-divider); border-radius: 18px; overflow: hidden; flex-shrink: 0; }
  .seg button { background: none; border: none; cursor: pointer; padding: 5px 11px; font-size: 13px; color: var(--sh-muted); }
  .seg button + button { border-left: 1px solid var(--sh-divider); }
  .seg button.active { background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-text-color); font-weight: 500; }
  .search {
    display: flex; align-items: center; gap: 6px; border: 1px solid var(--sh-divider); border-radius: 18px;
    padding: 0 12px; background: var(--sh-card); --mdc-icon-size: 18px; color: var(--sh-muted); margin-bottom: 10px;
  }
  .search input { border: none; background: transparent; outline: none; padding: 8px 0; font-size: 14px; color: var(--primary-text-color); width: 100%; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.cookidoo { background: var(--sh-cookidoo); }
  .dot.own { background: var(--sh-own); }
  /* tile layout */
  .tile-hint { margin: -2px 2px 10px; font-size: 12px; color: var(--sh-muted); --mdc-icon-size: 14px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .tile-group { margin-bottom: 14px; }
  .tile-head {
    display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; cursor: pointer;
    padding: 4px 2px 8px; font-size: 13px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase;
    color: var(--sh-muted); --mdc-icon-size: 16px; text-align: left;
  }
  .tile-head .cat-count { margin-left: auto; text-transform: none; font-weight: 500; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  .tile {
    position: relative; aspect-ratio: 1 / 1; max-width: 100%; border-radius: 14px; cursor: pointer; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none;
    background: color-mix(in srgb, var(--cat) 20%, var(--sh-card));
    border: 1px solid color-mix(in srgb, var(--cat) 35%, transparent);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 8px 6px 6px;
    text-align: center; transition: transform .12s, opacity .2s, background .2s; outline-offset: 2px;
  }
  .tile:active { transform: scale(.96); }
  .tile:focus-visible { outline: 2px solid var(--primary-color); }
  .tile-emoji { font-size: 34px; line-height: 1.1; font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; }
  .tile-name {
    font-size: 13px; font-weight: 500; line-height: 1.2; max-width: 100%;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
  }
  .tile-qty { font-size: 11px; color: var(--sh-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; min-height: 13px; font-variant-numeric: tabular-nums; }
  .tile-merged {
    position: absolute; left: 6px; top: 6px; min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px;
    background: var(--sh-card); color: var(--sh-muted); font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center;
  }
  .tile-have, .tile-more {
    position: absolute; top: 2px; width: 28px; height: 28px; border-radius: 50%; border: none; background: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: var(--sh-muted); --mdc-icon-size: 16px;
  }
  .tile-have { right: 2px; }
  .tile-have.on { color: var(--primary-color); }
  .tile-more { right: 2px; top: auto; bottom: 2px; opacity: 0; }
  .tile:hover .tile-more, .tile:focus-within .tile-more { opacity: 1; }
  @media (hover: none) { .tile-more { display: none; } }
  .tile.partial { background: linear-gradient(135deg, color-mix(in srgb, var(--cat) 34%, var(--sh-card)) 50%, color-mix(in srgb, var(--cat) 14%, var(--sh-card)) 50%); }
  .tile.pending { opacity: .45; }
  .muted-group .tile { background: var(--sh-card); border-color: var(--sh-divider); }
  .muted-group .tile-emoji { filter: grayscale(.85); opacity: .7; }
  .muted-group .tile-name { color: var(--sh-muted); }
  .tile.checked:not(.have) .tile-name { text-decoration: line-through; }
  /* details sheet (tile layout) */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 10; }
  .sheet {
    position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); z-index: 11;
    width: min(560px, 100%); max-height: 85vh; overflow-y: auto;
    background: var(--sh-card); border-radius: 18px 18px 0 0; box-shadow: 0 -4px 24px rgba(0,0,0,.25);
    padding: 14px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  }
  .sheet-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .sheet-emoji {
    width: 52px; height: 52px; border-radius: 14px; font-size: 30px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    background: color-mix(in srgb, var(--cat) 20%, var(--sh-card)); font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  }
  .sheet-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sheet-title b { font-size: 18px; font-weight: 500; overflow-wrap: anywhere; }
  .sheet-title span { font-size: 14px; color: var(--sh-muted); }
  .sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .sheet-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--sh-divider); background: none; font-size: 14px; --mdc-icon-size: 18px;
  }
  .sheet-btn.primary-btn { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .sheet-btn.on { color: var(--primary-color); border-color: var(--primary-color); }
  /* categories */
  .category { margin-bottom: 10px; overflow: hidden; }
  .cat-header {
    width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer;
    background: none; border: none; text-align: left; user-select: none;
  }
  .cat-icon {
    width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--cat) 16%, transparent); color: var(--cat); --mdc-icon-size: 16px; flex-shrink: 0;
  }
  .cat-icon.plain { background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--sh-muted); }
  .cat-name { flex: 1; font-weight: 500; font-size: 15px; }
  .cat-count { font-size: 13px; color: var(--sh-muted); font-variant-numeric: tabular-nums; }
  .chevron { color: var(--sh-muted); transition: transform .2s; transform: rotate(-90deg); --mdc-icon-size: 20px; }
  .chevron.open { transform: rotate(0); }
  .done-group { background: transparent; box-shadow: none; }
  ul { list-style: none; margin: 0; padding: 0; }
  .item { border-top: 1px solid var(--sh-divider); transition: opacity .2s; }
  .item.pending { opacity: .5; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 4px 6px 14px; min-height: 46px; cursor: pointer; }
  .row:hover { background: rgba(127,127,127,.05); }
  .check {
    width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--cat);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; --mdc-icon-size: 14px;
    color: transparent; transition: background .15s;
  }
  .item.partial .check { background: linear-gradient(90deg, color-mix(in srgb, var(--cat) 40%, transparent) 50%, transparent 50%); }
  .item.checked .check { background: var(--cat); color: #fff; }
  .item.have .check { background: transparent; border-color: var(--sh-muted); color: var(--sh-muted); }
  .item-name { flex: 1; min-width: 0; font-size: 16px; overflow-wrap: anywhere; }
  .item.checked .item-name { text-decoration: line-through; color: var(--sh-muted); }
  .item.have .item-name { text-decoration: none; }
  .dots { display: inline-flex; gap: 3px; flex-shrink: 0; }
  .qty { font-size: 14px; color: var(--sh-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .have-btn {
    width: 34px; height: 34px; border-radius: 50%; border: none; background: none; cursor: pointer; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center; color: var(--sh-muted); --mdc-icon-size: 19px;
  }
  .have-btn:hover { background: rgba(127,127,127,.12); color: var(--primary-text-color); }
  .have-btn.on { color: var(--primary-color); }
  .more ha-icon { transition: transform .2s; }
  .item.expanded .more ha-icon { transform: rotate(180deg); }
  .details { padding: 2px 12px 12px 46px; cursor: default; }
  .breakdown { background: var(--secondary-background-color, rgba(127,127,127,.08)); border-radius: 10px; padding: 10px 12px; font-size: 13px; }
  .b-title { font-size: 12px; font-weight: 500; color: var(--sh-muted); margin-bottom: 6px; letter-spacing: .02em; }
  .breakdown li { display: grid; grid-template-columns: 8px minmax(70px, auto) 1fr auto; gap: 8px; align-items: baseline; padding: 3px 0; }
  .breakdown .dot { align-self: center; }
  .b-list { color: var(--sh-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
  .b-orig { min-width: 0; overflow-wrap: anywhere; }
  .b-state { font-size: 11px; color: var(--sh-muted); border: 1px solid var(--sh-divider); border-radius: 6px; padding: 0 5px; margin-left: 4px; }
  .b-qty { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .b-total { display: flex; justify-content: space-between; border-top: 1px solid var(--sh-divider); margin-top: 6px; padding-top: 6px; }
  .b-total b { font-size: 14px; font-variant-numeric: tabular-nums; }
  .b-note { margin: 6px 0 0; color: var(--sh-muted); font-size: 12px; }
  .detail-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: var(--sh-muted); }
  .detail-actions label { display: flex; gap: 6px; align-items: center; }
  .text-btn {
    background: none; border: none; cursor: pointer; color: var(--primary-color);
    display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 8px; --mdc-icon-size: 18px;
  }
  .text-btn:hover { background: rgba(127,127,127,.1); }
  .text-btn.danger { color: var(--error-color, #db4437); }
  .footer-actions { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin: 4px 0 16px; font-size: 14px; }
  .empty { padding: 36px 16px; text-align: center; color: var(--sh-muted); --mdc-icon-size: 44px; margin-bottom: 10px; }
  .empty.error { color: var(--error-color, #db4437); }
  .loading { text-align: center; padding: 48px; color: var(--sh-muted); }
  /* stats */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  .kpi { display: flex; align-items: center; gap: 12px; padding: 14px; color: var(--primary-color); --mdc-icon-size: 28px; }
  .kpi-value { font-size: 24px; font-weight: 600; color: var(--primary-text-color); line-height: 1.1; }
  .kpi-label { font-size: 13px; color: var(--sh-muted); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .chart-card { padding: 16px; }
  .chart-card.wide { grid-column: 1 / -1; }
  h3 { margin: 0 0 12px; font-size: 15px; font-weight: 500; }
  h3.mt { margin-top: 20px; }
  .muted { color: var(--sh-muted); }
  .small { font-size: 12px; }
  .center { text-align: center; }
  .donut-wrap { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: center; }
  .donut { width: 170px; height: 170px; flex-shrink: 0; }
  .donut circle { transition: stroke-dasharray .4s; }
  .donut-value { font-size: 30px; font-weight: 600; fill: var(--primary-text-color); }
  .donut-label { font-size: 12px; fill: var(--sh-muted); }
  .legend { flex: 1; min-width: 160px; font-size: 13px; }
  .legend li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .legend-name { flex: 1; }
  .swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .bars { display: flex; flex-direction: column; gap: 10px; }
  .bar-row { display: grid; grid-template-columns: minmax(80px, 38%) 1fr auto; gap: 8px; align-items: center; font-size: 13px; }
  .bar-label { display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .bar-track { display: flex; height: 12px; border-radius: 6px; background: var(--secondary-background-color, rgba(127,127,127,.1)); overflow: hidden; }
  .bar.open.cookidoo { background: var(--sh-cookidoo); }
  .bar.open.own { background: var(--sh-own); }
  .bar.done { background: var(--sh-muted); opacity: .35; }
  .bar-value { font-weight: 600; min-width: 36px; text-align: right; }
  .bar-legend { display: flex; gap: 14px; font-size: 12px; color: var(--sh-muted); margin-top: 8px; }
  .bar-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .bar-key { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .bar-key.open { background: linear-gradient(90deg, var(--sh-cookidoo) 50%, var(--sh-own) 50%); }
  .bar-key.done { background: var(--sh-muted); opacity: .35; }
  .bar-key.added { background: var(--primary-color); }
  .bar-key.done-strong { background: var(--success-color, #43a047); }
  .ring-wrap { display: flex; align-items: center; gap: 14px; }
  .ring { width: 84px; height: 84px; }
  .ring-bg { stroke: var(--sh-divider); }
  .ring-fg { stroke: var(--success-color, #43a047); transition: stroke-dasharray .4s; }
  .ring-text { font-size: 17px; font-weight: 600; fill: var(--primary-text-color); }
  .daily { width: 100%; height: auto; display: block; }
  .grid-line { stroke: var(--sh-divider); stroke-width: 1; }
  .axis { font-size: 10px; fill: var(--sh-muted); }
  .bar-added { fill: var(--primary-color); }
  .bar-done { fill: var(--success-color, #43a047); }
  .top { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .top li { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .rank { width: 20px; color: var(--sh-muted); font-size: 12px; text-align: right; }
  .top-name { width: 38%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .top-track { flex: 1; height: 8px; border-radius: 4px; background: var(--secondary-background-color, rgba(127,127,127,.1)); overflow: hidden; }
  .top-track span { display: block; height: 100%; background: var(--primary-color); border-radius: 4px; opacity: .8; }
  /* suggestions */
  .suggest { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; }
  .suggest-icon { color: var(--sh-muted); --mdc-icon-size: 18px; flex-shrink: 0; margin-left: 4px; }
  .suggest-row { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 1px; }
  .suggest-row::-webkit-scrollbar { display: none; }
  .suggestion {
    display: inline-flex; align-items: center; flex-shrink: 0; border-radius: 16px;
    border: 1px dashed var(--sh-divider); background: transparent;
  }
  .suggestion.due { border-style: solid; border-color: color-mix(in srgb, var(--cat) 50%, transparent); }
  .sugg-add {
    display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer;
    padding: 5px 2px 5px 9px; font-size: 13px; white-space: nowrap; --mdc-icon-size: 15px;
  }
  .sugg-add ha-icon { color: var(--cat); }
  .sugg-x { background: none; border: none; cursor: pointer; color: var(--sh-muted); padding: 5px 8px 5px 4px; --mdc-icon-size: 13px; display: inline-flex; }
  .sugg-add:hover, .sugg-x:hover { color: var(--primary-text-color); }
  /* insights */
  .sub { margin: -8px 0 12px; }
  .bar-bought { fill: color-mix(in srgb, var(--primary-color) 55%, transparent); }
  .bar-current { fill: var(--primary-color); }
  .bar-num { font-size: 10px; fill: var(--sh-muted); font-variant-numeric: tabular-nums; }
  .bar-key.bought { background: color-mix(in srgb, var(--primary-color) 55%, transparent); }
  .bar-key.current { background: var(--primary-color); }
  .weekday { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: end; height: 150px; }
  .wd { display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
  .wd-track { flex: 1; width: 100%; max-width: 30px; display: flex; align-items: flex-end; border-radius: 6px; background: var(--secondary-background-color, rgba(127,127,127,.1)); overflow: hidden; }
  .wd-bar { width: 100%; background: color-mix(in srgb, var(--primary-color) 55%, transparent); border-radius: 6px; min-height: 2px; }
  .wd.top .wd-bar { background: var(--primary-color); }
  .wd-num { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .wd-day { font-size: 12px; color: var(--sh-muted); }
  .split-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--secondary-background-color, rgba(127,127,127,.1)); }
  .split-c { background: var(--sh-cookidoo); }
  .split-o { background: var(--sh-own); }
  .split-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 13px; }
  .split-legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .facts div { display: flex; flex-direction: column; }
  .facts b { font-size: 22px; font-variant-numeric: tabular-nums; }
  .facts span { font-size: 12px; color: var(--sh-muted); }
  .ptable { display: flex; flex-direction: column; }
  .prow {
    display: grid; grid-template-columns: 10px minmax(90px, 1.2fr) 2fr 44px 96px 92px; gap: 10px; align-items: center;
    padding: 7px 0; border-top: 1px solid var(--sh-divider); font-size: 14px;
  }
  .prow:first-child { border-top: none; }
  .prow .swatch { background: var(--cat); }
  .pname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ptrack { height: 8px; border-radius: 4px; background: var(--secondary-background-color, rgba(127,127,127,.1)); overflow: hidden; }
  .ptrack span { display: block; height: 100%; background: var(--cat); opacity: .85; border-radius: 4px; }
  .pcount { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
  .pmeta { font-size: 12px; color: var(--sh-muted); white-space: nowrap; }
  @media (max-width: 700px) {
    .prow { grid-template-columns: 10px 1fr 40px; row-gap: 2px; }
    .prow .ptrack { grid-column: 2 / 4; grid-row: 2; }
    .prow .pmeta { grid-column: 2 / 4; }
    .prow .pmeta + .pmeta { display: none; }
  }
  @media (max-width: 700px) {
    .content { padding: 10px; }
    .tab { padding: 10px 10px 12px; font-size: 14px; gap: 4px; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .grid, .top { grid-template-columns: 1fr; }
    .add select { max-width: 46%; }
    .seg button { padding: 5px 9px; }
    .progress { display: none; }
    .details { padding-left: 14px; }
    .breakdown li { grid-template-columns: 8px 1fr auto; }
    .b-list { grid-column: 2 / 4; max-width: none; font-size: 12px; }
    .breakdown .dot { grid-row: 1 / 3; }
  }
`;

if (!customElements.get("shopping-helper-panel")) {
  customElements.define("shopping-helper-panel", ShoppingHelperPanel);
}
