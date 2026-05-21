"""SQLite persistence layer for the snippets app.

We use the Python standard-library ``sqlite3`` module directly (no ORM) so the
app has zero compiled dependencies and runs on a fresh machine after a single
``pip install``.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone

# Anchor the database file to THIS file's directory rather than the current
# working directory. uvicorn can be launched from anywhere, and a relative
# path like "snippets.db" would resolve against the launch directory — so the
# same user could "lose" their data simply by starting the server from a
# different folder. Anchoring to __file__ guarantees one stable DB location.
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snippets.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        # Migration: a database created before auth existed has a snippets
        # table without a user_id column. Add it (nullable) so the app still
        # starts; those legacy rows simply belong to no user. This must run
        # BEFORE the index below, which references user_id.
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(snippets)")}
        if "user_id" not in cols:
            conn.execute("ALTER TABLE snippets ADD COLUMN user_id INTEGER")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id)")


# ---------------------------------------------------------------------------
# Password hashing — stdlib PBKDF2-HMAC-SHA256, no external crypto deps.
# Stored format: "pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>"
# ---------------------------------------------------------------------------
_PBKDF2_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iters)
        )
        # Constant-time comparison to avoid timing side-channels.
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


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
