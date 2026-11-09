"""Update watcher: version comparison and message."""
from custom_components.shopping_helper.logic.updates import is_newer, message, parse


def test_versions():
    assert parse("v1.6.0") == (1, 6, 0)
    assert is_newer("v1.10.0", "1.6.0") and not is_newer("v1.6.0", "1.6.0") and not is_newer("v1.5.9", "1.6.0")
    assert parse("v2.0.0-beta1") == (2, 0, 0)


def test_message_marks_security():
    title, body, sec = message("1.6.0", "v1.6.1", "Sicherheitsupdate: CVE-2026-1234 behoben", "https://x")
    assert sec and title == "Sicherheitsupdate für Shopping Helper: 1.6.1" and "HACS" in body
    title, _, sec = message("1.6.0", "v1.7.0", "Neue Diagramme", "https://x")
    assert not sec and title.startswith("Neue Version")
