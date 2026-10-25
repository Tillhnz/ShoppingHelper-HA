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
    this._hideDone = false;
    this._search = "";
    this._expanded = null;
    this._pending = new Set();
    this._collapsed = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem("shopping-helper-ui") || "{}");
      this._hideDone = !!saved.hideDone;
      this._collapsed = new Set(saved.collapsed || []);
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
      await this._hass.callWS({ ...payload, type: `${DOMAIN}/${payload.type}` });
      if (okMessage) this._toast(okMessage);
    } catch (err) {
      this._pending.clear();
      this._render();
      this._toast(err?.message || "Aktion fehlgeschlagen");
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  _saveUi() {
    try {
      localStorage.setItem(
        "shopping-helper-ui",
        JSON.stringify({ hideDone: this._hideDone, collapsed: [...this._collapsed] })
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
      </div>
      <div class="content">
        <section id="list-tab">
          <form class="add card" id="add-form" autocomplete="off">
            <ha-icon icon="mdi:plus-circle-outline" class="add-icon"></ha-icon>
            <input id="add-input" placeholder="Artikel hinzufügen, z. B. „2 l Milch“" enterkeyhint="done" />
            <select id="add-list" title="Ziel-Liste"></select>
            <button type="submit" class="primary">Hinzufügen</button>
          </form>
          <div class="toolbar">
            <div class="chips">
              <button class="chip active" data-filter="all">Alle</button>
              <button class="chip" data-filter="cookidoo"><span class="dot cookidoo"></span>Cookidoo</button>
              <button class="chip" data-filter="own"><span class="dot own"></span>Eigene</button>
            </div>
            <div class="toolbar-right">
              <div class="search"><ha-icon icon="mdi:magnify"></ha-icon><input id="search" placeholder="Suchen" /></div>
              <button class="chip toggle" id="hide-done"><ha-icon icon="mdi:eye-off-outline"></ha-icon>Erledigte</button>
            </div>
          </div>
          <div id="progress"></div>
          <div id="list"></div>
        </section>
        <section id="stats-tab" hidden></section>
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
    const hide = root.getElementById("hide-done");
    hide.classList.toggle("active", this._hideDone);
    hide.addEventListener("click", () => {
      this._hideDone = !this._hideDone;
      hide.classList.toggle("active", this._hideDone);
      this._saveUi();
      this._render();
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
    list.addEventListener("change", (ev) => {
      const sel = ev.target.closest("select[data-category-for]");
      if (!sel) return;
      const key = sel.dataset.categoryFor;
      this._ws({ type: "set_category", key, category: sel.value || null }, "Kategorie gespeichert");
    });
    root.getElementById("stats-tab").addEventListener("click", (ev) => {
      if (ev.target.closest("#clear-completed")) this._clearCompleted();
    });
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
    if (ev.target.closest("#clear-completed")) {
      this._clearCompleted();
      return;
    }
    const more = ev.target.closest("[data-more]");
    if (more) {
      ev.stopPropagation();
      this._expanded = this._expanded === more.dataset.more ? null : more.dataset.more;
      this._render();
      return;
    }
    const del = ev.target.closest("[data-remove]");
    if (del) {
      const key = del.dataset.remove;
      this._expanded = null;
      this._ws({ type: "remove", key }, "Artikel entfernt");
      return;
    }
    if (ev.target.closest(".details")) return;
    const row = ev.target.closest("[data-key]");
    if (row) {
      const key = row.dataset.key;
      const checked = row.dataset.checked !== "true";
      this._pending.add(key);
      row.classList.toggle("checked", checked);
      row.classList.add("pending");
      this._ws({ type: "check", key, checked });
    }
  }

  _clearCompleted() {
    const done = this._data?.stats?.done || 0;
    if (!done) return;
    if (!confirm(`${done} erledigte Artikel aus allen Listen entfernen?`)) return;
    this._ws({ type: "clear_completed" }, "Erledigte Artikel entfernt");
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
    else this._renderStats();
  }

  _renderListSelect() {
    const select = this.shadowRoot.getElementById("add-list");
    const lists = (this._data.lists || []).filter((l) => l.available);
    const sig = lists.map((l) => l.entity_id + l.name).join("|");
    if (select.dataset.sig === sig) return;
    const current = select.value;
    select.innerHTML = lists
      .map((l) => `<option value="${esc(l.entity_id)}" ${l.default ? "selected" : ""}>${esc(l.name)}</option>`)
      .join("");
    if (current && lists.some((l) => l.entity_id === current)) select.value = current;
    select.dataset.sig = sig;
  }

  _visible(item) {
    if (this._filter === "cookidoo" && !item.cookidoo) return false;
    if (this._filter === "own" && !item.own) return false;
    if (this._hideDone && item.checked && !this._pending.has(item.key)) return false;
    if (this._search && !item.name.toLowerCase().includes(this._search)) return false;
    return true;
  }

  _renderList() {
    const { categories = [], stats = {}, all_categories = [] } = this._data;
    const root = this.shadowRoot;

    root.getElementById("progress").innerHTML = stats.total
      ? `<div class="progress-wrap">
           <div class="progress-text"><b>${stats.open}</b> offen · ${stats.done} erledigt${
             stats.merged ? ` · <span class="merged-hint">${stats.merged} zusammengeführt</span>` : ""
           }</div>
           <div class="progress"><div style="width:${stats.progress}%"></div></div>
         </div>`
      : "";

    const sections = categories
      .map((cat) => {
        const items = cat.items.filter((i) => this._visible(i));
        if (!items.length) return "";
        const collapsed = this._collapsed.has(cat.id) && !this._search;
        const openCount = items.filter((i) => !i.checked).length;
        return `<div class="category card" style="--cat:${esc(cat.color)}">
          <div class="cat-header" data-toggle-cat="${esc(cat.id)}">
            <span class="cat-icon"><ha-icon icon="${esc(cat.icon)}"></ha-icon></span>
            <span class="cat-name">${esc(cat.name)}</span>
            <span class="cat-count">${openCount ? openCount : "✓"}</span>
            <ha-icon class="chevron ${collapsed ? "" : "open"}" icon="mdi:chevron-down"></ha-icon>
          </div>
          ${collapsed ? "" : `<ul>${items.map((i) => this._itemHtml(i, all_categories)).join("")}</ul>`}
        </div>`;
      })
      .join("");

    root.getElementById("list").innerHTML =
      sections ||
      `<div class="card empty">
         <ha-icon icon="mdi:cart-check"></ha-icon>
         <p>${stats.total ? "Keine passenden Artikel." : "Alles erledigt – die Listen sind leer."}</p>
       </div>`;

    if (stats.done && !this._hideDone) {
      root.getElementById("list").insertAdjacentHTML(
        "beforeend",
        `<div class="footer-actions"><button class="text-btn" id="clear-completed"><ha-icon icon="mdi:broom"></ha-icon>${stats.done} erledigte entfernen</button></div>`
      );
    }
  }

  _itemHtml(item, allCategories) {
    const pending = this._pending.has(item.key);
    const sources = item.sources
      .map(
        (s) =>
          `<span class="badge ${s.is_cookidoo ? "cookidoo" : "own"} ${s.done ? "done" : ""}" title="${esc(
            s.summary
          )}${s.description ? " – " + esc(s.description) : ""}">${esc(s.list_name)}</span>`
      )
      .join("");
    const expanded = this._expanded === item.key;
    const options = [`<option value="">Automatisch</option>`]
      .concat(
        allCategories.map(
          (c) =>
            `<option value="${esc(c.id)}" ${item.category_overridden && c.id === item.category ? "selected" : ""}>${esc(c.name)}</option>`
        )
      )
      .join("");
    return `<li class="item ${item.checked ? "checked" : ""} ${item.partial ? "partial" : ""} ${pending ? "pending" : ""}"
              data-key="${esc(item.key)}" data-checked="${item.checked}">
      <span class="check"><ha-icon icon="mdi:check"></ha-icon></span>
      <div class="item-main">
        <div class="item-line">
          <span class="item-name">${esc(item.name)}</span>
          ${item.quantity ? `<span class="qty">${esc(item.quantity)}</span>` : ""}
          ${item.sources.length > 1 ? `<span class="merge" title="Aus ${item.sources.length} Einträgen zusammengeführt"><ha-icon icon="mdi:call-merge"></ha-icon>${item.sources.length}</span>` : ""}
        </div>
        <div class="item-sub">${sources}${item.notes.length ? `<span class="note">${esc(item.notes.join(", "))}</span>` : ""}</div>
        ${
          expanded
            ? `<div class="details">
                <label>Kategorie <select data-category-for="${esc(item.key)}">${options}</select></label>
                <button class="text-btn danger" data-remove="${esc(item.key)}"><ha-icon icon="mdi:delete-outline"></ha-icon>Löschen</button>
              </div>`
            : ""
        }
      </div>
      <button class="icon-btn small" data-more="${esc(item.key)}" title="Mehr"><ha-icon icon="mdi:dots-vertical"></ha-icon></button>
    </li>`;
  }

  /* ------------------------------------------------------------ statistics */
  _renderStats() {
    const { categories = [], stats = {}, history = {} } = this._data;
    const openCats = categories.filter((c) => c.open > 0);
    const el = this.shadowRoot.getElementById("stats-tab");
    el.innerHTML = `
      <div class="kpis">
        ${this._kpi("mdi:cart-outline", stats.open ?? 0, "Offen")}
        ${this._kpi("mdi:check-circle-outline", stats.done ?? 0, "Erledigt")}
        ${this._kpi("mdi:shape-outline", openCats.length, "Kategorien")}
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
        <div class="card chart-card wide">
          <h3>Letzte 14 Tage</h3>
          ${this._dailyChart(history.daily || [])}
        </div>
        <div class="card chart-card wide">
          <h3>Häufig auf der Liste</h3>
          ${this._topList(history.top || [])}
        </div>
      </div>
      ${stats.done ? `<div class="footer-actions"><button class="text-btn" id="clear-completed"><ha-icon icon="mdi:broom"></ha-icon>${stats.done} erledigte entfernen</button></div>` : ""}
      <p class="muted small center">Aktualisiert: ${esc(new Date(this._data.updated).toLocaleTimeString("de-DE"))}</p>`;
  }

  _kpi(icon, value, label) {
    return `<div class="card kpi"><ha-icon icon="${icon}"></ha-icon><div><div class="kpi-value">${esc(value)}</div><div class="kpi-label">${label}</div></div></div>`;
  }

  _donut(cats, total) {
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
      <svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Offene Artikel nach Kategorie">
        ${arcs}
        <text x="90" y="88" text-anchor="middle" class="donut-value">${total}</text>
        <text x="90" y="108" text-anchor="middle" class="donut-label">offen</text>
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
  .add { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px; margin-bottom: 12px; }
  .add-icon { color: var(--primary-color); flex-shrink: 0; }
  .add input {
    flex: 1; min-width: 0; border: none; background: transparent; font-size: 16px;
    color: var(--primary-text-color); padding: 10px 4px; outline: none;
  }
  select {
    font: inherit; font-size: 14px; color: var(--primary-text-color);
    background: var(--secondary-background-color, transparent);
    border: 1px solid var(--sh-divider); border-radius: 8px; padding: 7px 8px; max-width: 170px;
  }
  .primary {
    background: var(--primary-color); color: var(--text-primary-color, #fff); border: none;
    border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 500;
  }
  /* toolbar */
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .toolbar-right { display: flex; gap: 8px; align-items: center; flex: 1; justify-content: flex-end; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    border: 1px solid var(--sh-divider); background: var(--sh-card); border-radius: 18px;
    padding: 6px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 14px;
    --mdc-icon-size: 18px;
  }
  .chip.active { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
  .search {
    display: flex; align-items: center; gap: 4px; border: 1px solid var(--sh-divider); border-radius: 18px;
    padding: 0 10px; background: var(--sh-card); --mdc-icon-size: 18px; color: var(--sh-muted);
    flex: 1; max-width: 220px;
  }
  .search input { border: none; background: transparent; outline: none; padding: 7px 0; font-size: 14px; color: var(--primary-text-color); width: 100%; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.cookidoo { background: var(--sh-cookidoo); }
  .dot.own { background: var(--sh-own); }
  /* progress */
  .progress-wrap { margin: 0 2px 14px; }
  .progress-text { font-size: 14px; color: var(--sh-muted); margin-bottom: 6px; }
  .progress-text b { color: var(--primary-text-color); font-size: 16px; }
  .merged-hint { color: var(--primary-color); }
  .progress { height: 6px; border-radius: 3px; background: var(--sh-divider); overflow: hidden; }
  .progress > div { height: 100%; background: var(--success-color, #43a047); border-radius: 3px; transition: width .4s; }
  /* categories */
  .category { margin-bottom: 12px; overflow: hidden; }
  .cat-header {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; user-select: none;
    border-left: 4px solid var(--cat);
  }
  .cat-icon {
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--cat) 18%, transparent); color: var(--cat); --mdc-icon-size: 18px;
  }
  .cat-name { flex: 1; font-weight: 500; font-size: 15px; }
  .cat-count {
    min-width: 24px; height: 24px; padding: 0 7px; border-radius: 12px; font-size: 13px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--cat) 20%, transparent);
  }
  .chevron { color: var(--sh-muted); transition: transform .2s; transform: rotate(-90deg); }
  .chevron.open { transform: rotate(0); }
  ul { list-style: none; margin: 0; padding: 0; }
  .item {
    display: flex; align-items: flex-start; gap: 12px; padding: 10px 6px 10px 16px;
    border-top: 1px solid var(--sh-divider); cursor: pointer; transition: opacity .2s, background .15s;
  }
  .item:hover { background: rgba(127,127,127,.06); }
  .item.pending { opacity: .55; }
  .check {
    width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; border: 2px solid var(--cat);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; --mdc-icon-size: 15px;
    color: transparent; transition: background .15s;
  }
  .item.partial .check { background: linear-gradient(90deg, color-mix(in srgb, var(--cat) 45%, transparent) 50%, transparent 50%); }
  .item.checked .check { background: var(--cat); color: #fff; }
  .item.checked .item-name { text-decoration: line-through; color: var(--sh-muted); }
  .item.checked .qty { opacity: .5; }
  .item-main { flex: 1; min-width: 0; }
  .item-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .item-name { font-size: 16px; }
  .qty {
    font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
    background: var(--secondary-background-color, rgba(127,127,127,.12)); white-space: nowrap;
  }
  .merge { font-size: 12px; color: var(--primary-color); display: inline-flex; align-items: center; gap: 2px; --mdc-icon-size: 14px; }
  .item-sub { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; align-items: center; }
  .badge { font-size: 11px; padding: 1px 7px; border-radius: 8px; border: 1px solid; white-space: nowrap; }
  .badge.cookidoo { color: var(--sh-cookidoo); border-color: color-mix(in srgb, var(--sh-cookidoo) 45%, transparent); }
  .badge.own { color: var(--sh-own); border-color: color-mix(in srgb, var(--sh-own) 45%, transparent); }
  .badge.done { opacity: .5; text-decoration: line-through; }
  .note { font-size: 12px; color: var(--sh-muted); font-style: italic; }
  .details { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: var(--sh-muted); cursor: default; }
  .details label { display: flex; gap: 6px; align-items: center; }
  .text-btn {
    background: none; border: none; cursor: pointer; color: var(--primary-color);
    display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 8px; --mdc-icon-size: 18px;
  }
  .text-btn:hover { background: rgba(127,127,127,.1); }
  .text-btn.danger { color: var(--error-color, #db4437); }
  .footer-actions { display: flex; justify-content: center; margin: 8px 0 16px; }
  .empty { padding: 40px 16px; text-align: center; color: var(--sh-muted); --mdc-icon-size: 48px; }
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
  @media (max-width: 700px) {
    .content { padding: 10px; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .grid, .top { grid-template-columns: 1fr; }
    .add { flex-wrap: wrap; }
    .add input { flex-basis: calc(100% - 40px); }
    .add select { flex: 1; max-width: none; }
    .toolbar-right { justify-content: stretch; }
    .search { max-width: none; }
  }
`;

if (!customElements.get("shopping-helper-panel")) {
  customElements.define("shopping-helper-panel", ShoppingHelperPanel);
}
