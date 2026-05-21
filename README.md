# Snippet Vault

A small, persistent app for saving code snippets. Create, view, edit, delete —
and they survive restarts because everything is stored in a local SQLite file.

Beyond plain CRUD it has the things you'd actually want from a snippet tool:

- **Full-text search** across title, code, and tags (debounced, instant)
- **Tag filtering** with click-to-toggle chips
- **Pinning** so your most-used snippets float to the top
- **One-click copy** of any snippet's code

**Stack:** React (Vite) frontend · FastAPI backend · SQLite storage.

![theme: dark, blue accent, pill buttons]

---

## Run it

You need **Python 3.10+** and **Node 18+** installed. Two terminals.

### Terminal 1 — backend (FastAPI on :8000)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```

### Terminal 2 — frontend (Vite dev server on :5173)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

> The Vite dev server proxies `/api` to the backend on `:8000`, so you only ever
> open the one URL.

### Or: one command (Windows PowerShell)

From the repo root, this sets up the venv, installs both sides, and launches
both servers:

```powershell
.\run.ps1
```

---

## Verifying persistence

Create a few snippets, then stop the backend (Ctrl+C) and start it again with
`python -m uvicorn main:app --port 8000`. Your snippets are still there — they
live in `backend/snippets.db`, which is created automatically on first run.

---

## Running the tests (optional)

```powershell
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

Covers the CRUD round-trip, tag normalization, search + exact-tag matching, and
pin ordering. Tests use a throwaway database and never touch your real data.

---

## API reference

| Method   | Path                       | Purpose                                  |
| -------- | -------------------------- | ---------------------------------------- |
| `GET`    | `/api/snippets?q=&tag=`    | List snippets (optional search + tag)    |
| `POST`   | `/api/snippets`            | Create a snippet                         |
| `GET`    | `/api/snippets/{id}`       | Fetch one                                |
| `PUT`    | `/api/snippets/{id}`       | Update                                   |
| `PATCH`  | `/api/snippets/{id}/pin`   | Toggle pinned                            |
| `DELETE` | `/api/snippets/{id}`       | Delete                                   |
| `GET`    | `/api/tags`                | Distinct tags (for the filter chips)     |
| `GET`    | `/api/health`              | Health check                             |

Interactive docs (Swagger UI) are at **http://localhost:8000/docs** while the
backend is running.

---

## Project layout

```
backend/
  main.py            FastAPI app + routes
  db.py              SQLite connection, schema, tag normalization
  test_api.py        pytest smoke tests
  requirements.txt   runtime deps (fastapi, uvicorn)
frontend/
  src/App.jsx        the whole UI (list, search, modal, cards)
  src/api.js         fetch wrapper
  src/styles.css     dark theme
  vite.config.js     dev server + /api proxy
run.ps1              one-command launcher (Windows)
ANSWERS.md           assessment questions
```
