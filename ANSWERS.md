# ANSWERS

## 1. How to run

You need **Python 3.10+** and **Node 18+**. Two terminals from the repo root:

**Backend** (FastAPI, port 8000):
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```

**Frontend** (Vite dev server, port 5173):
```powershell
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173**.

On Windows you can instead run `.\run.ps1` from the root, which does the setup
and starts both servers. Data persists in `backend/snippets.db` (created on
first run) — stop the backend, restart it, and your snippets are still there.

---

## 2. Stack choice

**React (Vite) + FastAPI + SQLite.** The task said to default to React + FastAPI
if no stack was specified, so the only real decision was storage and shape.

- **SQLite** is the right persistence layer here: it's a single file with zero
  setup, ships in the Python standard library, and gives the exact "create
  items, restart, items are still there" behaviour the task asks for. I used the
  stdlib `sqlite3` module directly instead of an ORM — for an app this size an
  ORM is overhead, and avoiding it means the backend has **zero compiled
  dependencies**, so `pip install` just works (which mattered: I'm on the very
  new Python 3.14, where heavier packages can lack prebuilt wheels).
- **Vite** over Create-React-App because CRA is effectively deprecated and Vite's
  dev proxy lets the frontend and backend share one origin with no CORS fuss.

**Worse choices:**
- **PostgreSQL / a hosted DB** — you'd need a running database server (or network
  + credentials) on a fresh machine just to view a list of snippets. That fails
  the "run it on a fresh machine" spirit for what is local, single-user data.
- **A flat JSON file** — tempting for simplicity, but concurrent writes can
  corrupt it, and I'd have to hand-roll the search/filter that SQLite gives me
  with a `WHERE` clause. SQLite is barely more code and far more robust.

---

## 3. One real edge case

**The database path is anchored to the source file, not the current working
directory.** See [`backend/db.py:18`](backend/db.py#L18):

```python
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snippets.db")
```

The naive version is `DB_PATH = "snippets.db"`, a relative path. That resolves
against **whatever directory the server was launched from**, not where the code
lives. So a user who starts the backend from `backend/` on Monday and from the
repo root on Tuesday would silently get two *different* database files — and
their Monday snippets would appear to have vanished. For an app whose entire
point is "your items are still there after a restart," that's the worst possible
failure. Anchoring to `__file__` guarantees one stable location regardless of
how `uvicorn` is invoked.

**Bonus edge case** ([`backend/main.py:105`](backend/main.py#L105)): tag
filtering matches `(',' || tags || ',') LIKE '%,tag,%'` rather than a bare
`LIKE '%tag%'`. Without the comma-wrapping, filtering by `py` would wrongly
match a snippet tagged `python`. The test `test_search_and_exact_tag` in
[`backend/test_api.py`](backend/test_api.py) locks this behaviour in.

---

## 4. AI usage

I used **Claude (Claude Code)** throughout. Specifically:

1. **Scaffolding the whole project** — I asked it to build a persistent
   React + FastAPI CRUD app themed like a dark developer portfolio. It produced
   the backend routes, the React UI, and the CSS.
2. **The SQLite layer** — I asked for stdlib `sqlite3` (no ORM) and it wrote the
   schema, connection helper, and tag normalization.
3. **Styling** — I gave it the portfolio screenshot (black background, blue
   accent, pill buttons, monogram) and it generated `styles.css` to match.
4. **Tests** — I asked for pytest smoke tests covering CRUD, search, and pinning.

**What I changed about the AI output:** the database is initialized in a
`lifespan` handler (see `lifespan()` in [`backend/main.py`](backend/main.py)).
When I first ran the tests they all failed with `sqlite3.OperationalError: no
such table: snippets`. The cause: FastAPI's `TestClient` only fires the
`lifespan` startup when it's used as a context manager, and the generated tests
instantiated it plainly (`c = TestClient(app)`). I rewrote the test helper to
open it as `with make_client(...) as c:` so the table actually gets created
before the requests run. I also made the tests point `db.DB_PATH` at a temp file
*before* importing the app, so a test run never touches the real `snippets.db`.

---

## 5. Honest gap

**There's no authentication or multi-user isolation, and no pagination.** Right
now every snippet lives in one shared SQLite table; it's a single-user local app,
and `GET /api/snippets` returns *all* rows. That's fine for a few hundred
snippets but it would get slow and unwieldy at a few thousand, and there's no way
for two people to keep separate vaults.

**With another day** I'd: (a) add cursor-based pagination plus a SQLite **FTS5**
virtual table so search stays fast and ranks results by relevance instead of a
linear `LIKE` scan; and (b) add lightweight user accounts (or at least a per-user
DB file / `user_id` column) so the app could be hosted for more than one person.
I'd also add a couple of frontend tests (currently only the backend is tested)
and syntax highlighting in the code preview, which is an obvious nicety for a
snippet tool that I left out to keep the dependency footprint small.
