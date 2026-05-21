from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

import auth
import db


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=200)

    @field_validator("username")
    @classmethod
    def username_clean(cls, v: str) -> str:
        v = v.strip()
        if not v.isascii() or " " in v:
            raise ValueError("username must be a single ASCII word")
        return v


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="Snippet Vault API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=TokenOut, status_code=201)
def register(creds: Credentials):
    with db.get_conn() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (creds.username,)).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="Username already taken")
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (creds.username, db.hash_password(creds.password), db.now_iso()),
        )
        user_id = cur.lastrowid
    token = auth.create_token(user_id, creds.username)
    return TokenOut(access_token=token, username=creds.username)


@app.post("/api/auth/login", response_model=TokenOut)
def login(creds: Credentials):
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (creds.username,),
        ).fetchone()
    if row is None or not db.verify_password(creds.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = auth.create_token(row["id"], row["username"])
    return TokenOut(access_token=token, username=row["username"])


@app.get("/api/auth/me")
def me(user: dict = Depends(auth.get_current_user)):
    return user


@app.get("/api/snippets", response_model=list[Snippet])
def list_snippets(
    q: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    user: dict = Depends(auth.get_current_user),
):
    sql = "SELECT * FROM snippets WHERE user_id = ?"
    params: list = [user["id"]]
    if q:
        like = f"%{q.strip()}%"
        sql += " AND (title LIKE ? OR code LIKE ? OR tags LIKE ?)"
        params += [like, like, like]
    if tag:
        sql += " AND (',' || tags || ',') LIKE ?"
        params.append(f"%,{tag.strip().lower()},%")
    sql += " ORDER BY pinned DESC, updated_at DESC"
    with db.get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [row_to_snippet(r) for r in rows]


@app.get("/api/tags", response_model=list[str])
def list_tags(user: dict = Depends(auth.get_current_user)):
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT tags FROM snippets WHERE user_id = ? AND tags != ''", (user["id"],)
        ).fetchall()
    seen: set[str] = set()
    for r in rows:
        seen.update(db.tags_to_list(r["tags"]))
    return sorted(seen)


def _owned_row(conn, snippet_id: int, user_id: int):
    row = conn.execute(
        "SELECT * FROM snippets WHERE id = ? AND user_id = ?", (snippet_id, user_id)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="snippet not found")
    return row


@app.get("/api/snippets/{snippet_id}", response_model=Snippet)
def get_snippet(snippet_id: int, user: dict = Depends(auth.get_current_user)):
    with db.get_conn() as conn:
        row = _owned_row(conn, snippet_id, user["id"])
    return row_to_snippet(row)


@app.post("/api/snippets", response_model=Snippet, status_code=201)
def create_snippet(payload: SnippetIn, user: dict = Depends(auth.get_current_user)):
    ts = db.now_iso()
    with db.get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO snippets (user_id, title, language, code, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            (user["id"], payload.title, payload.language, payload.code, db.normalize_tags(payload.tags), ts, ts),
        )
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_snippet(row)


@app.put("/api/snippets/{snippet_id}", response_model=Snippet)
def update_snippet(snippet_id: int, payload: SnippetIn, user: dict = Depends(auth.get_current_user)):
    with db.get_conn() as conn:
        _owned_row(conn, snippet_id, user["id"])
        conn.execute(
            "UPDATE snippets SET title = ?, language = ?, code = ?, tags = ?, updated_at = ? WHERE id = ?",
            (payload.title, payload.language, payload.code, db.normalize_tags(payload.tags), db.now_iso(), snippet_id),
        )
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
    return row_to_snippet(row)


@app.patch("/api/snippets/{snippet_id}/pin", response_model=Snippet)
def toggle_pin(snippet_id: int, user: dict = Depends(auth.get_current_user)):
    with db.get_conn() as conn:
        row = _owned_row(conn, snippet_id, user["id"])
        new_val = 0 if row["pinned"] else 1
        conn.execute(
            "UPDATE snippets SET pinned = ?, updated_at = ? WHERE id = ?",
            (new_val, db.now_iso(), snippet_id),
        )
        row = conn.execute("SELECT * FROM snippets WHERE id = ?", (snippet_id,)).fetchone()
    return row_to_snippet(row)


@app.delete("/api/snippets/{snippet_id}", status_code=204)
def delete_snippet(snippet_id: int, user: dict = Depends(auth.get_current_user)):
    with db.get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM snippets WHERE id = ? AND user_id = ?", (snippet_id, user["id"])
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="snippet not found")
    return None
