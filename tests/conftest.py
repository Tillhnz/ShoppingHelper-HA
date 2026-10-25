"""Make the pure logic package importable without Home Assistant installed."""
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for name, path in (
    ("custom_components", ROOT / "custom_components"),
    ("custom_components.shopping_helper", ROOT / "custom_components" / "shopping_helper"),
):
    if name not in sys.modules:
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module
