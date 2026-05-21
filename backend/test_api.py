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
    import main

    importlib.reload(main)
    return TestClient(main.app)


def test_crud_roundtrip(tmp_path):
    with make_client(tmp_path) as c:
        # create
        r = c.post("/api/snippets", json={"title": "Hello", "code": "print(1)", "tags": ["py"]})
        assert r.status_code == 201
        sid = r.json()["id"]
        # read
        assert c.get(f"/api/snippets/{sid}").json()["title"] == "Hello"
        # update
        assert c.put(f"/api/snippets/{sid}", json={"title": "Hi", "tags": []}).json()["title"] == "Hi"
        # delete + 404 afterwards
        assert c.delete(f"/api/snippets/{sid}").status_code == 204
        assert c.get(f"/api/snippets/{sid}").status_code == 404


def test_tag_normalization(tmp_path):
    with make_client(tmp_path) as c:
        r = c.post("/api/snippets", json={"title": "T", "tags": ["JS", " js ", "Utils", ""]})
        assert r.json()["tags"] == ["js", "utils"]  # lowercased, trimmed, deduped, no blanks


def test_search_and_exact_tag(tmp_path):
    with make_client(tmp_path) as c:
        c.post("/api/snippets", json={"title": "venv setup", "code": "python -m venv", "tags": ["python"]})
        c.post("/api/snippets", json={"title": "debounce", "code": "setTimeout", "tags": ["js"]})
        assert [s["title"] for s in c.get("/api/snippets", params={"q": "venv"}).json()] == ["venv setup"]
        # exact tag: "py" must NOT match "python"
        assert c.get("/api/snippets", params={"tag": "py"}).json() == []
        assert len(c.get("/api/snippets", params={"tag": "python"}).json()) == 1


def test_pin_floats_to_top(tmp_path):
    with make_client(tmp_path) as c:
        c.post("/api/snippets", json={"title": "first"})
        second = c.post("/api/snippets", json={"title": "second"}).json()["id"]
        c.patch(f"/api/snippets/{second}/pin")
        assert c.get("/api/snippets").json()[0]["title"] == "second"
