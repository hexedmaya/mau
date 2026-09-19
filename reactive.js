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
// mau reactive core: signal, computed, effect. No dependencies.

let active = null;
let owner = null; // list that collects the disposers of everything created right now

export const getOwner = () => owner;
export const setOwner = (next) => { const prev = owner; owner = next; return prev; };

let runDepth = 0;       // effects running inside effects, guards against endless recursion
let depth = 0;          // > 0 while inside batch() or a flush
let nextId = 0;
let flushId = 0;
const LOOP = "mau: effects keep triggering each other (does an effect write a signal it also reads?)";

// Scheduler. A write queues its subscribers and flushes at once; batch() holds the flush back until
// several writes are done. The queue always hands out the OLDEST effect first. A computed value is created
// before whatever reads it, so it runs first, and an effect that reads several derived values runs once,
// after all of them are new: it never sees one old and one new value (no glitches).
const heap = []; // min-heap by effect id; run.q marks "already queued"

function push(run) {
  if (run.q) return;
  run.q = true;
  heap.push(run);
  for (let i = heap.length - 1; i > 0;) {
    const p = (i - 1) >> 1;
    if (heap[p].id <= heap[i].id) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function pop() {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    for (let i = 0;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l].id < heap[m].id) m = l;
      if (r < heap.length && heap[r].id < heap[m].id) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  top.q = false;
  return top;
}

function flush() {
  depth++;
  const id = ++flushId;
  try {
    while (heap.length) {
      const run = pop();
      // one effect running over and over inside a single flush is a loop
      if (run.flush !== id) { run.flush = id; run.count = 0; }
      if (++run.count > 100) {
        for (const r of heap) r.q = false;
        heap.length = 0;
        throw new Error(LOOP);
      }
      run();
    }
  } finally { depth--; }
}

// Several writes, one round of updates.
export function batch(fn) {
  depth++;
  try { return fn(); } finally { if (--depth === 0) flush(); }
}

export function signal(value) {
  const subs = new Set();
  const read = () => {
    if (active) { subs.add(active); active.deps.add(subs); }
    return value;
  };
  read.peek = () => value;
  read.set = (next) => {
    if (typeof next === "function") next = next(value);
    if (Object.is(next, value)) return;
    value = next;
    for (const run of subs) push(run);
    if (!depth) flush();
  };
  return read;
}

// An effect belongs to whoever created it (a component or a parent effect) and dies with it.
// Effects created while it runs are disposed before every re-run.
export function effect(fn) {
  let cleanup = null;
  const kids = [];
  const run = () => {
    if (run.dead) return;
    if (runDepth >= 200) throw new Error(LOOP);
    stop();
    const prevActive = active, prevOwner = owner;
    active = run;
    owner = kids;
    runDepth++;
    try { cleanup = fn(); } finally { runDepth--; active = prevActive; owner = prevOwner; }
  };
  const stop = () => {
    for (const subs of run.deps) subs.delete(run);
    run.deps.clear();
    for (const d of kids.splice(0)) d();
    if (typeof cleanup === "function") cleanup();
    cleanup = null;
  };
  run.deps = new Set();
  run.dead = false;
  run.id = nextId++;
  run.q = false;
  const dispose = () => { run.dead = true; stop(); };
  if (owner) owner.push(dispose);
  run();
  return dispose;
}

export function computed(fn) {
  const out = signal(undefined);
  effect(() => out.set(fn()));
  const read = () => out();
  read.peek = out.peek;
  return read;
}

export function untracked(fn) {
  const prev = active;
  active = null;
  try { return fn(); } finally { active = prev; }
}
