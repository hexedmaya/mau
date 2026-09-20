// Compiler checks: generated code, error messages, and small components built and run in jsdom.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { compile, MauError } from "../compiler/compile.js";

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

const runtime = new URL("../index.js", import.meta.url).href;
const M = await import(runtime);
const js = (src) => compile(src, { file: "T.mau", runtime }).code;
const fails = (src, pattern) => assert.throws(() => js(src), (e) => e instanceof MauError && pattern.test(e.message));

async function build(src) {
  const code = js(src);
  return (await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"))).default;
}

test("error: a wrong closing tag points at file:line:col of that tag", () => {
  fails("<div>\n  <p>\n</div>", /^T\.mau:3:1: expected <\/p>/);
});
test("error: unclosed tag at the end of the file", () => fails("<div>\n  <p>text", /^T\.mau:2:3: unclosed <p>/));
test("error: unclosed {#if}", () => fails("<div>\n{#if x}\n<p></p>\n</div>", /unclosed \{#if\}/));
test("error: two root elements", () => fails("<a></a><b></b>", /exactly one root/));
test("error: bind: on a component", () => fails("<div><Item bind:value={x} /></div>", /bind: works on elements/));
test("error: unknown block", () => fails("<div>{#foo x}</div>", /unknown block/));
test("error: two script blocks", () => fails("<script>a</script><script>b</script><p></p>", /only one <script>/));
test("error: unclosed script", () => fails("<script>const a = 1;<p></p>", /unclosed <script>/));

test("each: key and live flag in the output", () => {
  const code = js("<ul>{#each xs() as x (x.id)}<li>{x.t}</li>{/each}</ul>");
  assert.match(code, /__each\(\(\) => \(xs\(\)\), \(x\) => \(x\.id\), \(x\) => .*, true\)/);
  assert.match(js("<ul>{#each xs() as { id } (id)}<li>{id}</li>{/each}</ul>"), /, false\)/);
});

test("svg: a and title inside svg are marked, outside and inside foreignObject they are not", () => {
  const code = js('<div><a href="#x">l</a><svg><title>t</title><a href="#y">i</a><foreignObject><a href="#z">h</a></foreignObject></svg></div>');
  assert.equal(code.match(/"svg:title"/g).length, 1);
  assert.equal(code.match(/"svg:a"/g).length, 1);
  assert.equal(code.match(/__h\("a"/g).length, 2);
});

test("style is scoped and added once", () => {
  const code = js("<p>x</p>\n<style>:scope { color: red; }</style>");
  assert.match(code, /@scope \(\.mau-[a-z0-9]{6}\)/);
  assert.match(code, /classList\.add\("mau-/);
});

test("</script> inside a string does not end the script block", async () => {
  const C = await build(`<script>
  const t = "a </script> b"; // it's fine
  const u = \`x </script> \${1 + 1}\`;
</script>
<p>{t} {u}</p>`);
  assert.equal(C().textContent, "a </script> b x </script> 2");
});

test("imports are hoisted, but text that looks like an import stays in its string or comment", () => {
  const code = js(`<script>
  import A from "./A.js";
  import { b } from "./b.js";
  import "./side.js";
  const sample = \`import { mount } from "./mau/index.js";
mount(el, App);\`;
  const one = "import x from 'y'";
  // import z from "z";
  /* import w from "w"; */
</script>
<p>{sample}</p>`);
  const head = code.split("export default")[0];
  assert.match(head, /import A from "\.\/A\.js";/);
  assert.match(head, /import \{ b \} from "\.\/b\.js";/);
  assert.match(head, /import "\.\/side\.js";/);
  assert.doesNotMatch(head, /"\.\/mau\/index\.js"/);
  assert.doesNotMatch(head, /import x from/);
  const body = code.split("export default")[1];
  assert.match(body, /const sample = `import \{ mount \} from "\.\/mau\/index\.js";\nmount\(el, App\);`;/);
  assert.match(body, /\/\/ import z from "z";/);
});

test("the script is copied as written: multi-line strings keep their exact indentation", async () => {
  const C = await build(`<script>
  const code = \`<script>
  const n = signal(0);
</script>
    deeper\`;
</script>
<pre>{code}</pre>`);
  assert.equal(C().textContent, "<script>\n  const n = signal(0);\n</script>\n    deeper");
});

test("literal braces with \\{ and \\}, in text and in attributes", async () => {
  const C = await build('<p title="a \\{b\\}">\\{ text \\}</p>');
  const p = C();
  assert.equal(p.textContent, "{ text }");
  assert.equal(p.getAttribute("title"), "a {b}");
});

test("whitespace is kept inside <pre> and collapsed elsewhere", async () => {
  const C = await build("<div><pre>  keep   this\n  and this</pre><p>a     b</p></div>");
  const d = C();
  assert.equal(d.querySelector("pre").textContent, "  keep   this\n  and this");
  assert.equal(d.querySelector("p").textContent, "a b");
});

test("component: bindings, if / else if / else, and a keyed list in a compiled file", async () => {
  const C = await build(`<script>
  const n = signal(0);
  const name = signal("x");
  const items = computed(() => Array.from({ length: n() }, (_, i) => ({ id: i, label: "row " + i })));
  const inc = () => n.set(n() + 1);
</script>
<div>
  <button on:click={inc}>+</button>
  <input bind:value={name}>
  <p class="v">{name()}</p>
  {#if n() > 1}<i>many</i>{:else if n() > 0}<i>one</i>{:else}<i>none</i>{/if}
  <ul>{#each items() as it (it.id)}<li>{it.label}</li>{/each}</ul>
</div>`);
  const root = C();
  const $ = (s) => root.querySelector(s);
  assert.equal($("i").textContent, "none");
  $("button").click();
  assert.equal($("i").textContent, "one");
  $("button").click();
  assert.equal($("i").textContent, "many");
  assert.equal(root.querySelectorAll("li").length, 2);
  $("input").value = "hi";
  $("input").dispatchEvent(new dom.window.Event("input"));
  assert.equal($(".v").textContent, "hi");
});

test("props: an expression prop is a getter in the output, static values stay plain", () => {
  const code = js('<div><Child name={x()} title="fixed" label="a {y()}" onpick={go} /></div>');
  assert.match(code, /get "name"\(\) \{ return \(x\(\)\); \}/);
  assert.match(code, /"title": "fixed"/);
  assert.match(code, /get "label"\(\) \{ return `a \$\{y\(\)\}`; \}/);
  assert.match(code, /"onpick": \(go\)/);
});

test("props: a live expression follows the parent, destructuring is a snapshot", async () => {
  const P = await build(`<script>
  const x = signal("a");
  props.hook(x);
  const Child = (p) => {
    const { name } = p;                 // read once
    const el = document.createElement("b");
    effect(() => { el.textContent = p.name + "/" + p.label + "/" + name; });
    return el;
  };
</script>
<div><Child name={x()} label="l-{x()}" /></div>`);
  let x;
  const root = P({ hook: (s) => { x = s; } });
  assert.equal(root.textContent, "a/l-a/a");
  x.set("b");
  assert.equal(root.textContent, "b/l-b/a");
});

test("props: a keyed row keeps its component and the component sees new values", async () => {
  const P = await build(`<script>
  const Row = (p) => {
    const el = document.createElement("i");
    effect(() => { el.textContent = p.name + ":" + p.ping; });
    return el;
  };
</script>
<ul>{#each props.rows() as r (r.uuid)}<Row name={r.name} ping={r.ping} />{/each}</ul>`);
  const rows = M.signal([{ uuid: "u1", name: "steve", ping: 10 }, { uuid: "u2", name: "alex", ping: 20 }]);
  const ul = P({ rows });
  const [i1, i2] = ul.querySelectorAll("i");
  rows.set([{ uuid: "u1", name: "steve", ping: 11 }, { uuid: "u2", name: "alex", ping: 22 }]);
  const after = ul.querySelectorAll("i");
  assert.ok(after[0] === i1 && after[1] === i2, "same elements");
  assert.equal(after[0].textContent, "steve:11");
  assert.equal(after[1].textContent, "alex:22");
});

test("component: children arrive as props.children", async () => {
  const Card = await build('<div class="card">{props.children}</div>');
  const card = Card({ children: [M.h("p", {}, "hello"), M.h("p", {}, "world")] });
  assert.equal(card.querySelectorAll("p").length, 2);
  assert.equal(card.textContent, "helloworld");
});

test("component: polling data updates rows without rebuilding them", async () => {
  const C = await build(`<script>
  const rows = props.rows;
</script>
<ul>{#each rows() as r (r.id)}<li>{r.name} {r.cpu}</li>{/each}</ul>`);
  const rows = M.signal([{ id: 1, name: "a", cpu: 1 }, { id: 2, name: "b", cpu: 2 }]);
  const ul = M.component(C, { rows }).node;
  const [l1, l2] = ul.querySelectorAll("li");
  rows.set([{ id: 1, name: "a", cpu: 10 }, { id: 2, name: "b", cpu: 20 }]);
  const after = ul.querySelectorAll("li");
  assert.ok(after[0] === l1 && after[1] === l2);
  assert.equal(after[0].textContent, "a 10");
  assert.equal(after[1].textContent, "b 20");
});

test("generated files carry the mau attribution notice (license section 14)", () => {
  const code = js("<p>x</p>");
  const lines = code.split("\n");
  assert.match(lines[0], /^\/\/ Generated by mau from T\.mau/);
  assert.match(lines[1], /mau License 1\.0/);
});

test("bind:value on a number input gives a number, and null while it is empty", async () => {
  const C = await build(`<script>
  const n = signal(5);
  props.hook(n);
</script>
<div><input type="number" bind:value={n}><p>{typeof n()}</p></div>`);
  let n;
  const root = C({ hook: (s) => { n = s; } });
  const input = root.querySelector("input");
  assert.equal(input.value, "5");
  input.value = "42";
  input.dispatchEvent(new dom.window.Event("input"));
  assert.strictEqual(n(), 42);
  assert.equal(root.querySelector("p").textContent, "number");
  input.value = "";
  input.dispatchEvent(new dom.window.Event("input"));
  assert.strictEqual(n(), null);
  n.set(7);
  assert.equal(input.value, "7");
});

test("bind:value on a select: the value is set once the options exist, and follows both ways", async () => {
  const C = await build(`<script>
  const c = signal("b");
  const more = ["x", "y"];
  props.hook(c);
</script>
<div>
  <select class="fixed" bind:value={c}><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>
  <select class="listed" bind:value={c}>{#each more as o}<option value={o}>{o}</option>{/each}<option value="b">B</option></select>
</div>`);
  let c;
  const root = C({ hook: (s) => { c = s; } });
  const fixed = root.querySelector(".fixed");
  assert.equal(fixed.value, "b", "initial value with static options");
  assert.equal(root.querySelector(".listed").value, "b", "initial value with options from a list");
  fixed.value = "c";
  fixed.dispatchEvent(new dom.window.Event("change"));
  assert.equal(c(), "c");
  c.set("a");
  assert.equal(fixed.value, "a");
});

test("bind:group on radio buttons: the signal holds the value of the selected one", async () => {
  const C = await build(`<script>
  const size = signal("m");
  props.hook(size);
</script>
<div>
  <input type="radio" value="s" bind:group={size}>
  <input type="radio" value="m" bind:group={size}>
  <input type="radio" value="l" bind:group={size}>
</div>`);
  let size;
  const root = C({ hook: (s) => { size = s; } });
  document.body.append(root); // a click only fires change on an element that is in the page
  const radios = [...root.querySelectorAll("input")];
  assert.deepEqual(radios.map((r) => r.checked), [false, true, false]);
  radios[2].click();
  assert.equal(size(), "l");
  assert.deepEqual(radios.map((r) => r.checked), [false, false, true]);
  size.set("s");
  assert.deepEqual(radios.map((r) => r.checked), [true, false, false]);
});

test("bind:group: errors for a missing value and for anything but radio buttons", () => {
  fails('<div><input type="radio" bind:group={g}></div>', /needs a value attribute/);
  fails('<div><input type="checkbox" value="x" bind:group={g}></div>', /bind:group works on/);
  fails("<div><Item bind:group={g} /></div>", /bind: works on elements/);
});
