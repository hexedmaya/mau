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
// History router: real paths (/docs/router), no #. The server has to answer every unknown path with index.html.
// Routes: { "/": Home, "/inst/:id": Inst, "*": NotFound }
import { signal, untracked } from "./reactive.js";

let base = ""; // "/app" when the site does not live at the root of the domain
const clean = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p); // "/docs/" is "/docs"

const read = () => {
  let p = location.pathname;
  if (base && (p === base || p.startsWith(base + "/"))) p = p.slice(base.length) || "/";
  return clean(p || "/") + location.search;
};

const current = signal(read());
addEventListener("popstate", () => current.set(read()));

// Go to a path. `replace` swaps the current history entry instead of adding one.
export function navigate(to, { replace = false } = {}) {
  history[replace ? "replaceState" : "pushState"](null, "", base + to);
  current.set(read());
}

// Plain links do the work: a click on a normal <a href="/docs"> to the same site is a navigation without
// a page load. Modified clicks, target="_blank", downloads, other sites and #anchors on the same page are left alone.
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target?.closest?.("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.origin !== location.origin) return;
    // data-native and rel="external" mark a link the server has to answer, like a file or an export
    if (a.hasAttribute("data-native") || a.getAttribute("rel") === "external") return;
    if (a.pathname === location.pathname && a.search === location.search && a.hash) return;
    if (base && !(a.pathname === base || a.pathname.startsWith(base + "/"))) return;
    e.preventDefault();
    navigate((a.pathname.slice(base.length) || "/") + a.search + a.hash);
  });
}

// Reactive: { path, query }
export const route = () => {
  const [path, qs = ""] = current().split("?");
  // ?tag=a&tag=b gives { tag: ["a", "b"] }, a key that appears once stays a string
  const values = new Map();
  for (const [k, v] of new URLSearchParams(qs)) values.set(k, values.has(k) ? [].concat(values.get(k), v) : v);
  return { path, query: Object.fromEntries(values) };
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
// Options: { base: "/app" } if the site lives below a path.
export function router(routes, { base: b } = {}) {
  if (b != null) {
    base = clean(b === "/" ? "" : b);
    current.set(read());
  }
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
