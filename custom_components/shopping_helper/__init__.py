"""Shopping Helper – merges Cookidoo shopping lists with your own to-do lists."""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

try:  # Home Assistant >= 2026.11 replaced voluptuous with probatio
    import probatio as vol
except ImportError:  # pragma: no cover - older Home Assistant
    import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import Event, HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_REQUIRE_ADMIN,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    DATA_COORDINATOR,
    DATA_STATIC_REGISTERED,
    DEFAULT_SIDEBAR_ICON,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
    PANEL_COMPONENT,
    PANEL_URL_PATH,
    SIGNAL_UPDATE,
    STATIC_URL,
    VERSION,
)
from .coordinator import ShoppingHelperCoordinator
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.SENSOR]
FRONTEND_DIR = Path(__file__).parent / "frontend"
PANEL_FILE = "shopping-helper-panel.js"

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type ShoppingHelperConfigEntry = ConfigEntry[ShoppingHelperCoordinator]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register services and websocket commands once."""
    hass.data.setdefault(DOMAIN, {})
    async_register_websocket_commands(hass)
    _register_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ShoppingHelperConfigEntry) -> bool:
    coordinator = ShoppingHelperCoordinator(hass, entry)
    await coordinator.async_load()
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator
    hass.data[DOMAIN][DATA_COORDINATOR] = coordinator
    entry.async_on_unload(
        coordinator.async_add_listener(lambda: async_dispatcher_send(hass, SIGNAL_UPDATE))
    )
    async_dispatcher_send(hass, SIGNAL_UPDATE)  # open panels pick up the (re)loaded entry

    @callback
    def _lists_changed(event: Event) -> None:
        hass.async_create_task(coordinator.async_request_refresh())

    entry.async_on_unload(
        async_track_state_change_event(hass, coordinator.list_entities, _lists_changed)
    )
    entry.async_on_unload(entry.add_update_listener(_async_reload))

    await _async_register_panel(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ShoppingHelperConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        hass.data[DOMAIN].pop(DATA_COORDINATOR, None)
    return unloaded


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


# ---------------------------------------------------------------------------- panel
def _file_hash(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


async def _async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    settings = {**entry.data, **entry.options}
    if not hass.data[DOMAIN].get(DATA_STATIC_REGISTERED):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), False)]
        )
        hass.data[DOMAIN][DATA_STATIC_REGISTERED] = True

    # cache busting: new file content -> new URL
    file_hash = await hass.async_add_executor_job(_file_hash, FRONTEND_DIR / PANEL_FILE)
    if PANEL_URL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT,
        module_url=f"{STATIC_URL}/{PANEL_FILE}?v={VERSION}-{file_hash}",
        sidebar_title=settings.get(CONF_SIDEBAR_TITLE) or DEFAULT_SIDEBAR_TITLE,
        sidebar_icon=settings.get(CONF_SIDEBAR_ICON) or DEFAULT_SIDEBAR_ICON,
        require_admin=bool(settings.get(CONF_REQUIRE_ADMIN, False)),
        config={"version": VERSION},
    )


# ---------------------------------------------------------------------------- services
def _coordinator(hass: HomeAssistant) -> ShoppingHelperCoordinator:
    coordinator = hass.data.get(DOMAIN, {}).get(DATA_COORDINATOR)
    if coordinator is None:
        raise ServiceValidationError("Shopping Helper ist nicht eingerichtet")
    return coordinator


def _register_services(hass: HomeAssistant) -> None:
    async def add_item(call: ServiceCall) -> None:
        await _coordinator(hass).async_add_item(
            call.data["name"], call.data.get("list"), call.data.get("description")
        )

    async def refresh(call: ServiceCall) -> None:
        await _coordinator(hass).async_refresh()

    async def clear_completed(call: ServiceCall) -> None:
        await _coordinator(hass).async_clear_completed()

    async def set_category(call: ServiceCall) -> None:
        from .logic.parser import normalize_key, parse_entry

        key = normalize_key(parse_entry(call.data["item"]).name)
        await _coordinator(hass).async_set_category(key, call.data.get("category"))

    hass.services.async_register(
        DOMAIN,
        "add_item",
        add_item,
        schema=vol.Schema(
            {
                vol.Required("name"): cv.string,
                vol.Optional("list"): cv.entity_id,
                vol.Optional("description"): cv.string,
            }
        ),
    )
    hass.services.async_register(DOMAIN, "refresh", refresh)
    hass.services.async_register(DOMAIN, "clear_completed", clear_completed)
    hass.services.async_register(
        DOMAIN,
        "set_category",
        set_category,
        schema=vol.Schema(
            {vol.Required("item"): cv.string, vol.Optional("category"): cv.string}
        ),
    )
