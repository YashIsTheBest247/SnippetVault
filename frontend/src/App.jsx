import { useEffect, useMemo, useRef, useState } from "react";
import { api, token, AuthError } from "./api.js";

const EMPTY_FORM = { title: "", language: "javascript", code: "", tags: "" };

// Read the username out of a stored JWT without trusting it (the server is the
// real authority). Lets us show the right screen instantly on reload, before
// any network call. Returns null for a missing/expired/malformed token.
function readUserFromToken() {
  const t = token.get();
  if (!t) return null;
  try {
    const payload = JSON.parse(
      atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      token.clear();
      return null;
    }
    return payload.username || "user";
  } catch {
    return null;
  }
}

const LANGS = [
  "javascript", "typescript", "python", "go", "rust", "java",
  "sql", "bash", "html", "css", "json", "plaintext",
];

export default function App() {
  const [user, setUser] = useState(() => readUserFromToken());
  const [snippets, setSnippets] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // snippet being edited, or null for "new"

  // Debounce the search box so we don't fire a request on every keystroke.
  const debounceRef = useRef(null);

  async function load(q = query, tag = activeTag) {
    try {
      setError("");
      const [items, tags] = await Promise.all([api.list(q, tag), api.tags()]);
      setSnippets(items);
      setAllTags(tags);
    } catch (e) {
      if (e instanceof AuthError) {
        setUser(null); // token expired/invalid -> back to the sign-in screen
        return;
      }
      setError(e.message || "Failed to reach the API. Is the backend running on :8000?");
    } finally {
      setLoading(false);
    }
  }

  // Load (or reload) snippets whenever we have an authenticated user.
  useEffect(() => {
    if (user) {
      setLoading(true);
      load("", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleAuthed(username) {
    setQuery("");
    setActiveTag("");
    setUser(username);
  }

  function logout() {
    token.clear();
    setSnippets([]);
    setAllTags([]);
    setUser(null);
  }

  // Not signed in -> show the auth screen, nothing else.
  if (!user) return <AuthScreen onAuthed={handleAuthed} />;

  function onSearchChange(value) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value, activeTag), 250);
  }

  function onSelectTag(tag) {
    const next = activeTag === tag ? "" : tag;
    setActiveTag(next);
    load(query, next);
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(s) {
    setEditing(s);
    setModalOpen(true);
  }

  async function handleSave(form) {
    const payload = {
      title: form.title.trim(),
      language: form.language,
      code: form.code,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (editing) await api.update(editing.id, payload);
    else await api.create(payload);
    setModalOpen(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(s) {
    if (!confirm(`Delete "${s.title}"? This cannot be undone.`)) return;
    await api.remove(s.id);
    await load();
  }

  async function handlePin(s) {
    await api.togglePin(s.id);
    await load();
  }

  const count = snippets.length;

  return (
    <div className="app">
      <NavBar onNew={openNew} user={user} onLogout={logout} />

      <header className="hero">
        <h1>
          SNIPPET VAULT<span className="dot">.</span>
        </h1>
        <p className="tagline">Your code, searchable and persistent.</p>
        <div className="hero-meta">
          <span className="meta-item">⌗ {count} snippet{count === 1 ? "" : "s"}</span>
          <span className="meta-item ok"><span className="pulse" /> For a coder, by a coder</span>
        </div>
      </header>

      <section className="controls">
        <div className="search">
          <span className="search-icon">⌕</span>
          <input
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search title, code or tags…"
            aria-label="Search snippets"
          />
          {query && (
            <button className="clear" onClick={() => onSearchChange("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="tagbar">
            {allTags.map((t) => (
              <button
                key={t}
                className={`chip ${activeTag === t ? "chip-active" : ""}`}
                onClick={() => onSelectTag(t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </section>

      <main className="grid-wrap">
        {error && <div className="banner error">{error}</div>}
        {loading && <div className="banner">Loading…</div>}
        {!loading && !error && count === 0 && (
          <EmptyState filtered={Boolean(query || activeTag)} onNew={openNew} />
        )}
        <div className="grid">
          {snippets.map((s) => (
            <SnippetCard
              key={s.id}
              s={s}
              onEdit={() => openEdit(s)}
              onDelete={() => handleDelete(s)}
              onPin={() => handlePin(s)}
            />
          ))}
        </div>
      </main>

      <footer className="footer">
        <span>SNIPPET VAULT</span>
        <span className="muted">Made with 💙 by Yash Munshi</span>
      </footer>

      {modalOpen && (
        <SnippetModal
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isRegister = mode === "register";

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (username.trim().length < 3) return setErr("Username must be at least 3 characters.");
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const fn = isRegister ? api.register : api.login;
      const res = await fn(username.trim(), password);
      token.set(res.access_token);
      onAuthed(res.username);
    } catch (e2) {
      setErr(e2.message || "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="monogram">SV</span>
          <span className="brandname">SNIPPET VAULT<span className="dot">.</span></span>
        </div>
        <h1 className="auth-title">{isRegister ? "Create your vault" : "Welcome back"}</h1>
        <p className="auth-sub">
          {isRegister
            ? "Your snippets stay private to your account."
            : "Sign in to your private snippet vault."}
        </p>

        <form onSubmit={submit}>
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            placeholder="yourname"
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder="••••••••"
          />

          {err && <div className="banner error">{err}</div>}

          <button type="submit" className="pill pill-primary auth-submit" disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            <span className="arrow">↗</span>
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "New here?"}{" "}
          <button
            className="link"
            onClick={() => {
              setMode(isRegister ? "login" : "register");
              setErr("");
            }}
          >
            {isRegister ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}

function NavBar({ onNew, user, onLogout }) {
  return (
    <nav className="nav">
      <div className="brand">
        <span className="monogram">SV</span>
        <span className="brandname">SNIPPET <span className="dot">.</span></span>
      </div>
      <div className="nav-right">
        <button className="pill pill-primary" onClick={onNew}>
          + NEW SNIPPET <span className="arrow">↗</span>
        </button>
        <span className="user-chip" title={`Signed in as ${user}`}>
          <span className="avatar">{user.slice(0, 1).toUpperCase()}</span>
          {user}
        </span>
        <button className="pill pill-ghost" onClick={onLogout}>Log out</button>
      </div>
    </nav>
  );
}

function SnippetCard({ s, onEdit, onDelete, onPin }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(s.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked (e.g. insecure context) — ignore */
    }
  }

  return (
    <article className={`card ${s.pinned ? "card-pinned" : ""}`}>
      <div className="card-head">
        <h3 title={s.title}>{s.title}</h3>
        <button
          className={`star ${s.pinned ? "star-on" : ""}`}
          onClick={onPin}
          title={s.pinned ? "Unpin" : "Pin to top"}
        >
          {s.pinned ? "★" : "☆"}
        </button>
      </div>

      <div className="lang">{s.language}</div>

      <pre className="code">
        <code>{s.code || "// (empty)"}</code>
      </pre>

      {s.tags.length > 0 && (
        <div className="card-tags">
          {s.tags.map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      )}

      <div className="card-actions">
        <button className="ghost" onClick={copy}>{copied ? "✓ Copied" : "Copy"}</button>
        <button className="ghost" onClick={onEdit}>Edit</button>
        <button className="ghost danger" onClick={onDelete}>Delete</button>
      </div>
    </article>
  );
}

function EmptyState({ filtered, onNew }) {
  return (
    <div className="empty">
      {filtered ? (
        <>
          <h2>No matches</h2>
          <p>Nothing matches your search or tag filter. Try clearing it.</p>
        </>
      ) : (
        <>
          <h2>Your vault is empty</h2>
          <p>Save your first snippet — it'll still be here after you restart.</p>
          <button className="pill pill-primary" onClick={onNew}>+ NEW SNIPPET <span className="arrow">↗</span></button>
        </>
      )}
    </div>
  );
}

function SnippetModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          language: initial.language,
          code: initial.code,
          tags: initial.tags.join(", "),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e2) {
      setErr(e2.message || "Save failed.");
      setSaving(false);
    }
  }

  const titleId = useMemo(() => `t-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial ? "Edit snippet" : "New snippet"}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor={titleId}>Title</label>
          <input
            id={titleId}
            autoFocus
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Debounce helper"
          />

          <label>Language</label>
          <select value={form.language} onChange={(e) => set("language", e.target.value)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <label>Code</label>
          <textarea
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder="Paste your code here…"
          />

          <label>Tags <span className="hint">(comma separated)</span></label>
          <input
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="react, hooks, utils"
          />

          {err && <div className="banner error">{err}</div>}

          <div className="modal-actions">
            <button type="button" className="pill" onClick={onClose}>Cancel</button>
            <button type="submit" className="pill pill-primary" disabled={saving}>
              {saving ? "Saving…" : initial ? "Save changes" : "Create snippet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
