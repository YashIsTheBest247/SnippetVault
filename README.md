# Snippet Vault

A small, persistent app for saving code snippets. Create, view, edit, and delete
snippets that survive restarts because everything is stored in a local SQLite file.

Beyond plain CRUD it has the things you'd actually want from a snippet tool:

- **Full-text search** across title, code, and tags (debounced, instant)
- **Tag filtering** with click-to-toggle chips
- **Pinning** so your most-used snippets float to the top
- **One-click copy** of any snippet's code
- **Authentication** 

**Stack:** React (Vite) frontend · FastAPI backend · SQLite storage.

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

## How to use

1. **Add a snippet.** Click **+ NEW SNIPPET** (top right). Give it a title, pick
   a language, paste your code, and add comma-separated tags (e.g.
   `react, hooks`). Click **Create snippet**.
2. **Find things fast.** Type in the search box to match across titles, code, and
   tags as you type. Click a **#tag chip** to filter to just that tag; click it
   again to clear.
3. **Pin the important ones.** Click the **☆** on a card to pin it — pinned
   snippets always sort to the top.
4. **Copy / edit / delete.** Each card has a **Copy** button (copies the code to
   your clipboard), plus **Edit** and **Delete**.

---

## Verifying persistence

Create a few snippets, then stop the backend (Ctrl+C) and start it again with
`python -m uvicorn main:app --port 8000`. Your snippets are still there — they
live in `backend/snippets.db`, which is created automatically on first run.

---

## API reference
```bash
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
```
Interactive docs (Swagger UI) are at **http://localhost:8000/docs** while the backend is running.

---

## Project layout

```
backend/
  main.py            FastAPI app + routes
  db.py              SQLite connection, schema, tag normalization
  requirements.txt   runtime deps (fastapi, uvicorn)
frontend/
  src/App.jsx        the whole UI (list, search, modal, cards)
  src/api.js         fetch wrapper
  vite.config.js     dev server + /api proxy
run.ps1              one-command launcher (Windows)
ANSWERS.md           assessment questions
```
