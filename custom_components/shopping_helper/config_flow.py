"""Config flow for Shopping Helper."""
from __future__ import annotations

from typing import Any

try:  # Home Assistant >= 2026.11 replaced voluptuous with probatio
    import probatio as vol
except ImportError:  # pragma: no cover - older Home Assistant
    import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er, selector

from .const import (
    CONF_CATEGORY_ORDER,
    CONF_COOKIDOO_LISTS,
    CONF_DEFAULT_LIST,
    CONF_OWN_LISTS,
    CONF_REQUIRE_ADMIN,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    COOKIDOO_DOMAIN,
    DEFAULT_SIDEBAR_ICON,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
)
from .logic.categories import DEFAULT_CATEGORIES

TODO_MULTI = selector.EntitySelector(selector.EntitySelectorConfig(domain="todo", multiple=True))
TODO_SINGLE = selector.EntitySelector(selector.EntitySelectorConfig(domain="todo"))


def _todo_entities(hass: HomeAssistant) -> tuple[list[str], list[str]]:
    """Split existing to-do entities into Cookidoo and other lists."""
    registry = er.async_get(hass)
    cookidoo, own = [], []
    for state in hass.states.async_all("todo"):
        entry = registry.async_get(state.entity_id)
        (cookidoo if entry and entry.platform == COOKIDOO_DOMAIN else own).append(state.entity_id)
    return sorted(cookidoo), sorted(own)


def _validate(user_input: dict[str, Any]) -> dict[str, str]:
    errors: dict[str, str] = {}
    lists = set(user_input.get(CONF_COOKIDOO_LISTS, [])) | set(user_input.get(CONF_OWN_LISTS, []))
    if not lists:
        errors["base"] = "no_lists"
    default = user_input.get(CONF_DEFAULT_LIST)
    if default and default not in lists:
        errors[CONF_DEFAULT_LIST] = "default_not_selected"
    return errors


def _lists_schema(defaults: dict[str, Any]) -> dict:
    schema: dict = {
        vol.Optional(CONF_COOKIDOO_LISTS, default=defaults.get(CONF_COOKIDOO_LISTS, [])): TODO_MULTI,
        vol.Optional(CONF_OWN_LISTS, default=defaults.get(CONF_OWN_LISTS, [])): TODO_MULTI,
    }
    if defaults.get(CONF_DEFAULT_LIST):
        schema[vol.Optional(CONF_DEFAULT_LIST, default=defaults[CONF_DEFAULT_LIST])] = TODO_SINGLE
    else:
        schema[vol.Optional(CONF_DEFAULT_LIST)] = TODO_SINGLE
    return schema


class ShoppingHelperConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the initial setup."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                return self.async_create_entry(title="Shopping Helper", data=user_input)

        cookidoo, own = _todo_entities(self.hass)
        defaults = user_input or {
            CONF_COOKIDOO_LISTS: cookidoo,
            CONF_OWN_LISTS: [e for e in own if "shopping" in e or "einkauf" in e] or own[:1],
            CONF_SIDEBAR_TITLE: DEFAULT_SIDEBAR_TITLE,
        }
        if not defaults.get(CONF_DEFAULT_LIST) and defaults.get(CONF_OWN_LISTS):
            defaults[CONF_DEFAULT_LIST] = defaults[CONF_OWN_LISTS][0]

        schema = _lists_schema(defaults)
        schema[vol.Optional(CONF_SIDEBAR_TITLE, default=defaults.get(CONF_SIDEBAR_TITLE, DEFAULT_SIDEBAR_TITLE))] = str
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(schema),
            errors=errors,
            description_placeholders={"cookidoo_found": str(len(cookidoo))},
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return ShoppingHelperOptionsFlow()


class ShoppingHelperOptionsFlow(OptionsFlow):
    """Change lists, sidebar and store route."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        current = {**self.config_entry.data, **self.config_entry.options}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                # explicit None so a cleared default list overrides the initial setup value
                return self.async_create_entry(
                    data={CONF_DEFAULT_LIST: None, **user_input}
                )
            current.update(user_input)

        schema = _lists_schema(current)
        schema.update(
            {
                vol.Optional(
                    CONF_SIDEBAR_TITLE, default=current.get(CONF_SIDEBAR_TITLE, DEFAULT_SIDEBAR_TITLE)
                ): str,
                vol.Optional(
                    CONF_SIDEBAR_ICON, default=current.get(CONF_SIDEBAR_ICON, DEFAULT_SIDEBAR_ICON)
                ): selector.IconSelector(),
                vol.Optional(
                    CONF_REQUIRE_ADMIN, default=current.get(CONF_REQUIRE_ADMIN, False)
                ): bool,
                vol.Optional(
                    CONF_CATEGORY_ORDER,
                    default=current.get(
                        CONF_CATEGORY_ORDER, "\n".join(c.name for c in DEFAULT_CATEGORIES)
                    ),
                ): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=vol.Schema(schema), errors=errors)
