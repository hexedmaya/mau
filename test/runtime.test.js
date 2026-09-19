// Runs the shared runtime cases in Node with jsdom. Usage: npm install, then npm test
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  location: dom.window.location,
  addEventListener: (...a) => dom.window.addEventListener(...a),
  CSSStyleSheet: class { replaceSync() {} },
});
document.adoptedStyleSheets = [];

const M = await import("../index.js");
const { default: cases } = await import("./runtime-cases.js");

for (const [name, fn] of cases) test(name, () => fn(M));
