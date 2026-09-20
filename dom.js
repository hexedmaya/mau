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
// mau DOM helpers. Text is always set as text. Raw HTML only via raw().
import { signal, effect, untracked, batch, getOwner, setOwner } from "./reactive.js";

export function onDestroy(fn) {
  getOwner()?.push(fn);
}

class Raw { constructor(html) { this.html = html; } }
export const raw = (html) => new Raw(String(html));

// Keyed list: an entry is rebuilt only when its key is new or its item changed; others are only moved.
// With `live`, a row whose key stays but whose item is a new object is updated in place (polling data),
// through a proxy that always reads the newest object.
class Each { constructor(list, key, render, live) { this.list = list; this.key = key; this.render = render; this.live = live; } }
export const each = (list, key, render, live) => new Each(list, key, render, live);

const isObj = (v) => v !== null && typeof v === "object";

function rowProxy(sig) {
  return new Proxy(Array.isArray(sig.peek()) ? [] : {}, {
    get: (_, p) => Reflect.get(sig(), p),
    has: (_, p) => Reflect.has(sig(), p),
    ownKeys: () => Reflect.ownKeys(sig()),
    getOwnPropertyDescriptor: (target, p) => {
      const d = Reflect.getOwnPropertyDescriptor(sig(), p);
      if (!d) return undefined;
      // proxy rule: what the target has as non-configurable (an array's length) must be reported that way
      const fixed = Reflect.getOwnPropertyDescriptor(target, p);
      return { ...d, configurable: !(fixed && !fixed.configurable) };
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(sig()),
  });
}

const range = (e) => {
  const out = [];
  for (let n = e.s; ; n = n.nextSibling) { out.push(n); if (n === e.e) return out; }
};
const drop = (e) => { for (const d of e.disposers) d(); for (const n of range(e)) n.remove(); };

// Attributes that load or navigate to a URL must not run script.
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "data", "cite", "xlink:href"]);
const BAD_URL = /^[\s\u0000-\u001f]*(?:javascript|vbscript):/i;

function setProp(el, key, val) {
  if (val == null || val === false) {
    el.removeAttribute(key);
    // only these are live properties that removing the attribute does not reset
    if (key === "value") el.value = "";
    else if (key === "checked" || key === "selected") el[key] = false;
  } else if (key === "value" || key === "checked" || key === "selected" || key === "disabled") {
    el[key] = val;
  } else if (key === "style" && typeof val === "object") {
    Object.assign(el.style, val);
  } else if (key === "srcdoc" || (URL_ATTRS.has(key) && BAD_URL.test(String(val)))) {
    console.warn(`mau: blocked unsafe ${key}`);
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, val === true ? "" : String(val));
  }
}

function append(parent, child) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) { for (const c of child) append(parent, c); return; }
  if (child instanceof Raw) {
    const t = document.createElement("template");
    t.innerHTML = child.html;
    parent.append(t.content);
  } else if (child instanceof Each) {
    const start = document.createComment("");
    const end = document.createComment("");
    parent.append(start, end);
    let entries = new Map();
    effect(() => {
      const next = new Map();
      let cursor = start;
      child.list().forEach((item, i) => {
        const k = child.key ? child.key(item, i) : i;
        if (next.has(k)) console.warn("mau: duplicate key in {#each}:", k);
        let e = entries.get(k);
        if (e && Object.is(e.item, item)) entries.delete(k);
        else if (e && e.sig && isObj(item)) { e.item = item; e.sig.set(item); entries.delete(k); }
        else {
          const disposers = [];
          const prev = setOwner(disposers);
          const frag = document.createDocumentFragment();
          const s = document.createComment(""), en = document.createComment("");
          frag.append(s);
          const sig = child.live && isObj(item) ? signal(item) : null;
          try { untracked(() => append(frag, child.render(sig ? rowProxy(sig) : item, i))); } finally { setOwner(prev); }
          frag.append(en);
          e = { item, sig, s, e: en, disposers };
        }
        next.set(k, e);
        if (cursor.nextSibling !== e.s) cursor.after(...range(e));
        cursor = e.e;
      });
      for (const e of entries.values()) drop(e);
      entries = next;
    });
    onDestroy(() => { for (const e of entries.values()) drop(e); });
  } else if (child instanceof Node) {
    parent.append(child);
  } else if (typeof child === "function") {
    const start = document.createComment("");
    const end = document.createComment("");
    parent.append(start, end);
    effect(() => {
      const frag = document.createDocumentFragment();
      append(frag, child());
      while (start.nextSibling && start.nextSibling !== end) start.nextSibling.remove();
      end.before(frag);
    });
  } else {
    parent.append(document.createTextNode(String(child)));
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "text", "tspan", "textPath",
  "defs", "use", "symbol", "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "stop",
  "filter", "feGaussianBlur", "feOffset", "feColorMatrix", "feBlend", "feMerge", "feMergeNode", "feFlood", "feComposite",
  "foreignObject", "image", "desc", "animate", "animateTransform", "set",
]);

export function h(tag, props, ...children) {
  // "svg:title" / "svg:a": the compiler marks names that exist in HTML too when they sit inside an <svg>
  const el = tag.startsWith("svg:") ? document.createElementNS(SVG_NS, tag.slice(4))
    : SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  if (props && (typeof props !== "object" || props instanceof Node || props instanceof Raw || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  let selectValue; // a <select> takes its value after the options exist, so it waits for the children
  for (const [key, val] of Object.entries(props || {})) {
    if (key === "value" && tag === "select") {
      selectValue = val;
    } else if (/^on[a-z]/i.test(key)) {
      // one event = one round of updates, however many signals the handler writes
      if (typeof val === "function") el.addEventListener(key.slice(2).toLowerCase(), (e) => batch(() => val(e)));
      else if (val != null && val !== false) throw new Error(`mau: ${key} needs a function, not a string`);
    } else if (key === "ref") {
      val(el);
    } else if (typeof val === "function") {
      effect(() => setProp(el, key, val()));
    } else {
      setProp(el, key, val);
    }
  }
  for (const c of children) append(el, c);
  if (selectValue !== undefined) {
    if (typeof selectValue === "function") effect(() => setProp(el, "value", selectValue()));
    else setProp(el, "value", selectValue);
  }
  return el;
}

// div(...), span(...), button(...) and so on
export const tags = new Proxy({}, {
  get: (_, name) => (props, ...children) => h(name, props, ...children),
});

// Build a component. It gets its own scope; destroy() runs every onDestroy and stops every effect.
export function component(setup, ...args) {
  const own = [];
  const prev = setOwner(own);
  let node;
  try { node = setup(...args); } finally { setOwner(prev); }
  return { node, destroy() { for (const d of own.splice(0)) d(); } };
}

// Constructed stylesheet: works under a strict CSP (no inline <style>).
export function adoptStyle(css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function mount(target, setup, ...args) {
  const c = component(setup, ...args);
  target.replaceChildren(c.node);
  return c.destroy;
}
