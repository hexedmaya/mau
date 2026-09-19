// Command line: output files, and how the runtime import path is worked out for every file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "compiler", "cli.js");
const runtimeEntry = path.join(here, "..", "index.js");

// a small project: src/A.mau and src/deep/B.mau
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mau-cli-"));
  fs.mkdirSync(path.join(dir, "src", "deep"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "A.mau"), "<p>a</p>");
  fs.writeFileSync(path.join(dir, "src", "deep", "B.mau"), "<p>b</p>");
  return dir;
}

const run = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
const importPath = (file) => fs.readFileSync(file, "utf8").match(/ from "([^"]+)";/)[1];
const posixRel = (from, to) => {
  const r = path.relative(from, to).split(path.sep).join("/");
  return r.startsWith(".") ? r : "./" + r;
};

test("every .mau file gets a .js file next to it", () => {
  const dir = project();
  const r = run(dir, "src");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, "src", "A.js")));
  assert.ok(fs.existsSync(path.join(dir, "src", "deep", "B.js")));
});

test("default runtime path points at the mau folder this compiler lives in", () => {
  const dir = project();
  run(dir, "src");
  assert.equal(importPath(path.join(dir, "src", "A.js")), posixRel(path.join(dir, "src"), runtimeEntry));
  assert.equal(importPath(path.join(dir, "src", "deep", "B.js")), posixRel(path.join(dir, "src", "deep"), runtimeEntry));
});

test("--runtime ./file: the import path is worked out per file", () => {
  const dir = project();
  const r = run(dir, "src", "--runtime", "./vendor/mau/index.js");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(importPath(path.join(dir, "src", "A.js")), "../vendor/mau/index.js");
  assert.equal(importPath(path.join(dir, "src", "deep", "B.js")), "../../vendor/mau/index.js");
});

test("--runtime with a root path or a url is written as it is", () => {
  const dir = project();
  run(dir, "src", "--runtime", "/vendor/mau/index.js");
  assert.equal(importPath(path.join(dir, "src", "A.js")), "/vendor/mau/index.js");
  assert.equal(importPath(path.join(dir, "src", "deep", "B.js")), "/vendor/mau/index.js");
  run(dir, "src", "--runtime", "https://cdn.example/mau/index.js");
  assert.equal(importPath(path.join(dir, "src", "A.js")), "https://cdn.example/mau/index.js");
});

test("one broken file: message with file:line:col, exit code 1, the others are still built", () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, "src", "Bad.mau"), "<div>\n  <p>\n</div>");
  const r = run(dir, "src");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Bad\.mau:3:1: expected <\/p>/);
  assert.ok(fs.existsSync(path.join(dir, "src", "A.js")));
  assert.ok(!fs.existsSync(path.join(dir, "src", "Bad.js")));
});

test("single files work, and node_modules is skipped", () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, "src", "node_modules"));
  fs.writeFileSync(path.join(dir, "src", "node_modules", "X.mau"), "<p>x</p>");
  run(dir, path.join("src", "A.mau"));
  assert.ok(fs.existsSync(path.join(dir, "src", "A.js")));
  assert.ok(!fs.existsSync(path.join(dir, "src", "deep", "B.js")));
  run(dir, "src");
  assert.ok(!fs.existsSync(path.join(dir, "src", "node_modules", "X.js")));
});

test("no arguments: usage message and exit code 2", () => {
  const r = run(os.tmpdir());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});
