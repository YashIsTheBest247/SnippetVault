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
directory.** See [`backend/db.py:21`](backend/db.py#L21):

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

**Bonus edge case** ([`backend/main.py:169`](backend/main.py#L169)): tag
filtering matches `(',' || tags || ',') LIKE '%,tag,%'` rather than a bare
`LIKE '%tag%'`. Without the comma-wrapping, filtering by `py` would wrongly
match a snippet tagged `python`. The test `test_search_and_exact_tag` in
[`backend/test_api.py`](backend/test_api.py) locks this behaviour in.

**Auth edge case** ([`backend/main.py:134`](backend/main.py#L134)): login returns
the *same* "Invalid username or password" error whether the username is unknown
or the password is wrong, and delete/get of someone else's snippet returns `404`,
not `403`. Without that, an attacker could enumerate which usernames exist and
which snippet IDs are taken. The `test_users_are_isolated` test pins this down.

---

## 4. AI usage


---

## 5. Honest gap

**The auth has no brute-force protection or token revocation, and search
doesn't scale.** Two concrete weaknesses: (1) `/api/auth/login` has no rate
limiting, so nothing stops an attacker from trying thousands of passwords; and
(2) JWTs are stateless and valid until they expire (one week), so there's no way
to force-log-out a stolen token before then. Separately, list/search is still a
linear `LIKE` scan with no pagination — fine for hundreds of snippets, sluggish
at tens of thousands.

**With another day** I'd: (a) add login rate limiting (e.g. per-IP + per-account
backoff) and move to short-lived access tokens plus a refresh token with a
server-side denylist, so revocation actually works; (b) replace the `LIKE` scan
with a SQLite **FTS5** virtual table and add cursor-based pagination so search
stays fast and ranks by relevance. I'd also add frontend tests (only the backend
is tested today) and syntax highlighting in the code preview — an obvious nicety
I skipped to keep the dependency footprint small.
