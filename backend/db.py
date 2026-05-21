"""SQLite persistence layer for the snippets app.

We use the Python standard-library ``sqlite3`` module directly (no ORM) so the
app has zero compiled dependencies and runs on a fresh machine after a single
``pip install``.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone

# Anchor the database file to THIS file's directory rather than the current
# working directory. uvicorn can be launched from anywhere, and a relative
# path like "snippets.db" would resolve against the launch directory — so the
# same user could "lose" their data simply by starting the server from a
# different folder. Anchoring to __file__ guarantees one stable DB location.
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snippets.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    language    TEXT    NOT NULL DEFAULT 'plaintext',
    code        TEXT    NOT NULL DEFAULT '',
    tags        TEXT    NOT NULL DEFAULT '',   -- normalized, comma-separated
    pinned      INTEGER NOT NULL DEFAULT 0,    -- 0/1 boolean
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);
"""


def now_iso() -> str:
    """UTC timestamp in ISO-8601 form."""
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enforce foreign keys / sane defaults for future-proofing.
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def normalize_tags(raw) -> str:
    """Turn an incoming list/str of tags into a clean, stored representation.

    - splits on commas if a string is passed
    - trims whitespace, lowercases
    - drops empties (so "a,,b" or trailing commas don't create blank tags)
    - de-duplicates while preserving order
    """
    if raw is None:
        return ""
    if isinstance(raw, str):
        parts = raw.split(",")
    else:
        parts = list(raw)

    seen: set[str] = set()
    cleaned: list[str] = []
    for p in parts:
        t = str(p).strip().lower()
        if t and t not in seen:
            seen.add(t)
            cleaned.append(t)
    return ",".join(cleaned)


def tags_to_list(stored: str) -> list[str]:
    return [t for t in stored.split(",") if t]
