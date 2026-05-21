"""FastAPI backend for the Snippets mini-app.

CRUD over code snippets with three "beyond CRUD" features:
  * full-text search across title + code + tags (?q=)
  * tag filtering (?tag=)
  * pinning, so important snippets float to the top

Run:  uvicorn main:app --reload --port 8000   (from the backend/ folder)
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

import db


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class SnippetIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    language: str = Field(default="plaintext", max_length=40)
    code: str = ""
    tags: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title cannot be blank")
        return v.strip()


class Snippet(BaseModel):
    id: int
    title: str
    language: str
    code: str
    tags: list[str]
    pinned: bool
    created_at: str
    updated_at: str


def row_to_snippet(row) -> Snippet:
    return Snippet(
        id=row["id"],
        title=row["title"],
        language=row["language"],
        code=row["code"],
        tags=db.tags_to_list(row["tags"]),
        pinned=bool(row["pinned"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="Snippets API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/snippets", response_model=list[Snippet])
def list_snippets(
    q: str | None = Query(default=None, description="full-text search"),
    tag: str | None = Query(default=None, description="filter by exact tag"),
):
    sql = "SELECT * FROM snippets"
    clauses: list[str] = []
    params: list = []

    if q:
        # Parameterized LIKE — user input never concatenated into SQL, so a
        # query containing %, _, quotes or ';' is matched literally/safely.
        like = f"%{q.strip()}%"
        clauses.append("(title LIKE ? OR code LIKE ? OR tags LIKE ?)")
        params += [like, like, like]

    if tag:
        # Exact tag match against the comma-joined column. Wrapping both sides
        # in commas makes "py" not match a tag like "python".
        clauses.append("(',' || tags || ',') LIKE ?")
        params.append(f"%,{tag.strip().lower()},%")

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY pinned DESC, updated_at DESC"

    with db.get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [row_to_snippet(r) for r in rows]


@app.get("/api/tags", response_model=list[str])
def list_tags():
    """Distinct tags across all snippets, for the filter UI."""
    with db.get_conn() as conn:
        rows = conn.execute("SELECT tags FROM snippets WHERE tags != ''").fetchall()
    seen: set[str] = set()
    for r in rows:
        seen.update(db.tags_to_list(r["tags"]))
    return sorted(seen)


@app.get("/api/snippets/{snippet_id}", response_model=Snippet)
def get_snippet(snippet_id: int):
    with db.get_conn() as conn:
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="snippet not found")
    return row_to_snippet(row)


@app.post("/api/snippets", response_model=Snippet, status_code=201)
def create_snippet(payload: SnippetIn):
    ts = db.now_iso()
    with db.get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO snippets (title, language, code, tags, pinned, created_at, updated_at)
               VALUES (?, ?, ?, ?, 0, ?, ?)""",
            (
                payload.title,
                payload.language,
                payload.code,
                db.normalize_tags(payload.tags),
                ts,
                ts,
            ),
        )
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (new_id,)).fetchone()
    return row_to_snippet(row)


@app.put("/api/snippets/{snippet_id}", response_model=Snippet)
def update_snippet(snippet_id: int, payload: SnippetIn):
    with db.get_conn() as conn:
        existing = conn.execute("SELECT id FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="snippet not found")
        conn.execute(
            """UPDATE snippets
               SET title = ?, language = ?, code = ?, tags = ?, updated_at = ?
               WHERE id = ?""",
            (
                payload.title,
                payload.language,
                payload.code,
                db.normalize_tags(payload.tags),
                db.now_iso(),
                snippet_id,
            ),
        )
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
    return row_to_snippet(row)


@app.patch("/api/snippets/{snippet_id}/pin", response_model=Snippet)
def toggle_pin(snippet_id: int):
    with db.get_conn() as conn:
        row = conn.execute("SELECT pinned FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="snippet not found")
        new_val = 0 if row["pinned"] else 1
        conn.execute(
            "UPDATE snippets SET pinned = ?, updated_at = ? WHERE id = ?",
            (new_val, db.now_iso(), snippet_id),
        )
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
    return row_to_snippet(row)


@app.delete("/api/snippets/{snippet_id}", status_code=204)
def delete_snippet(snippet_id: int):
    with db.get_conn() as conn:
        cur = conn.execute("DELETE FROM snippets WHERE id = ?", (snippet_id,))
        if cur.rowcount == 0:
            # Tell the caller the row never existed instead of silently 204-ing.
            raise HTTPException(status_code=404, detail="snippet not found")
    return None
