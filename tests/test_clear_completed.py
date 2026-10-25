"""Coordinator clean-up logic, run against minimal Home Assistant stubs (no HA install needed)."""
import asyncio, sys, types
from dataclasses import dataclass
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
def mod(name, **kw):
    if name in sys.modules and not name.startswith("homeassistant"):
        return sys.modules[name]
    m = types.ModuleType(name); m.__dict__.update(kw); sys.modules[name] = m; return m
class HAErr(Exception): pass
class DUC:
    def __class_getitem__(cls, item): return cls
    def __init__(self, hass, logger, config_entry=None, name=None, update_interval=None):
        self.hass, self.config_entry, self.data = hass, config_entry, None
    async def async_refresh(self): self.data = await self._async_update_data()
    def async_set_updated_data(self, d): self.data = d
class Store:
    def __class_getitem__(cls, item): return cls
    def __init__(self, *a): pass
    def async_delay_save(self, fn, delay): fn()
@dataclass
class RegEntry:
    entity_id: str; domain: str; platform: str; config_entry_id: str; unique_id: str; disabled_by: object = None
class Registry:
    def __init__(self, entries): self.entries = {e.entity_id: e for e in entries}
    def async_get(self, eid): return self.entries.get(eid)
REG = Registry([])
er = types.SimpleNamespace(async_get=lambda hass: REG,
    async_entries_for_config_entry=lambda reg, ceid: [e for e in reg.entries.values() if e.config_entry_id == ceid])
from datetime import datetime
for n in ["homeassistant","homeassistant.components","homeassistant.helpers","homeassistant.util"]: mod(n)
mod("homeassistant.components.todo", TodoListEntityFeature=types.SimpleNamespace(DELETE_TODO_ITEM=2))
mod("homeassistant.config_entries", ConfigEntry=object)
mod("homeassistant.const", ATTR_SUPPORTED_FEATURES="supported_features", STATE_UNAVAILABLE="unavailable", STATE_UNKNOWN="unknown")
mod("homeassistant.core", HomeAssistant=object)
mod("homeassistant.exceptions", HomeAssistantError=HAErr)
sys.modules["homeassistant.helpers"].entity_registry = er
mod("homeassistant.helpers.entity_registry", **er.__dict__)
mod("homeassistant.helpers.storage", Store=Store)
mod("homeassistant.helpers.update_coordinator", DataUpdateCoordinator=DUC)
dtu = types.SimpleNamespace(now=lambda: datetime(2026,10,25,10), utcnow=lambda: datetime(2026,10,25,9))
mod("homeassistant.util.dt", **dtu.__dict__); sys.modules["homeassistant.util"].dt = dtu
from custom_components.shopping_helper.coordinator import ShoppingHelperCoordinator

class State:
    def __init__(self, state, name, features=0): self.state, self.name, self.attributes = state, name, {"supported_features": features}
class Hass:
    def __init__(self, lists, states):
        self.lists, self.st, self.calls = lists, states, []
        self.states = types.SimpleNamespace(get=lambda eid: self.st.get(eid))
        self.services = types.SimpleNamespace(async_call=self.call)
    def sync_states(self):
        for eid, items in self.lists.items():
            self.st[eid].state = str(sum(1 for i in items if i["status"] == "needs_action"))
    async def call(self, domain, service, data=None, blocking=False, target=None, return_response=False):
        eid = target["entity_id"]; self.calls.append((domain, service, eid, data))
        if service == "get_items": return {eid: {"items": [dict(i) for i in self.lists[eid]]}}
        if service == "remove_item":
            if not self.st[eid].attributes["supported_features"] & 2: raise HAErr("not supported")
            self.lists[eid] = [i for i in self.lists[eid] if i["uid"] not in data["item"]]
        if service == "press":
            for e in ("todo.ck_list", "todo.ck_extra"): self.lists[e] = []
        self.sync_states()

def setup(ck_list, ck_extra, own, button_disabled=None):
    global REG
    REG.entries.clear()
    for e in [RegEntry("todo.ck_list","todo","cookidoo","ck","acc_ingredients"), RegEntry("todo.ck_extra","todo","cookidoo","ck","acc_additional_items"),
              RegEntry("button.ck_clear","button","cookidoo","ck","acc_todo_clear", button_disabled)]: REG.entries[e.entity_id] = e
    hass = Hass({"todo.ck_list": ck_list, "todo.ck_extra": ck_extra, "todo.own": own},
                {"todo.ck_list": State("0","Cookidoo",4), "todo.ck_extra": State("0","Zusätzlich",7), "todo.own": State("0","Einkauf",7), "button.ck_clear": State("unknown","Leeren")})
    hass.sync_states()
    entry = types.SimpleNamespace(data={"cookidoo_lists": ["todo.ck_list","todo.ck_extra"], "own_lists": ["todo.own"]}, options={})
    return hass, ShoppingHelperCoordinator(hass, entry)
it = lambda uid, s, st="completed": {"uid": uid, "summary": s, "status": st}

async def main():
    # 1) all Cookidoo done -> button pressed, own done deleted
    hass, c = setup([it("a","Mehl"), it("b","Zwiebeln")], [], [it("x","Milch"), it("y","Brot","needs_action")])
    r = await c.async_clear_completed(); print("all done:", r, [x[1:3] for x in hass.calls if x[1] in ("press","remove_item")])
    assert r["cookidoo_cleared"] and r["removed"] == 3 and hass.lists["todo.own"] == [it("y","Brot","needs_action")]
    # 2) Cookidoo partially open -> hide, hint open_items, no press
    hass, c = setup([it("a","Mehl"), it("b","Zwiebeln","needs_action")], [], [])
    r = await c.async_clear_completed(); print("partial:", r)
    assert not r["cookidoo_cleared"] and r["hidden"] == 1 and r["cookidoo_hint"] == "open_items"
    assert c.data["stats"]["hidden"] == 1 and not any(x[1] == "press" for x in hass.calls)
    # 2b) later everything checked -> previously hidden also counted, button pressed
    hass.lists["todo.ck_list"][1]["status"] = "completed"; hass.sync_states()
    r = await c.async_clear_completed(); print("later:", r); assert r["cookidoo_cleared"] and r["removed"] == 2 and not c.hidden
    # 3) open item in extra list -> must not press
    hass, c = setup([it("a","Mehl")], [it("e","Alufolie","needs_action")], [])
    r = await c.async_clear_completed(); print("extra open:", r); assert not r["cookidoo_cleared"]
    # 4) button disabled
    hass, c = setup([it("a","Mehl")], [], [], button_disabled="integration")
    r = await c.async_clear_completed(); print("disabled:", r); assert r["cookidoo_hint"] == "button_disabled"
    # 5) option off
    hass, c = setup([it("a","Mehl")], [], []); c.config_entry.options = {"clear_cookidoo": False}
    r = await c.async_clear_completed(); print("option off:", r); assert not r["cookidoo_cleared"] and r["cookidoo_hint"] == "disabled_option"


def test_clear_completed():
    asyncio.run(main())
