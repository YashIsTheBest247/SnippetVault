# Snippet Vault

A small, persistent app for saving code snippets. Create, view, edit, and delete
snippets that survive restarts because everything is stored in a local SQLite file.

Beyond plain CRUD it has the things you'd actually want from a snippet tool:

- **Full-text search** across title, code, and tags (debounced, instant)
- **Tag filtering** with click-to-toggle chips
- **Pinning** so your most-used snippets float to the top
- **One-click copy** of any snippet's code
- **Syntax highlighting** in the code preview (highlight.js, per snippet language)
- **Accounts** — register / log in with JWT auth; each user only sees their own snippets

**Stack:** React (Vite) frontend · FastAPI backend · SQLite storage · JWT auth.

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

1. **Create an account.** On first load you'll see a sign-in screen — click
   **"Create one"**, pick a username (3+ characters) and password (6+
   characters), and submit. You're logged straight in, and a refresh keeps you
   signed in. Log back in anytime with the same credentials.
2. **Add a snippet.** Click **+ NEW SNIPPET** (top right). Give it a title, pick
   a language, paste your code, and add comma-separated tags (e.g.
   `react, hooks`). Click **Create snippet**.
3. **Find things fast.** Type in the search box to match across titles, code, and
   tags as you type. Click a **#tag chip** to filter to just that tag; click it
   again to clear.
4. **Pin the important ones.** Click the **☆** on a card to pin it — pinned
   snippets always sort to the top.
5. **Copy / edit / delete.** Each card has a **Copy** button (copies the code to
   your clipboard), plus **Edit** and **Delete**.

---

## Verifying persistence

Create a few snippets, then stop the backend (Ctrl+C) and start it again with
`python -m uvicorn main:app --port 8000`. Log back in — your snippets are still
there. Both accounts and snippets live in `backend/snippets.db`, which is
created automatically on first run.

---

## API reference

All `/api/snippets` and `/api/tags` routes require an
`Authorization: Bearer <token>` header. Get a token from register or login.

| Method   | Path                       | Purpose                                |
| -------- | -------------------------- | -------------------------------------- |
| `POST`   | `/api/auth/register`       | Create an account, returns a JWT       |
| `POST`   | `/api/auth/login`          | Log in, returns a JWT                  |
| `GET`    | `/api/auth/me`             | Current user from the token            |
| `GET`    | `/api/snippets?q=&tag=`    | List your snippets (search + tag)      |
| `POST`   | `/api/snippets`            | Create a snippet                       |
| `GET`    | `/api/snippets/{id}`       | Fetch one of yours                     |
| `PUT`    | `/api/snippets/{id}`       | Update                                 |
| `PATCH`  | `/api/snippets/{id}/pin`   | Toggle pinned                          |
| `DELETE` | `/api/snippets/{id}`       | Delete                                 |
| `GET`    | `/api/tags`                | Distinct tags (for the filter chips)   |
| `GET`    | `/api/health`              | Health check                           |

Interactive docs (Swagger UI) are at **http://localhost:8000/docs** while the backend is running — use the **Authorize** button to paste a token.

---

## Project layout

```
backend/
  main.py            FastAPI app: auth + snippet routes
  auth.py            JWT issue/verify + current-user dependency
  db.py              SQLite connection, schema, password hashing, tag normalization
  requirements.txt   runtime deps (fastapi, uvicorn, PyJWT)
frontend/
  index.html         app shell + favicon link
  src/App.jsx        the whole UI (auth screen, list, search, modal, cards)
  src/api.js         fetch wrapper + token storage
  src/styles.css     dark theme
  public/favicon.svg logo favicon
  vite.config.js     dev server + /api proxy
run.ps1              one-command launcher (Windows)
ANSWERS.md           assessment questions
```
