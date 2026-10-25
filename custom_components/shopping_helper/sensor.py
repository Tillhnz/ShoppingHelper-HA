"""Sensors: open items (with category breakdown) and progress."""
from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import ShoppingHelperConfigEntry
from .const import DOMAIN, VERSION
from .coordinator import ShoppingHelperCoordinator

MAX_ATTRIBUTE_ITEMS = 60


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ShoppingHelperConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        [OpenItemsSensor(coordinator), ProgressSensor(coordinator), SuggestionsSensor(coordinator)]
    )


class _Base(CoordinatorEntity[ShoppingHelperCoordinator], SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: ShoppingHelperCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.config_entry.entry_id)},
            name="Shopping Helper",
            manufacturer="Shopping Helper",
            sw_version=VERSION,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def _stats(self) -> dict[str, Any]:
        return (self.coordinator.data or {}).get("stats", {})


class OpenItemsSensor(_Base):
    _attr_icon = "mdi:cart-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: ShoppingHelperCoordinator) -> None:
        super().__init__(coordinator, "open_items")

    @property
    def native_value(self) -> int:
        return self._stats.get("open", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data or {}
        by_category: dict[str, int] = {}
        items: list[str] = []
        for category in data.get("categories", []):
            if category["open"]:
                by_category[category["name"]] = category["open"]
            for item in category["items"]:
                if not item["checked"] and len(items) < MAX_ATTRIBUTE_ITEMS:
                    items.append(f"{item['name']} ({item['quantity']})" if item["quantity"] else item["name"])
        return {
            "total": self._stats.get("total", 0),
            "done": self._stats.get("done", 0),
            "merged": self._stats.get("merged", 0),
            "by_category": by_category,
            "items": items,
        }


class ProgressSensor(_Base):
    _attr_icon = "mdi:progress-check"
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: ShoppingHelperCoordinator) -> None:
        super().__init__(coordinator, "progress")

    @property
    def native_value(self) -> int:
        return self._stats.get("progress", 0)


class SuggestionsSensor(_Base):
    """Frequently bought items that are due again but not on the list."""

    _attr_icon = "mdi:lightbulb-on-outline"

    def __init__(self, coordinator: ShoppingHelperCoordinator) -> None:
        super().__init__(coordinator, "suggestions")

    @property
    def native_value(self) -> int:
        return len((self.coordinator.data or {}).get("suggestions", []))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        suggestions = (self.coordinator.data or {}).get("suggestions", [])
        return {
            "items": [s["name"] for s in suggestions],
            "due": [s["name"] for s in suggestions if s["reason"] == "fällig"],
        }
