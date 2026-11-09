"""Update watcher: notify (persistent notification, a notify service and/or ntfy) when a new release is out.

Checks the latest GitHub release every 6 hours and reports each new version exactly once.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.helpers.storage import Store

from .const import CONF_UPDATE_NOTIFY, CONF_UPDATE_NOTIFY_SERVICE, CONF_UPDATE_NTFY_TOPIC, DOMAIN, VERSION
from .logic.updates import is_newer, message

_LOGGER = logging.getLogger(__name__)
RELEASES = "https://api.github.com/repos/Tillhnz/ShoppingHelper-HA/releases/latest"
NTFY = "https://ntfy.sh"
INTERVAL = timedelta(hours=6)
NOTIFICATION_ID = f"{DOMAIN}_update"


async def async_check(hass: HomeAssistant, entry: ConfigEntry) -> str | None:
    """Returns the newly reported version or None."""
    opts = {**entry.data, **entry.options}
    if not opts.get(CONF_UPDATE_NOTIFY, True):
        return None
    session = async_get_clientsession(hass)
    try:
        async with session.get(RELEASES, headers={"Accept": "application/vnd.github+json"}, timeout=30) as resp:
            if resp.status != 200:
                return None
            rel = await resp.json()
    except Exception as err:  # noqa: BLE001 - offline, rate limit …
        _LOGGER.debug("Update check failed: %s", err)
        return None
    latest = str(rel.get("tag_name") or "")
    if not latest or rel.get("draft") or rel.get("prerelease") or not is_newer(latest, VERSION):
        return None
    store = Store(hass, 1, f"{DOMAIN}.update")
    seen = await store.async_load() or {}
    if seen.get("notified") == latest:
        return None
    title, body, security = message(VERSION, latest, rel.get("body") or "", rel.get("html_url") or RELEASES)

    persistent_notification.async_create(hass, body, title=title, notification_id=NOTIFICATION_ID)
    service = (opts.get(CONF_UPDATE_NOTIFY_SERVICE) or "").strip()
    if service.startswith("notify.") and hass.services.has_service("notify", service[7:]):
        try:
            await hass.services.async_call("notify", service[7:], {"title": title, "message": body}, blocking=True)
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Notify service %s failed: %s", service, err)
    topic = (opts.get(CONF_UPDATE_NTFY_TOPIC) or "").strip()
    if topic:
        payload = {"topic": topic, "title": title, "message": body, "priority": 4 if security else 3,
                   "tags": ["shopping_cart"], "click": rel.get("html_url") or RELEASES}
        try:
            async with session.post(NTFY, json=payload, timeout=15) as resp:
                resp.raise_for_status()
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("ntfy push failed: %s", err)
    await store.async_save({"notified": latest})
    return latest


@callback
def async_setup_update_watch(hass: HomeAssistant, entry: ConfigEntry) -> None:
    async def _run(_now=None) -> None:
        await async_check(hass, entry)

    entry.async_on_unload(async_call_later(hass, 120, _run))
    entry.async_on_unload(async_track_time_interval(hass, _run, INTERVAL))
