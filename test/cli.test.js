// Command line: src/ becomes dist/ (a mirrored tree), other files are copied, the runtime import path is worked out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "compiler", "cli.js");
const runtimeEntry = path.join(here, "..", "index.js");

// a small project: src/A.mau, src/deep/B.mau, src/lib/util.js, src/style.css
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mau-cli-"));
  const put = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  put("src/A.mau", "<p>a</p>");
  put("src/deep/B.mau", "<p>b</p>");
  put("src/lib/util.js", "export const x = 1;\n");
  put("src/style.css", "body { margin: 0; }\n");
  return { dir, put, has: (rel) => fs.existsSync(path.join(dir, rel)), read: (rel) => fs.readFileSync(path.join(dir, rel), "utf8") };
}

const run = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
const importPath = (file) => fs.readFileSync(file, "utf8").match(/ from "([^"]+)";/)[1];
const posixRel = (from, to) => {
  const r = path.relative(from, to).split(path.sep).join("/");
  return r.startsWith(".") ? r : "./" + r;
};

test("src/ is mirrored into dist/: .mau is compiled, everything else is copied", () => {
  const p = project();
  const r = run(p.dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(p.has("dist/A.js") && p.has("dist/deep/B.js"), "compiled");
  assert.equal(p.read("dist/lib/util.js"), "export const x = 1;\n", "plain js copied");
  assert.equal(p.read("dist/style.css"), "body { margin: 0; }\n", "css copied");
  assert.ok(!p.has("dist/A.mau"), "no .mau in dist");
  assert.match(r.stdout, /2 compiled, 2 copied, 0 removed/);
});

test("src/ is never written to", () => {
  const p = project();
  run(p.dir);
  assert.ok(!p.has("src/A.js") && !p.has("src/deep/B.js"), "no generated file next to the source");
});

test("the project can be given as an argument", () => {
  const p = project();
  const r = run(os.tmpdir(), p.dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(p.has("dist/A.js"));
});

test("a second run changes nothing", () => {
  const p = project();
  run(p.dir);
  const r = run(p.dir);
  assert.match(r.stdout, /0 compiled, 0 copied, 0 removed/);
});

test("default runtime path points at the mau folder this compiler lives in, measured from dist/", () => {
  const p = project();
  run(p.dir);
  assert.equal(importPath(path.join(p.dir, "dist", "A.js")), posixRel(path.join(p.dir, "dist"), runtimeEntry));
  assert.equal(importPath(path.join(p.dir, "dist", "deep", "B.js")), posixRel(path.join(p.dir, "dist", "deep"), runtimeEntry));
});

test("--runtime without a path is a usage error, not a silent default", () => {
  const p = project();
  for (const args of [["--runtime"], ["--runtime", "--watch"]]) {
    const r = run(p.dir, ...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /--runtime needs a path/);
  }
  assert.ok(!fs.existsSync(path.join(p.dir, "dist")), "nothing was built");
});

test("--runtime ./file: the import path is worked out per file", () => {
  const p = project();
  const r = run(p.dir, "--runtime", "./vendor/mau/index.js");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(importPath(path.join(p.dir, "dist", "A.js")), "../vendor/mau/index.js");
  assert.equal(importPath(path.join(p.dir, "dist", "deep", "B.js")), "../../vendor/mau/index.js");
});

test("--runtime with a root path or a url is written as it is", () => {
  const p = project();
  run(p.dir, "--runtime", "/vendor/mau/index.js");
  assert.equal(importPath(path.join(p.dir, "dist", "A.js")), "/vendor/mau/index.js");
  run(p.dir, "--runtime", "https://cdn.example/mau/index.js");
  assert.equal(importPath(path.join(p.dir, "dist", "deep", "B.js")), "https://cdn.example/mau/index.js");
});

test("relative imports out of src/ work from dist/ too, because both sit next to each other", () => {
  const p = project();
  p.put("src/main.js", 'import { mount } from "../mau/index.js";\n');
  run(p.dir);
  assert.equal(p.read("dist/main.js"), 'import { mount } from "../mau/index.js";\n');
});

test("one broken file: message with file:line:col, exit code 1, the others are still built", () => {
  const p = project();
  p.put("src/Bad.mau", "<div>\n  <p>\n</div>");
  const r = run(p.dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Bad\.mau:3:1: expected <\/p>/);
  assert.ok(p.has("dist/A.js"));
  assert.ok(!p.has("dist/Bad.js"));
  assert.match(r.stdout, /with errors/);
});

test("a broken file does not remove the last good output", () => {
  const p = project();
  run(p.dir);
  p.put("src/A.mau", "<div>\n  <p>\n</div>");
  const r = run(p.dir);
  assert.equal(r.status, 1);
  assert.ok(p.has("dist/A.js"), "the old A.js is still there");
});

test("files removed from src/ are removed from dist/, empty folders too", () => {
  const p = project();
  run(p.dir);
  fs.rmSync(path.join(p.dir, "src", "deep"), { recursive: true });
  fs.rmSync(path.join(p.dir, "src", "style.css"));
  const r = run(p.dir);
  assert.ok(!p.has("dist/deep") && !p.has("dist/style.css"));
  assert.ok(p.has("dist/A.js"));
  assert.match(r.stdout, /removed .*B\.js/);
});

test("dist/ with files mau did not write is left alone", () => {
  const p = project();
  p.put("dist/mine.txt", "keep me");
  const r = run(p.dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /mau did not write/);
  assert.equal(p.read("dist/mine.txt"), "keep me");
  assert.ok(!p.has("dist/A.js"));
});

test("Foo.mau and Foo.js in src/ would collide: error", () => {
  const p = project();
  p.put("src/Foo.mau", "<p>x</p>");
  p.put("src/Foo.js", "export {};\n");
  const r = run(p.dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /would both become/);
});

test("dot files and node_modules in src/ are skipped", () => {
  const p = project();
  p.put("src/.hidden.js", "x");
  p.put("src/node_modules/x/index.js", "x");
  run(p.dir);
  assert.ok(!p.has("dist/.hidden.js") && !p.has("dist/node_modules"));
});

test("no src/ folder: message and exit code 2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mau-cli-"));
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no src\/ folder/);
});

test("too many arguments or an unknown option: usage and exit code 2", () => {
  const p = project();
  assert.equal(run(p.dir, "a", "b").status, 2);
  assert.match(run(p.dir, "--nope").stderr, /usage/);
});

async function waitFor(fn, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if (fn()) return; } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("timed out waiting for the build");
}

test("--watch builds at once and rebuilds on a change, a new file, a copied file and a removed file", async () => {
  const p = project();
  const child = spawn(process.execPath, [cli, "--watch"], { cwd: p.dir });
  try {
    await waitFor(() => p.has("dist/A.js"));
    p.put("src/A.mau", "<p>changed</p>");
    await waitFor(() => p.read("dist/A.js").includes("changed"));
    p.put("src/New.mau", "<p>new</p>");
    await waitFor(() => p.has("dist/New.js"));
    p.put("src/lib/util.js", "export const x = 2;" + String.fromCharCode(10));
    await waitFor(() => p.read("dist/lib/util.js").includes("2"));
    fs.rmSync(path.join(p.dir, "src", "New.mau"));
    await waitFor(() => !p.has("dist/New.js"));
    p.put("src/A.mau", ["<div>", "  <p>", "</div>"].join(String.fromCharCode(10)));
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(p.read("dist/A.js").includes("changed"), "a broken file keeps its last good output while watching");
  } finally {
    child.kill();
  }
});
