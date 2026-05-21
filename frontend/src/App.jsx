import { useEffect, useMemo, useRef, useState } from "react";
import { api, token, AuthError } from "./api.js";

const EMPTY_FORM = { title: "", language: "javascript", code: "", tags: "" };

function readUserFromToken() {
  const t = token.get();
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
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

const SOCIALS = {
  github: "https://github.com/YashIsTheBest247",
  linkedin: "https://www.linkedin.com/in/yash-munshi-a0408b337/",
  portfolio: "https://yash-munshi.vercel.app/",
};

export default function App() {
  const [user, setUser] = useState(() => readUserFromToken());
  const [snippets, setSnippets] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const debounceRef = useRef(null);

  async function load(q = query, tag = activeTag) {
    try {
      setError("");
      const [items, tags] = await Promise.all([api.list(q, tag), api.tags()]);
      setSnippets(items);
      setAllTags(tags);
    } catch (e) {
      if (e instanceof AuthError) {
        setUser(null);
        return;
      }
      setError(e.message || "Failed to reach the API. Is the backend running on :8000?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      setLoading(true);
      load("", "");
    }
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
          {snippets.map((s, i) => (
            <SnippetCard
              key={s.id}
              s={s}
              index={i}
              onEdit={() => openEdit(s)}
              onDelete={() => handleDelete(s)}
              onPin={() => handlePin(s)}
            />
          ))}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-row">
          <Logo />
          <div className="socials">
            <span className="socials-label">Follow the creator</span>
            <SocialLink href={SOCIALS.github} label="GitHub" icon="github" />
            <SocialLink href={SOCIALS.linkedin} label="LinkedIn" icon="linkedin" />
            <SocialLink href={SOCIALS.portfolio} label="Portfolio" icon="portfolio" />
          </div>
        </div>
        <div className="footer-row footer-bottom">
          <span className="muted">© {new Date().getFullYear()} — All Rights Reserved. All Wrongs Reversed.</span>
          <span className="muted">Made with 💙 by Yash Munshi</span>
        </div>
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

function Logo({ size = "md" }) {
  return (
    <div className={`logo logo-${size}`}>
      <svg className="logo-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#lgFill)" />
        <rect
          x="2.6" y="2.6" width="34.8" height="34.8" rx="10.4"
          stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"
        />
        <path d="M16 13 L10 20 L16 27" stroke="#fff" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 13 L30 20 L24 27" stroke="#fff" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" />
        <line x1="22.4" y1="12" x2="17.6" y2="28" stroke="rgba(255,255,255,0.85)"
          strokeWidth="2.4" strokeLinecap="round" />
        <defs>
          <linearGradient id="lgFill" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4d83ff" />
            <stop offset="1" stopColor="#1746b8" />
          </linearGradient>
        </defs>
      </svg>
      <span className="logo-word">
        Snippet<span className="logo-word-2"> Vault</span><span className="dot">.</span>
      </span>
    </div>
  );
}

const SOCIAL_ICONS = {
  github: (
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
  ),
  linkedin: (
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  ),
  portfolio: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a7.96 7.96 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26zm.81 2h2.95c.32 1.25.79 2.45 1.38 3.56A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07a8.03 8.03 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.02 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82A13.7 13.7 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.26 5.56c.59-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a7.96 7.96 0 0 1 0 4h-3.38z" />
  ),
};

function SocialLink({ href, label, icon }) {
  return (
    <a className="social" href={href} target="_blank" rel="noreferrer noopener" aria-label={label}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{SOCIAL_ICONS[icon]}</svg>
      <span>{label}</span>
    </a>
  );
}

function NavBar({ onNew, user, onLogout }) {
  return (
    <nav className="nav">
      <Logo />
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

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
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
        <div className="auth-brand">
          <Logo size="lg" />
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

function SnippetCard({ s, index = 0, onEdit, onDelete, onPin }) {
  const [copied, setCopied] = useState(false);
  const enterDelay = `${Math.min(index, 12) * 45}ms`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(s.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article
      className={`card card-enter ${s.pinned ? "card-pinned" : ""}`}
      style={{ animationDelay: enterDelay }}
    >
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
