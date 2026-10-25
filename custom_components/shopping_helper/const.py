"""Constants for Shopping Helper."""
from __future__ import annotations

DOMAIN = "shopping_helper"
VERSION = "1.0.1"

CONF_COOKIDOO_LISTS = "cookidoo_lists"
CONF_OWN_LISTS = "own_lists"
CONF_DEFAULT_LIST = "default_list"
CONF_SIDEBAR_TITLE = "sidebar_title"
CONF_SIDEBAR_ICON = "sidebar_icon"
CONF_CATEGORY_ORDER = "category_order"
CONF_REQUIRE_ADMIN = "require_admin"

DEFAULT_SIDEBAR_TITLE = "Einkaufen"
DEFAULT_SIDEBAR_ICON = "mdi:cart-variant"

PANEL_URL_PATH = "shopping-helper"
PANEL_COMPONENT = "shopping-helper-panel"
STATIC_URL = "/shopping_helper_static"

COOKIDOO_DOMAIN = "cookidoo"
STORAGE_KEY = f"{DOMAIN}.data"
STORAGE_VERSION = 1

DATA_COORDINATOR = "coordinator"
DATA_STATIC_REGISTERED = "static_registered"
DATA_WS_REGISTERED = "ws_registered"
SIGNAL_UPDATE = f"{DOMAIN}_update"
