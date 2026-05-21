// Thin wrapper around the FastAPI backend. All calls go through the Vite
// proxy ("/api" -> http://localhost:8000), so there is nothing to configure.

const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
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
