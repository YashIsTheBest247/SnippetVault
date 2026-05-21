"""Smoke tests for the snippets API. Run from backend/:  python -m pytest -q
(Requires the dev deps: pip install -r requirements-dev.txt)

These use a temporary database file so they never touch your real snippets.db.
"""
import importlib
import os

from fastapi.testclient import TestClient


def make_client(tmp_path):
    # Point the DB at a throwaway file BEFORE importing the app modules.
    import db as db_module

    db_module.DB_PATH = os.path.join(tmp_path, "test.db")
    import auth
    import main

    importlib.reload(auth)
    importlib.reload(main)
    return TestClient(main.app)


def auth_headers(client, username="alice", password="hunter2"):
    """Register a user and return an Authorization header for them."""
    r = client.post("/api/auth/register", json={"username": username, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_requires_auth(tmp_path):
    with make_client(tmp_path) as c:
        # No token -> 401, never leaks data.
        assert c.get("/api/snippets").status_code == 401


def test_login_flow(tmp_path):
    with make_client(tmp_path) as c:
        auth_headers(c, "bob", "secret123")
        # wrong password
        assert c.post("/api/auth/login", json={"username": "bob", "password": "nope12"}).status_code == 401
        # right password
        r = c.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
        assert r.status_code == 200 and r.json()["access_token"]
        # duplicate registration
        assert c.post("/api/auth/register", json={"username": "bob", "password": "secret123"}).status_code == 409


def test_crud_roundtrip(tmp_path):
    with make_client(tmp_path) as c:
        h = auth_headers(c)
        r = c.post("/api/snippets", json={"title": "Hello", "code": "print(1)", "tags": ["py"]}, headers=h)
        assert r.status_code == 201
        sid = r.json()["id"]
        assert c.get(f"/api/snippets/{sid}", headers=h).json()["title"] == "Hello"
        assert c.put(f"/api/snippets/{sid}", json={"title": "Hi", "tags": []}, headers=h).json()["title"] == "Hi"
        assert c.delete(f"/api/snippets/{sid}", headers=h).status_code == 204
        assert c.get(f"/api/snippets/{sid}", headers=h).status_code == 404


def test_users_are_isolated(tmp_path):
    """A user must never see or touch another user's snippets."""
    with make_client(tmp_path) as c:
        alice = auth_headers(c, "alice", "passw0rd")
        bob = auth_headers(c, "bob", "passw0rd")
        sid = c.post("/api/snippets", json={"title": "alice secret"}, headers=alice).json()["id"]
        # Bob can't list it, read it, or delete it.
        assert c.get("/api/snippets", headers=bob).json() == []
        assert c.get(f"/api/snippets/{sid}", headers=bob).status_code == 404
        assert c.delete(f"/api/snippets/{sid}", headers=bob).status_code == 404
        # Alice still has it.
        assert len(c.get("/api/snippets", headers=alice).json()) == 1


def test_tag_normalization(tmp_path):
    with make_client(tmp_path) as c:
        h = auth_headers(c)
        r = c.post("/api/snippets", json={"title": "T", "tags": ["JS", " js ", "Utils", ""]}, headers=h)
        assert r.json()["tags"] == ["js", "utils"]  # lowercased, trimmed, deduped, no blanks


def test_search_and_exact_tag(tmp_path):
    with make_client(tmp_path) as c:
        h = auth_headers(c)
        c.post("/api/snippets", json={"title": "venv setup", "code": "python -m venv", "tags": ["python"]}, headers=h)
        c.post("/api/snippets", json={"title": "debounce", "code": "setTimeout", "tags": ["js"]}, headers=h)
        assert [s["title"] for s in c.get("/api/snippets", params={"q": "venv"}, headers=h).json()] == ["venv setup"]
        # exact tag: "py" must NOT match "python"
        assert c.get("/api/snippets", params={"tag": "py"}, headers=h).json() == []
        assert len(c.get("/api/snippets", params={"tag": "python"}, headers=h).json()) == 1


def test_pin_floats_to_top(tmp_path):
    with make_client(tmp_path) as c:
        h = auth_headers(c)
        c.post("/api/snippets", json={"title": "first"}, headers=h)
        second = c.post("/api/snippets", json={"title": "second"}, headers=h).json()["id"]
        c.patch(f"/api/snippets/{second}/pin", headers=h)
        assert c.get("/api/snippets", headers=h).json()[0]["title"] == "second"
