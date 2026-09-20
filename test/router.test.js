// The history router in Node with jsdom: paths, params, links, back button and a base path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost/docs/router?tab=1" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  location: dom.window.location,
  history: dom.window.history,
  addEventListener: (...a) => dom.window.addEventListener(...a),
  CSSStyleSheet: class { replaceSync() {} },
});
document.adoptedStyleSheets = [];

const M = await import("../index.js");
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// jsdom cannot load pages. Whatever the router leaves alone must not try to navigate.
document.addEventListener("click", (e) => e.preventDefault());

function link(attrs, text = "x") {
  const a = document.createElement("a");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = text;
  document.body.append(a);
  return a;
}
function click(el, init = {}) {
  const ev = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(ev);
  return ev;
}

test("route() starts from the real address: path and query", () => {
  assert.deepEqual(M.route(), { path: "/docs/router", query: { tab: "1" } });
});

test("navigate() changes the address without a page load", () => {
  const before = history.length;
  M.navigate("/try?x=2");
  assert.equal(location.pathname, "/try");
  assert.equal(location.search, "?x=2");
  assert.equal(history.length, before + 1);
  assert.deepEqual(M.route(), { path: "/try", query: { x: "2" } });
});

test("navigate(..., { replace }) does not add a history entry", () => {
  const before = history.length;
  M.navigate("/about", { replace: true });
  assert.equal(history.length, before);
  assert.equal(M.route().path, "/about");
});

test("a trailing slash is the same route", () => {
  M.navigate("/docs/");
  assert.equal(M.route().path, "/docs");
});

test("router(): params, query, wildcard and first match wins", () => {
  const seen = [];
  const view = M.router({
    "/": (p) => (seen.push(["home", p]), "home"),
    "/docs/:page": (p) => (seen.push(["docs", p]), "docs"),
    "/inst/:id": (p) => (seen.push(["inst", p]), "inst"),
    "*": (p) => (seen.push(["404", p]), "nf"),
  });
  M.navigate("/inst/steve%20x?tab=log");
  assert.equal(view(), "inst");
  assert.deepEqual(seen.at(-1)[1], { params: { id: "steve x" }, query: { tab: "log" } });
  M.navigate("/docs/router");
  assert.equal(view(), "docs");
  M.navigate("/nothing/here");
  assert.equal(view(), "nf");
  M.navigate("/");
  assert.equal(view(), "home");
});

test("router(): a broken % sequence does not throw", () => {
  const view = M.router({ "/x/:v": (p) => p.params.v });
  M.navigate("/x/%E0%A4%A");
  assert.equal(view(), "%E0%A4%A");
});

test("a click on a normal link to the same site navigates without a page load", () => {
  const a = link({ href: "/docs/start" });
  const ev = click(a);
  assert.equal(ev.defaultPrevented, true, "the router took the click");
  assert.equal(location.pathname, "/docs/start");
  assert.equal(M.route().path, "/docs/start");
});

test("a click on a link inside another element still works", () => {
  const a = link({ href: "/brand" });
  a.innerHTML = "<b><i>deep</i></b>";
  click(a.querySelector("i"));
  assert.equal(location.pathname, "/brand");
});

test("links the router must leave alone", () => {
  M.navigate("/start");
  const cases = [
    ["another site", link({ href: "https://example.com/x" }), {}],
    ["target=_blank", link({ href: "/docs", target: "_blank" }), {}],
    ["download", link({ href: "/brand/logo.svg", download: "" }), {}],
    ["ctrl+click", link({ href: "/docs" }), { ctrlKey: true }],
    ["shift+click", link({ href: "/docs" }), { shiftKey: true }],
    ["middle button", link({ href: "/docs" }), { button: 1 }],
    ["#anchor on this page", link({ href: "/start#step-2" }), {}],
  ];
  for (const [name, a, init] of cases) {
    const before = location.pathname;
    click(a, init);
    assert.equal(location.pathname, before, `${name}: the address must not change`);
  }
});

test("a repeated query key gives an array, a single one stays a string", () => {
  M.navigate("/find?tag=a&tag=b&tag=c&page=2&__proto__=x");
  const q = M.route().query;
  assert.deepEqual(q.tag, ["a", "b", "c"]);
  assert.equal(q.page, "2");
  assert.equal(Object.getPrototypeOf(q), Object.prototype, "a key named __proto__ is only a key");
});

test("a link with data-native or rel=external is left to the browser", () => {
  M.navigate("/start");
  const before = location.pathname;
  assert.equal(click(link({ href: "/export.csv", "data-native": "" })).defaultPrevented, true, "the test page prevents every click");
  assert.equal(location.pathname, before, "the router did not navigate");
  click(link({ href: "/manual.pdf", rel: "external" }));
  assert.equal(location.pathname, before);
  click(link({ href: "/somewhere" }));
  assert.equal(location.pathname, "/somewhere", "a plain link still navigates");
});

test("the back button updates the route", async () => {
  M.navigate("/about");
  M.navigate("/try");
  // wait for the popstate event itself, not for a time
  const popped = new Promise((r) => dom.window.addEventListener("popstate", r, { once: true }));
  history.back();
  await popped;
  assert.equal(M.route().path, "/about");
});

test("base: a site below a path keeps its prefix in the address, not in the routes", () => {
  const view = M.router({ "/": () => "home", "/docs": () => "docs", "*": () => "nf" }, { base: "/app" });
  M.navigate("/docs");
  assert.equal(location.pathname, "/app/docs");
  assert.equal(M.route().path, "/docs");
  assert.equal(view(), "docs");
  const a = link({ href: "/app/" });
  click(a);
  assert.equal(location.pathname, "/app/");
  assert.equal(M.route().path, "/");
  const outside = link({ href: "/elsewhere" });
  click(outside);
  assert.equal(location.pathname, "/app/", "a link outside the base is not taken over");
});

test("a link to another page keeps its #anchor, a link to an anchor on this page is left to the browser", () => {
  M.router({}, { base: "/" }); // the test before set a base
  M.navigate("/start", { replace: true });
  const a = link({ href: "/docs/router#server-setup" });
  const ev = click(a);
  assert.equal(ev.defaultPrevented, true, "taken over, the page changes");
  assert.equal(location.pathname, "/docs/router");
  assert.equal(location.hash, "#server-setup");
  assert.equal(M.route().path, "/docs/router");
  const same = link({ href: "/docs/router#other" });
  click(same);
  assert.equal(location.hash, "#server-setup", "left alone: the router did not touch the address");
});
