/*
 * ╔═══════════════════════════════════════════════════════════╗
 * ║                                                           ║
 * ║   m a u   ·   Make A UI                                   ║
 * ║                                                           ║
 * ║   Copyright © 2026 hexedmaya                              ║
 * ║   mau License 1.0                                         ║
 * ║                                                           ║
 * ╚═══════════════════════════════════════════════════════════╝
 */
// Hash router: works from any static server, no server config. Routes: { "/": Home, "/inst/:id": Inst, "*": NotFound }
import { signal, untracked } from "./reactive.js";

const read = () => location.hash.slice(1) || "/";
const current = signal(read());
addEventListener("hashchange", () => current.set(read()));

export const navigate = (to) => { location.hash = to; };

// Reactive: { path, query }
export const route = () => {
  const [path, qs = ""] = current().split("?");
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
};

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

function match(pattern, path) {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "*") return params;
    if (i >= b.length) return null;
    if (a[i][0] === ":") params[a[i].slice(1)] = safeDecode(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return a.length === b.length ? params : null;
}

// Returns a function to use as a reactive child: {view()}. Pages get props { params, query }.
export function router(routes) {
  const entries = Object.entries(routes);
  return () => {
    const { path, query } = route();
    for (const [pattern, page] of entries) {
      const params = match(pattern, path);
      if (params) return untracked(() => page({ params, query }));
    }
    return null;
  };
}
