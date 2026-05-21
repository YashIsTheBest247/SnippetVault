from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snippets.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    language    TEXT    NOT NULL DEFAULT 'plaintext',
    code        TEXT    NOT NULL DEFAULT '',
    tags        TEXT    NOT NULL DEFAULT '',
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def normalize_tags(raw) -> str:
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
