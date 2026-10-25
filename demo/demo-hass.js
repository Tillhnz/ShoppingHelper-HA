/* Mock of the Home Assistant frontend so the panel can be previewed without HA. */
(function () {
  // <ha-icon icon="mdi:..."> shim using @mdi/js from a CDN
  let mdi = null;
  const waiting = new Set();
  import("https://cdn.jsdelivr.net/npm/@mdi/js@7.4.47/+esm")
    .then((m) => { mdi = m; waiting.forEach((el) => el._draw()); waiting.clear(); })
    .catch(() => {});
  const toKey = (icon) => "mdi" + icon.replace("mdi:", "").split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  customElements.define("ha-icon", class extends HTMLElement {
    static get observedAttributes() { return ["icon"]; }
    connectedCallback() { this._draw(); }
    attributeChangedCallback() { this._draw(); }
    _draw() {
      const icon = this.getAttribute("icon");
      if (!icon) return;
      if (!mdi) { waiting.add(this); return; }
      const path = mdi[toKey(icon)] || mdi.mdiHelpCircleOutline;
      this.style.display = "inline-flex";
      this.innerHTML = `<svg viewBox="0 0 24 24" style="width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);fill:currentColor"><path d="${path}"/></svg>`;
    }
  });
  customElements.define("ha-menu-button", class extends HTMLElement {
    connectedCallback() { this.style.display = "inline-block"; this.style.width = "8px"; }
  });

  const data = JSON.parse(JSON.stringify(window.SHOPPING_HELPER_SAMPLE));
  let listener = null;
  const allItems = () => data.categories.flatMap((c) => c.items);
  const recompute = () => {
    data.categories.forEach((c) => {
      c.items.sort((a, b) => (a.checked - b.checked) || a.name.localeCompare(b.name, "de"));
      c.open = c.items.filter((i) => !i.checked).length;
      c.done = c.items.length - c.open;
    });
    data.categories = data.categories.filter((c) => c.items.length).sort((a, b) => a.position - b.position);
    const items = allItems();
    const done = items.filter((i) => i.checked).length;
    Object.assign(data.stats, {
      total: items.length, done, open: items.length - done,
      progress: items.length ? Math.round((done / items.length) * 100) : 0,
      merged: items.filter((i) => i.sources.length > 1).length,
    });
    data.stats.lists.forEach((l) => {
      const srcs = items.flatMap((i) => i.sources).filter((s) => s.entity_id === l.entity_id);
      l.total = srcs.length; l.done = srcs.filter((s) => s.done).length; l.open = l.total - l.done;
    });
    data.updated = new Date().toISOString();
  };
  const emit = () => { recompute(); setTimeout(() => listener && listener(JSON.parse(JSON.stringify(data))), 150); };
  const find = (key) => allItems().find((i) => i.key === key);
  const categoryFor = (id) => {
    let cat = data.categories.find((c) => c.id === id);
    if (!cat) {
      const meta = data.all_categories.find((c) => c.id === id);
      cat = { ...meta, position: data.all_categories.indexOf(meta), items: [], open: 0, done: 0 };
      data.categories.push(cat);
    }
    return cat;
  };

  window.mockHass = {
    language: "de",
    connection: {
      subscribeMessage(cb) { listener = cb; emit(); return Promise.resolve(() => { listener = null; }); },
    },
    async callWS(msg) {
      const type = msg.type.split("/")[1];
      if (type === "check") {
        const item = find(msg.key);
        item.checked = msg.checked; item.partial = false;
        item.sources.forEach((s) => { s.done = msg.checked; s.status = msg.checked ? "completed" : "needs_action"; });
      } else if (type === "remove") {
        data.categories.forEach((c) => (c.items = c.items.filter((i) => i.key !== msg.key)));
      } else if (type === "clear_completed") {
        data.categories.forEach((c) => (c.items = c.items.filter((i) => !i.checked)));
      } else if (type === "set_category") {
        const item = find(msg.key);
        data.categories.forEach((c) => (c.items = c.items.filter((i) => i.key !== msg.key)));
        item.category = msg.category || "other"; item.category_overridden = !!msg.category;
        categoryFor(item.category).items.push(item);
      } else if (type === "add") {
        const list = data.lists.find((l) => l.entity_id === msg.entity_id) || data.lists.find((l) => l.default);
        const m = msg.name.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|x|stück)?\s+(.*)$/i);
        const name = m ? m[3] : msg.name;
        categoryFor("other").items.push({
          key: name.toLowerCase(), name, category: "other", category_overridden: false,
          quantity: m ? `${m[1]} ${m[2] || "Stück"}` : "", quantities: [], notes: [], checked: false, partial: false,
          cookidoo: list.cookidoo, own: !list.cookidoo,
          sources: [{ entity_id: list.entity_id, list_name: list.name, uid: String(Math.random()), summary: msg.name,
            description: null, status: "needs_action", is_cookidoo: list.cookidoo, done: false }],
        });
      }
      emit();
      return null;
    },
  };
})();
