"""Coordinator: reads all selected to-do lists and builds the merged shopping list."""
from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.components.todo import TodoListEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_SUPPORTED_FEATURES, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    CONF_CATEGORY_ORDER,
    CONF_CLEAR_COOKIDOO,
    CONF_COOKIDOO_LISTS,
    CONF_DEFAULT_LIST,
    CONF_OWN_LISTS,
    COOKIDOO_DOMAIN,
    DOMAIN,
    STORAGE_KEY,
    STORAGE_VERSION,
)
from .logic.categories import CATEGORY_BY_ID, resolve_order
from .logic.history import HistoryTracker
from .logic.merge import STATUS_DONE, STATUS_OPEN, SourceItem, merge_items

_LOGGER = logging.getLogger(__name__)
TODO = "todo"


class ShoppingHelperCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetch, merge and track shopping list items."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=timedelta(minutes=5),
        )
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.overrides: dict[str, str] = {}
        self.history = HistoryTracker()
        self._sources: list[SourceItem] = []
        # Items that can't be deleted at the source (Cookidoo ingredients) are hidden instead:
        # entity_id -> {uid: status at the time of hiding}. They come back when their status
        # changes (e.g. unchecked in Cookidoo) and are forgotten once they leave the list.
        self.hidden: dict[str, dict[str, str]] = {}

    # ------------------------------------------------------------------ settings
    @property
    def settings(self) -> dict[str, Any]:
        return {**self.config_entry.data, **self.config_entry.options}

    @property
    def list_entities(self) -> list[str]:
        s = self.settings
        lists = list(s.get(CONF_COOKIDOO_LISTS, [])) + list(s.get(CONF_OWN_LISTS, []))
        return list(dict.fromkeys(lists))

    @property
    def default_list(self) -> str | None:
        default = self.settings.get(CONF_DEFAULT_LIST)
        if default:
            return default
        own = self.settings.get(CONF_OWN_LISTS, [])
        return own[0] if own else (self.list_entities[0] if self.list_entities else None)

    def _is_cookidoo(self, entity_id: str) -> bool:
        if entity_id in self.settings.get(CONF_COOKIDOO_LISTS, []):
            return True
        entry = er.async_get(self.hass).async_get(entity_id)
        return bool(entry and entry.platform == COOKIDOO_DOMAIN)

    # ------------------------------------------------------------------ storage
    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.overrides = dict(data.get("overrides", {}))
        self.history = HistoryTracker(data.get("history"))
        self.hidden = {k: dict(v) for k, v in data.get("hidden", {}).items()}

    def _schedule_save(self) -> None:
        self._store.async_delay_save(
            lambda: {
                "overrides": self.overrides,
                "history": self.history.as_dict(),
                "hidden": self.hidden,
            },
            10,
        )

    # ------------------------------------------------------------------ update
    async def _async_update_data(self) -> dict[str, Any]:
        sources: list[SourceItem] = []
        lists_meta: list[dict[str, Any]] = []
        for entity_id in self.list_entities:
            state = self.hass.states.get(entity_id)
            available = state is not None and state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN)
            meta = {
                "entity_id": entity_id,
                "name": state.name if state else entity_id,
                "cookidoo": self._is_cookidoo(entity_id),
                "available": available,
                "default": entity_id == self.default_list,
            }
            lists_meta.append(meta)
            if not available:
                continue
            try:
                response = await self.hass.services.async_call(
                    TODO,
                    "get_items",
                    {"status": [STATUS_OPEN, STATUS_DONE]},
                    target={"entity_id": entity_id},
                    blocking=True,
                    return_response=True,
                )
            except HomeAssistantError as err:
                _LOGGER.warning("Could not read %s: %s", entity_id, err)
                meta["available"] = False
                continue
            for item in (response or {}).get(entity_id, {}).get("items", []):
                sources.append(
                    SourceItem(
                        entity_id=entity_id,
                        list_name=meta["name"],
                        uid=item.get("uid", ""),
                        summary=item.get("summary", ""),
                        description=item.get("description"),
                        status=item.get("status", STATUS_OPEN),
                        is_cookidoo=meta["cookidoo"],
                    )
                )

        self._sources = sources
        if self._prune_hidden():
            self._schedule_save()
        today = dt_util.now().date().isoformat()
        if self.history.update(sources, today, self.overrides):
            self._schedule_save()
        return self._build(lists_meta)

    def _build(self, lists_meta: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        order = resolve_order(self.settings.get(CONF_CATEGORY_ORDER))
        visible = [s for s in self._sources if not self._is_hidden(s)]
        result = merge_items(visible, order, self.overrides)
        result["stats"]["hidden"] = len(self._sources) - len(visible)
        result["lists"] = lists_meta if lists_meta is not None else (self.data or {}).get("lists", [])
        today = dt_util.now().date().isoformat()
        open_keys = {
            item["key"]
            for category in result["categories"]
            for item in category["items"]
            if not item["checked"]
        }
        result["history"] = self.history.export(today)
        result["suggestions"] = self.history.suggestions(today, open_keys)
        result["statistics"] = self.history.statistics(today)
        result["known_names"] = self.history.names()
        result["updated"] = dt_util.utcnow().isoformat()
        return result

    # ------------------------------------------------------------------ hidden items
    def _is_hidden(self, src: SourceItem) -> bool:
        return self.hidden.get(src.entity_id, {}).get(src.uid) == src.status

    def _hide(self, entity_id: str, uid: str, status: str) -> None:
        self.hidden.setdefault(entity_id, {})[uid] = status

    def _prune_hidden(self) -> bool:
        current = {(s.entity_id, s.uid): s.status for s in self._sources}
        changed = False
        for entity_id in list(self.hidden):
            uids = self.hidden[entity_id]
            for uid, status in list(uids.items()):
                if current.get((entity_id, uid)) != status:
                    del uids[uid]
                    changed = True
            if not uids:
                del self.hidden[entity_id]
                changed = True
        return changed

    def _can_delete(self, entity_id: str) -> bool:
        state = self.hass.states.get(entity_id)
        features = int(state.attributes.get(ATTR_SUPPORTED_FEATURES, 0)) if state else 0
        return bool(features & TodoListEntityFeature.DELETE_TODO_ITEM)

    async def _delete_or_hide(self, entity_id: str, items: list[tuple[str, str]]) -> tuple[int, int]:
        """Delete (uid, status) pairs from a list; hide them where deleting is impossible."""
        if not items:
            return 0, 0
        if self._can_delete(entity_id):
            try:
                await self._call("remove_item", entity_id, {"item": [uid for uid, _ in items]})
                return len(items), 0
            except HomeAssistantError as err:
                _LOGGER.debug("Deleting from %s failed, hiding instead: %s", entity_id, err)
        for uid, status in items:
            self._hide(entity_id, uid, status)
        self._schedule_save()
        return 0, len(items)

    # ------------------------------------------------------------------ helpers
    def _find(self, key: str) -> dict[str, Any]:
        for category in (self.data or {}).get("categories", []):
            for item in category["items"]:
                if item["key"] == key:
                    return item
        raise HomeAssistantError(f"Artikel '{key}' nicht gefunden")

    async def _call(self, service: str, entity_id: str, data: dict[str, Any]) -> None:
        await self.hass.services.async_call(
            TODO, service, data, target={"entity_id": entity_id}, blocking=True
        )

    # ------------------------------------------------------------------ actions
    async def async_set_checked(self, key: str, checked: bool) -> None:
        """Check/uncheck a merged item on every list it came from."""
        item = self._find(key)
        status = STATUS_DONE if checked else STATUS_OPEN
        for src in item["sources"]:
            if src["status"] != status:
                await self._call(
                    "update_item", src["entity_id"], {"item": src["uid"], "status": status}
                )
        await self.async_refresh()

    async def async_add_item(
        self, name: str, entity_id: str | None = None, description: str | None = None
    ) -> None:
        target = entity_id or self.default_list
        if not target:
            raise HomeAssistantError("Keine Ziel-Liste konfiguriert")
        data: dict[str, Any] = {"item": name.strip()}
        if description:
            data["description"] = description
        await self._call("add_item", target, data)
        await self.async_refresh()

    async def async_remove(self, key: str) -> dict[str, int]:
        item = self._find(key)
        by_entity: dict[str, list[tuple[str, str]]] = {}
        for src in item["sources"]:
            by_entity.setdefault(src["entity_id"], []).append((src["uid"], src["status"]))
        removed = hidden = 0
        for entity_id, items in by_entity.items():
            r, h = await self._delete_or_hide(entity_id, items)
            removed, hidden = removed + r, hidden + h
        await self.async_refresh()
        return {"removed": removed, "hidden": hidden}

    async def async_snooze(self, key: str, days: int = 7) -> None:
        """Hide a suggestion for a while."""
        self.history.snooze(key, dt_util.now().date().isoformat(), days)
        self._schedule_save()
        self.async_set_updated_data(self._build())

    async def async_set_category(self, key: str, category: str | None) -> None:
        if category and category not in CATEGORY_BY_ID:
            raise HomeAssistantError(f"Unbekannte Kategorie '{category}'")
        if category:
            self.overrides[key] = category
        else:
            self.overrides.pop(key, None)
        self._schedule_save()
        self.async_set_updated_data(self._build())

    # ------------------------------------------------------------------ cookidoo clear
    def _cookidoo_clear_target(self, cookidoo_entities: list[str]) -> tuple[str | None, str | None]:
        """Find the Cookidoo "clear shopping list" button and check it is safe to press.

        Returns (button_entity_id, None) when the list may be cleared, otherwise
        (None, reason): "disabled_option", "button_missing", "button_disabled",
        "button_unavailable" or "open_items".
        """
        if not self.settings.get(CONF_CLEAR_COOKIDOO, True):
            return None, "disabled_option"
        registry = er.async_get(self.hass)
        config_entry_ids = {
            entry.config_entry_id
            for eid in cookidoo_entities
            if (entry := registry.async_get(eid)) and entry.config_entry_id
        }
        reason = "button_missing"
        for config_entry_id in config_entry_ids:
            entries = er.async_entries_for_config_entry(registry, config_entry_id)
            button = next(
                (
                    e
                    for e in entries
                    if e.domain == "button"
                    and e.platform == COOKIDOO_DOMAIN
                    and (e.unique_id or "").endswith("_todo_clear")
                ),
                None,
            )
            if button is None:
                continue
            if button.disabled_by is not None:
                reason = "button_disabled"
                continue
            state = self.hass.states.get(button.entity_id)
            if state is None or state.state == STATE_UNAVAILABLE:
                reason = "button_unavailable"
                continue
            # The button empties *both* Cookidoo lists of this account – including lists
            # Shopping Helper doesn't show. Only press it when none of them has open items
            # (a to-do entity's state is its number of open items).
            for todo in (e for e in entries if e.domain == TODO):
                todo_state = self.hass.states.get(todo.entity_id)
                if todo_state is None or todo_state.state != "0":
                    reason = "open_items"
                    break
            else:
                return button.entity_id, None
        return None, reason

    async def async_clear_completed(self) -> dict[str, Any]:
        """Remove checked items everywhere.

        Own lists: checked items are deleted. Cookidoo: when everything is checked, the
        Cookidoo list is emptied via the integration's button; otherwise the checked
        ingredients are hidden (Cookidoo can't delete single ingredients).
        """
        await self.async_refresh()  # act on the current state of all lists
        cookidoo_entities = [e for e in self.list_entities if self._is_cookidoo(e)]
        by_entity: dict[str, list[tuple[str, str]]] = {}
        for src in self._sources:
            if src.done and not self._is_hidden(src):
                by_entity.setdefault(src.entity_id, []).append((src.uid, src.status))

        removed = hidden = 0
        cookidoo_cleared = False
        cookidoo_hint: str | None = None

        # also counts ingredients hidden by an earlier clean-up – they still sit in Cookidoo
        cookidoo_done = sum(
            1 for src in self._sources if src.entity_id in cookidoo_entities and src.done
        )
        if cookidoo_done:
            button, cookidoo_hint = self._cookidoo_clear_target(cookidoo_entities)
            if button:
                try:
                    await self.hass.services.async_call(
                        "button", "press", target={"entity_id": button}, blocking=True
                    )
                except HomeAssistantError as err:
                    _LOGGER.warning("Clearing the Cookidoo shopping list failed: %s", err)
                    cookidoo_hint = "press_failed"
                else:
                    cookidoo_cleared = True
                    removed += cookidoo_done
                    for entity_id in cookidoo_entities:
                        by_entity.pop(entity_id, None)
                        self.hidden.pop(entity_id, None)
                    self._schedule_save()

        for entity_id, items in by_entity.items():
            r, h = await self._delete_or_hide(entity_id, items)
            removed, hidden = removed + r, hidden + h
        await self.async_refresh()
        return {
            "removed": removed,
            "hidden": hidden,
            "cookidoo_cleared": cookidoo_cleared,
            "cookidoo_hint": None if cookidoo_cleared or not hidden else cookidoo_hint,
        }
