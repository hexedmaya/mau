// Runtime checks. The same list runs in the browser (reactivity.html) and in Node (runtime.test.js).
// Each case gets the runtime module and throws when something is wrong.

const ok = (cond, msg = "check failed") => { if (!cond) throw new Error(msg); };
const SVG = "http://www.w3.org/2000/svg";

function quietWarn(fn) {
  const warn = console.warn;
  let count = 0;
  console.warn = () => count++;
  try { fn(); } finally { console.warn = warn; }
  return count;
}

export default [
  ["signal, computed, effect", (M) => {
    const a = M.signal(1), double = M.computed(() => a() * 2), seen = [];
    const stop = M.effect(() => { seen.push(double()); });
    a.set(2); a.set(3); stop(); a.set(4);
    ok(seen.join() === "2,4,6", seen.join());
  }],

  ["component: text is escaped, raw is explicit, bindings update, onDestroy runs", (M) => {
    const { div, p, b, button, ul, li } = M.tags;
    let destroyed = false;
    function Counter() {
      const n = M.signal(0);
      M.onDestroy(() => { destroyed = true; });
      return div(
        p("n: ", b(() => n())),
        button({ onclick: () => n.set(n() + 1) }, "+1"),
        p("<img src=x onerror=alert(1)>"),
        ul(() => Array.from({ length: n() }, (_, i) => li("row ", i + 1))),
        p(M.raw("<em>raw</em>")),
      );
    }
    const host = document.createElement("div");
    const destroy = M.mount(host, Counter);
    ok(!host.querySelector("img") && host.textContent.includes("<img"), "escaped");
    ok(!!host.querySelector("em"), "raw");
    host.querySelector("button").click();
    ok(host.querySelector("b").textContent === "1", "binding");
    ok(host.querySelectorAll("li").length === 1, "list");
    destroy();
    ok(destroyed, "onDestroy");
  }],

  ["svg elements use the SVG namespace, html stays html", (M) => {
    const svg = M.h("svg", { viewBox: "0 0 10 10" }, M.h("path", { d: "M0 0L10 10" }), M.h("svg:title", {}, "tip"));
    ok(svg.namespaceURI === SVG && svg.firstChild.namespaceURI === SVG, "svg + path");
    ok(svg.lastChild.namespaceURI === SVG && svg.lastChild.localName === "title", "svg:title");
    ok(M.h("div").namespaceURI === "http://www.w3.org/1999/xhtml", "div");
    ok(M.h("title").namespaceURI !== SVG, "plain title stays html");
  }],

  ["a binding that goes back to false removes the attribute", (M) => {
    const on = M.signal(true);
    const a = M.h("a", { href: () => (on() ? "#x" : false), hidden: () => !on() });
    on.set(false);
    ok(!a.hasAttribute("href"), "href must not become the string false");
    ok(a.hasAttribute("hidden"), "hidden set");
    on.set(true);
    ok(a.getAttribute("href") === "#x" && !a.hasAttribute("hidden"), "back to true");
  }],

  ["a class binding does not touch the attribute that scopes the styles", (M) => {
    const dark = M.signal(false);
    const root = M.h("div", { "data-m-abc123": "", class: () => "site " + (dark() ? "dark" : "light") });
    dark.set(true);
    ok(root.hasAttribute("data-m-abc123") && root.classList.contains("dark") && !root.classList.contains("light"), root.outerHTML);
  }],

  ["batch: one round of updates, events are batched", (M) => {
    const x = M.signal(1), y = M.signal(1), seen = [];
    M.effect(() => seen.push(x() + "," + y()));
    M.batch(() => { x.set(2); y.set(2); });
    ok(seen.join("|") === "1,1|2,2", seen.join("|"));
    seen.length = 0;
    M.h("button", { onclick: () => { x.set(5); y.set(5); } }).click();
    ok(seen.join("|") === "5,5", seen.join("|"));
  }],

  ["loop guard: an effect that feeds itself stops with a clear error", (M) => {
    const s = M.signal(0);
    let err = null;
    try { M.effect(() => { s.set(s() + 1); }); } catch (e) { err = e; }
    ok(err && /keep triggering/.test(err.message), "recursive write");

    const u = M.signal(0);
    M.effect(() => { const v = u(); if (v > 0) u.set(v + 1); });
    err = null;
    try { M.batch(() => u.set(1)); } catch (e) { err = e; }
    ok(err && /keep triggering/.test(err.message), "endless flush");
    const t = M.signal(0), seen = [];
    M.effect(() => seen.push(t()));
    t.set(1);
    ok(seen.join() === "0,1", "runtime still works afterwards");
  }],

  ["no glitches: an effect on a source and a derived value runs once, with both new", (M) => {
    const n = M.signal(1), doubled = M.computed(() => n() * 2), seen = [];
    M.effect(() => seen.push(n() + "," + doubled()));
    n.set(2);
    ok(seen.join("|") === "1,2|2,4", seen.join("|"));
  }],

  ["no glitches: a diamond runs the effect once, never with one old and one new value", (M) => {
    const n = M.signal(1);
    const a = M.computed(() => n() * 2), b = M.computed(() => n() * 3), seen = [];
    M.effect(() => seen.push(a() + "," + b()));
    n.set(2);
    n.set(3);
    ok(seen.join("|") === "2,3|4,6|6,9", seen.join("|"));
  }],

  ["no glitches: a chain of computed values stays consistent", (M) => {
    const a = M.signal(1), b = M.computed(() => a() + 1), c = M.computed(() => b() + 1), seen = [];
    M.effect(() => seen.push([a(), b(), c()].join()));
    a.set(5);
    ok(seen.join("|") === "1,2,3|5,6,7", seen.join("|"));
  }],

  ["writes outside a batch flush at once, batch merges them", (M) => {
    const x = M.signal(0), y = M.signal(0), seen = [];
    M.effect(() => seen.push(x() + "," + y()));
    x.set(1);
    ok(document.title !== null && seen.join("|") === "0,0|1,0", "one write, one update, done when set returns");
    seen.length = 0;
    M.batch(() => { x.set(2); y.set(2); });
    ok(seen.join("|") === "2,2", seen.join("|"));
  }],

  ["unsafe attributes: javascript: urls, srcdoc, on* strings", (M) => {
    let a;
    const warned = quietWarn(() => {
      a = M.h("a", { href: "javascript:alert(1)" });
      M.h("iframe", { srcdoc: "<b>x</b>" });
    });
    ok(!a.hasAttribute("href") && warned === 2, "blocked");
    ok(M.h("a", { href: "#/x" }).getAttribute("href") === "#/x", "normal href kept");
    let threw = false;
    try { M.h("div", { onclick: "alert(1)" }); } catch { threw = true; }
    ok(threw, "on* with a string");
  }],

  ["cleanup: computed and nested effects stop with their owner", (M) => {
    let runs = 0;
    const s = M.signal(0);
    const kill = M.mount(document.createElement("div"), () => {
      M.computed(() => { runs++; return s() * 2; });
      return M.h("i");
    });
    s.set(1);
    const before = runs;
    kill();
    s.set(2);
    ok(runs === before, "computed after destroy");

    const outer = M.signal(0), inner = M.signal(0);
    let innerRuns = 0;
    M.effect(() => { outer(); M.effect(() => { inner(); innerRuns++; }); });
    outer.set(1);
    innerRuns = 0;
    inner.set(1);
    ok(innerRuns === 1, "old inner effect was disposed, got " + innerRuns);
  }],

  ["an {#if} branch is not rebuilt when a signal inside it changes", (M) => {
    const flag = M.signal(true), dep = M.signal("a");
    let built = 0;
    const host = document.createElement("div");
    // what the compiler emits: condition tracked, body untracked
    M.mount(host, () => M.h("div", {}, () => (flag() ? M.untracked(() => { built++; return [M.h("p", {}, () => dep())]; }) : null)));
    dep.set("b");
    ok(built === 1, "built " + built);
    ok(host.textContent === "b", "still reactive inside");
    flag.set(false);
    ok(host.textContent === "", "branch removed");
  }],

  ["each: keyed rows are moved, changed items are rebuilt, duplicates warn", (M) => {
    const data = M.signal([{ id: 1, t: "a" }, { id: 2, t: "b" }, { id: 3, t: "c" }]);
    const box = document.createElement("div");
    M.mount(box, () => M.h("ul", {}, M.each(() => data(), (x) => x.id, (x) => [M.h("li", {}, x.t)])));
    const [l1, l2, l3] = box.querySelectorAll("li");
    const [a, b, c] = data();
    data.set([c, a, { id: 4, t: "d" }, { ...b, t: "B" }]);
    const lis = [...box.querySelectorAll("li")];
    ok(lis.map((x) => x.textContent).join() === "c,a,d,B", "order");
    ok(lis[0] === l3 && lis[1] === l1, "moved, not rebuilt");
    ok(lis[3] !== l2, "changed item rebuilt (not live)");
    data.set([]);
    ok(box.querySelectorAll("li").length === 0, "emptied");
    const warned = quietWarn(() => data.set([{ id: 1, t: "x" }, { id: 1, t: "y" }]));
    ok(warned >= 1, "duplicate key warning");
  }],

  ["each live: a new object with the same key updates the row in place", (M) => {
    const rows = M.signal([{ id: 1, name: "a", cpu: 1 }, { id: 2, name: "b", cpu: 2 }]);
    const box = document.createElement("div");
    M.mount(box, () => M.h("ul", {}, M.each(() => rows(), (r) => r.id, (r) => [M.h("li", {}, () => r.name + " " + r.cpu)], true)));
    const [l1, l2] = box.querySelectorAll("li");
    rows.set([{ id: 1, name: "a", cpu: 10 }, { id: 2, name: "b", cpu: 20 }]);
    const after = box.querySelectorAll("li");
    ok(after[0] === l1 && after[1] === l2, "nodes kept");
    ok(after[0].textContent === "a 10" && after[1].textContent === "b 20", "values updated");
    rows.set([{ id: 2, name: "b", cpu: 21 }]);
    ok(box.querySelectorAll("li").length === 1 && l2.textContent === "b 21", "row removed, other kept");
  }],

  ["each live: array rows work with Object.keys, spread and JSON", (M) => {
    const rows = M.signal([["x", 1], ["y", 2]]);
    let seen = null;
    const box = document.createElement("div");
    M.mount(box, () => M.h("ul", {}, M.each(() => rows(), (r) => r[0], (r) => {
      seen = r;
      return [M.h("li", {}, () => r[0] + r[1])];
    }, true)));
    const proxy = seen;
    ok(Object.keys(proxy).join() === "0,1", "Object.keys");
    ok([...proxy].join() === "y,2" || [...proxy].join() === "x,1", "spread");
    ok(JSON.stringify(proxy).startsWith("["), "JSON");
    ok(Array.isArray(proxy) && proxy.length === 2, "isArray + length");
    rows.set([["x", 9], ["y", 2]]);
    ok(box.querySelector("li").textContent === "x9", "array row updated in place");
  }],

  ["each live: plain values are rebuilt when they change", (M) => {
    const names = M.signal(["a", "b"]);
    const box = document.createElement("div");
    M.mount(box, () => M.h("ul", {}, M.each(() => names(), null, (n) => [M.h("li", {}, n)], true)));
    names.set(["a", "c"]);
    ok([...box.querySelectorAll("li")].map((l) => l.textContent).join() === "a,c", "text");
  }],
];
