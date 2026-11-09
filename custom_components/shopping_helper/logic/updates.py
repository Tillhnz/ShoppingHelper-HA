"""Version comparison and message text for the update watcher (no Home Assistant imports)."""
from __future__ import annotations

import re

SECURITY = re.compile(r"(sicherheit|security|cve-|lücke|vulnerab)", re.I)


def parse(version: str) -> tuple[int, ...]:
    """'v1.6.0' -> (1, 6, 0); pre-release suffixes are ignored."""
    return tuple(int(x) for x in re.findall(r"\d+", (version or "").split("-")[0])[:4]) or (0,)


def is_newer(latest: str, current: str) -> bool:
    return parse(latest) > parse(current)


def message(current: str, latest: str, notes: str, url: str) -> tuple[str, str, bool]:
    """Title, body and whether the release mentions security fixes."""
    notes = (notes or "").strip()
    security = bool(SECURITY.search(notes))
    title = ("Sicherheitsupdate" if security else "Neue Version") + f" für Shopping Helper: {latest.lstrip('v')}"
    lines = [f"Installiert: {current}. Verfügbar: {latest.lstrip('v')}."]
    if notes:
        short = notes if len(notes) <= 600 else notes[:600].rsplit("\n", 1)[0] + "\n…"
        lines.append(short)
    lines.append(f"Aktualisieren: HACS → Shopping Helper → Herunterladen. Details: {url}")
    return title, "\n\n".join(lines), security
