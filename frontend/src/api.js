const BASE = "/api";
const TOKEN_KEY = "snippet_vault_token";

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class AuthError extends Error {}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(BASE + path, { ...options, headers });

  if (res.status === 401) {
    token.clear();
    throw new AuthError("Your session expired. Please sign in again.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      detail = res.statusText;
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (username, password) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  list: (q = "", tag = "") => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const qs = params.toString();
    return request(`/snippets${qs ? `?${qs}` : ""}`);
  },
  tags: () => request("/tags"),
  create: (data) => request("/snippets", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) => request(`/snippets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  togglePin: (id) => request(`/snippets/${id}/pin`, { method: "PATCH" }),
  remove: (id) => request(`/snippets/${id}`, { method: "DELETE" }),
};
