#!/usr/bin/env node
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
// usage: node mau/compiler/cli.js [project] [--watch] [--runtime <path to the runtime index.js>]
//
// A mau project has a src/ folder. src/ is what people write, dist/ is what the browser loads:
//   - every .mau file in src/ is compiled to a .js file at the same place in dist/
//   - every other file in src/ (js, css, images, json, ...) is copied as it is
// dist/ is generated. Whatever is in there is overwritten or removed, so nothing else should live there.
// Commit dist/ so the people who use the project need no build step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, MauError } from "./compile.js";

const runtimeEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js");
const MARKER = ".mau-dist";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const ri = args.indexOf("--runtime");
const runtimeOpt = ri >= 0 ? args.splice(ri, 2)[1] : null;
const positional = args.filter((a) => !a.startsWith("--"));
if (positional.length > 1 || args.some((a) => a.startsWith("--") && a !== "--watch")) {
  console.error("usage: mau [project] [--watch] [--runtime <path>]");
  process.exit(2);
}

const project = path.resolve(positional[0] ?? ".");
const srcDir = path.join(project, "src");
const distDir = path.join(project, "dist");
const shown = (p) => path.relative(process.cwd(), p) || ".";

if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
  console.error(`no src/ folder in ${shown(project)}. A mau project keeps what people write in src/.`);
  process.exit(2);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const posix = (p) => p.split(path.sep).join("/");

function importPathFor(outFile) {
  const dir = path.dirname(outFile);
  const rel = (to) => {
    const r = posix(path.relative(dir, to));
    return r.startsWith(".") ? r : "./" + r;
  };
  // --runtime ./x/index.js is a file path (from where you run this): the import path is worked out per file.
  // Anything else (/x/index.js, https://...) is written as it is.
  if (!runtimeOpt) return rel(runtimeEntry);
  return runtimeOpt.startsWith(".") ? rel(path.resolve(runtimeOpt)) : runtimeOpt;
}

function writeIfChanged(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), Buffer.from(data)) === 0) return false;
  fs.writeFileSync(file, data);
  return true;
}

function prune(keep) {
  let removed = 0;
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        visit(p);
        if (!fs.readdirSync(p).length) fs.rmdirSync(p);
      } else if (e.name !== MARKER && !keep.has(p)) {
        fs.unlinkSync(p);
        console.log(`removed ${shown(p)}`);
        removed++;
      }
    }
  };
  if (fs.existsSync(distDir)) visit(distDir);
  return removed;
}

// One full build. Returns 0 when everything worked, 1 when a .mau file had an error, 2 when it refused to start.
function build() {
  if (fs.existsSync(distDir) && fs.readdirSync(distDir).length && !fs.existsSync(path.join(distDir, MARKER))) {
    console.error(`${shown(distDir)} already has files that mau did not write. mau owns dist/ and would overwrite or remove them.\nMove them away or delete the folder, then run again.`);
    return 2;
  }

  const keep = new Set();
  const outputs = new Map(); // dist path -> the src file that makes it
  let status = 0, compiled = 0, copied = 0;

  for (const file of walk(srcDir)) {
    const rel = path.relative(srcDir, file);
    const isMau = file.endsWith(".mau");
    const out = path.join(distDir, isMau ? rel.replace(/\.mau$/, ".js") : rel);
    if (outputs.has(out)) {
      console.error(`${shown(outputs.get(out))} and ${shown(file)} would both become ${shown(out)}`);
      status = 1;
      continue;
    }
    outputs.set(out, file);
    keep.add(out); // also when compiling fails, so the last good file is not removed

    if (!isMau) {
      if (writeIfChanged(out, fs.readFileSync(file))) copied++;
      continue;
    }
    try {
      const { code } = compile(fs.readFileSync(file, "utf8"), { file: shown(file), runtime: importPathFor(out) });
      if (writeIfChanged(out, code)) {
        compiled++;
        console.log(`${shown(file)} -> ${shown(out)}`);
      }
    } catch (e) {
      if (!(e instanceof MauError)) throw e;
      console.error(e.message);
      status = 1;
    }
  }

  fs.mkdirSync(distDir, { recursive: true });
  writeIfChanged(path.join(distDir, MARKER), "generated by mau from src/. Files in this folder are overwritten or removed. Do not edit.\n");
  const removed = prune(keep);
  console.log(`${compiled} compiled, ${copied} copied, ${removed} removed${status ? ", with errors" : ""}`);
  return status;
}

const first = build();
if (!watch) process.exit(first);

console.log(`watching ${shown(srcDir)} ...`);
let timer = null;
fs.watch(srcDir, { recursive: true }, (_, name) => {
  if (name && name.split(/[\\/]/).some((part) => part.startsWith("."))) return;
  clearTimeout(timer);
  timer = setTimeout(build, 80);
});
