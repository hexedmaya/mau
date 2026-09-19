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
// usage: node compiler/cli.js <file.mau | dir>... [--watch] [--runtime <path to the runtime index.js>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, MauError } from "./compile.js";

const runtimeEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js");

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const ri = args.indexOf("--runtime");
const runtimeOpt = ri >= 0 ? args.splice(ri, 2)[1] : null;
const targets = args.filter((a) => !a.startsWith("--"));
if (!targets.length) {
  console.error("usage: mau <file.mau | dir>... [--watch] [--runtime <path>]");
  process.exit(2);
}

function collect(p, out = []) {
  if (fs.statSync(p).isDirectory()) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) collect(path.join(p, e.name), out);
    }
  } else if (p.endsWith(".mau")) out.push(p);
  return out;
}

function build(file) {
  try {
    // --runtime ./x/index.js is a file path (from where you run this): the import path is worked out per file.
    // Anything else (/x/index.js, https://...) is written as it is.
    const dir = path.dirname(path.resolve(file));
    const rel = (to) => { const r = path.relative(dir, to).split(path.sep).join("/"); return r.startsWith(".") ? r : "./" + r; };
    const runtime = !runtimeOpt ? rel(runtimeEntry) : runtimeOpt.startsWith(".") ? rel(path.resolve(runtimeOpt)) : runtimeOpt;
    const { code } = compile(fs.readFileSync(file, "utf8"), { file: path.relative(process.cwd(), file), runtime });
    const outFile = file.replace(/\.mau$/, ".js");
    fs.writeFileSync(outFile, code);
    console.log(`${path.relative(process.cwd(), file)} -> ${path.basename(outFile)}`);
    return true;
  } catch (e) {
    if (!(e instanceof MauError)) throw e;
    console.error(e.message);
    return false;
  }
}

let ok = true;
for (const t of targets) for (const f of collect(t)) ok = build(f) && ok;
if (!watch) process.exit(ok ? 0 : 1);

console.log("watching...");
const timers = new Map();
for (const t of targets) {
  fs.watch(t, { recursive: true }, (_, name) => {
    if (!name?.endsWith(".mau")) return;
    const file = path.join(t, name);
    clearTimeout(timers.get(file));
    timers.set(file, setTimeout(() => fs.existsSync(file) && build(file), 50));
  });
}
