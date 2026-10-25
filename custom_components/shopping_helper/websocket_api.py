"""Websocket commands used by the sidebar panel."""
from __future__ import annotations

from typing import Any

try:  # Home Assistant >= 2026.11 replaced voluptuous with probatio
    import probatio as vol
except ImportError:  # pragma: no cover - older Home Assistant
    import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DATA_COORDINATOR, DATA_WS_REGISTERED, DOMAIN, SIGNAL_UPDATE


def _get(hass: HomeAssistant, connection, msg) -> Any | None:
    coordinator = hass.data.get(DOMAIN, {}).get(DATA_COORDINATOR)
    if coordinator is None:
        connection.send_error(msg["id"], "not_loaded", "Shopping Helper ist nicht eingerichtet")
    return coordinator


async def _run(connection, msg, coro) -> None:
    try:
        result = await coro
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "action_failed", str(err))
        return
    connection.send_result(msg["id"], result if isinstance(result, dict) else None)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/data"})
@callback
def ws_data(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        connection.send_result(msg["id"], coordinator.data)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg) -> None:
    coordinator = _get(hass, connection, msg)
    if coordinator is None:
        return

    @callback
    def _send() -> None:
        # look the coordinator up on every update so subscriptions survive an entry reload
        current = hass.data.get(DOMAIN, {}).get(DATA_COORDINATOR)
        if current is not None and current.data is not None:
            connection.send_message(websocket_api.event_message(msg["id"], current.data))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_UPDATE, _send)
    connection.send_result(msg["id"])
    _send()


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/check", vol.Required("key"): str, vol.Required("checked"): bool}
)
@websocket_api.async_response
async def ws_check(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        await _run(connection, msg, coordinator.async_set_checked(msg["key"], msg["checked"]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/add",
        vol.Required("name"): str,
        vol.Optional("entity_id"): str,
        vol.Optional("description"): str,
    }
)
@websocket_api.async_response
async def ws_add(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        await _run(
            connection,
            msg,
            coordinator.async_add_item(msg["name"], msg.get("entity_id"), msg.get("description")),
        )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/remove", vol.Required("key"): str})
@websocket_api.async_response
async def ws_remove(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        await _run(connection, msg, coordinator.async_remove(msg["key"]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_category",
        vol.Required("key"): str,
        vol.Optional("category"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_set_category(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        await _run(connection, msg, coordinator.async_set_category(msg["key"], msg.get("category")))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/clear_completed"})
@websocket_api.async_response
async def ws_clear_completed(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        await _run(connection, msg, coordinator.async_clear_completed())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/refresh"})
@websocket_api.async_response
async def ws_refresh(hass: HomeAssistant, connection, msg) -> None:
    if coordinator := _get(hass, connection, msg):
        await _run(connection, msg, coordinator.async_refresh())


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    if hass.data[DOMAIN].get(DATA_WS_REGISTERED):
        return
    for command in (
        ws_data,
        ws_subscribe,
        ws_check,
        ws_add,
        ws_remove,
        ws_set_category,
        ws_clear_completed,
        ws_refresh,
    ):
        websocket_api.async_register_command(hass, command)
    hass.data[DOMAIN][DATA_WS_REGISTERED] = True
