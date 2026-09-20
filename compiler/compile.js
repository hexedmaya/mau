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
// mau compiler: .mau source -> JS module that builds the DOM directly.
// Syntax: see SYNTAX.md

export class MauError extends Error {
  constructor(msg, file, src, pos) {
    const before = src.slice(0, pos);
    const line = before.split("\n").length;
    const col = pos - before.lastIndexOf("\n");
    super(`${file}:${line}:${col}: ${msg}`);
    this.line = line;
    this.col = col;
  }
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const NAME = /[A-Za-z][\w:.-]*/y;
const ATTR = /[^\s=\/>{}"']+/y;
const q = JSON.stringify;

// Index of the `}` that closes a `{` whose content starts at `start`. Skips strings and template literals.
function scanExpr(src, start, fail) {
  let depth = 0;
  const skipStr = (p, quote) => {
    for (p++; p < src.length; p++) {
      if (src[p] === "\\") p++;
      else if (src[p] === quote) return p;
    }
    return fail("unclosed string", p);
  };
  const skipTpl = (p) => {
    for (p++; p < src.length; p++) {
      if (src[p] === "\\") p++;
      else if (src[p] === "`") return p;
      else if (src[p] === "$" && src[p + 1] === "{") p = scanExpr(src, p + 2, fail);
    }
    return fail("unclosed template literal", p);
  };
  for (let p = start; p < src.length; p++) {
    const c = src[p];
    if (c === '"' || c === "'") p = skipStr(p, c);
    else if (c === "`") p = skipTpl(p);
    else if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) return p;
      depth--;
    }
  }
  return fail("missing closing }", start - 1);
}

// If a string, template literal or comment starts at `p`, the index of its last character. Otherwise -1.
function skipLiteral(src, p) {
  const c = src[p];
  if (c === '"' || c === "'") {
    for (p++; p < src.length && src[p] !== c && src[p] !== "\n"; p++) if (src[p] === "\\") p++;
    return p;
  }
  if (c === "`") {
    for (p++; p < src.length && src[p] !== "`"; p++) {
      if (src[p] === "\\") p++;
      else if (src[p] === "$" && src[p + 1] === "{") p = scanExpr(src, p + 2, () => src.length);
    }
    return p;
  }
  if (c === "/" && src[p + 1] === "/") {
    while (p < src.length && src[p] !== "\n") p++;
    return p;
  }
  if (c === "/" && src[p + 1] === "*") {
    const e = src.indexOf("*/", p + 2);
    return e < 0 ? src.length : e + 1;
  }
  return -1;
}

// Index of the `</script` that really ends a script block: skips strings, template literals and comments.
function findScriptEnd(src, from) {
  for (let p = from; p < src.length; p++) {
    if (src[p] === "<" && src.startsWith("</script", p)) return p;
    const end = skipLiteral(src, p);
    if (end >= 0) p = end;
  }
  return -1;
}

// Import statements at the start of a line are hoisted out of the script. Text that only looks like an
// import (inside a string, a template literal or a comment) stays where it is.
// The part between `import` and `from` may only hold names, braces, commas and `*`, so a match can never
// run on into a later statement.
const IMPORT_AT = /import\s+[\w$*{},\s]+?\s*\bfrom\s*["'][^"'\n]+["'];?|import\s*["'][^"'\n]+["'];?/y;

function splitImports(body) {
  const imports = [];
  let out = "", last = 0;
  const atLineStart = (i) => {
    let k = i - 1;
    while (k >= 0 && (body[k] === " " || body[k] === "\t")) k--;
    return k < 0 || body[k] === "\n";
  };
  for (let p = 0; p < body.length; p++) {
    const end = skipLiteral(body, p);
    if (end >= 0) { p = end; continue; }
    if (body[p] === "i" && body.startsWith("import", p) && atLineStart(p)) {
      IMPORT_AT.lastIndex = p;
      const m = IMPORT_AT.exec(body);
      if (m) {
        imports.push(m[0].trim());
        out += body.slice(last, p);
        p += m[0].length - 1;
        last = p + 1;
      }
    }
  }
  return { imports, body: out + body.slice(last) };
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

export function compile(source, { file = "component.mau", runtime = "mau" } = {}) {
  const fail = (msg, pos = 0) => { throw new MauError(msg, file, source, pos); };

  // 1. Split off <script> and <style>. They are blanked (newlines kept) so markup positions stay true.
  // The end of <script> is searched outside of JS strings and comments, so "</script>" may sit in a string.
  const parts = { script: null, style: null };
  let src = "";
  {
    const open = /<(script|style)\b[^>]*>/g;
    let last = 0, m;
    while ((m = open.exec(source))) {
      const tag = m[1];
      const bodyStart = m.index + m[0].length;
      if (parts[tag] !== null) fail(`only one <${tag}> block allowed`, m.index);
      const closeAt = tag === "script" ? findScriptEnd(source, bodyStart) : source.indexOf("</style", bodyStart);
      const close = new RegExp(`</${tag}\\s*>`, "y");
      close.lastIndex = closeAt;
      const cm = closeAt < 0 ? null : close.exec(source);
      if (!cm) fail(`unclosed <${tag}>`, m.index);
      const end = closeAt + cm[0].length;
      parts[tag] = source.slice(bodyStart, closeAt);
      src += source.slice(last, m.index) + source.slice(m.index, end).replace(/[^\n]/g, " ");
      last = end;
      open.lastIndex = end;
    }
    src += source.slice(last);
  }

  // 2. Parse markup into a tree.
  let i = 0;
  const match = (re) => { re.lastIndex = i; return re.exec(src); };
  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };

  function parseChildren() {
    const out = [];
    while (i < src.length) {
      if (src.startsWith("</", i) || src.startsWith("{/", i) || src.startsWith("{:", i)) break;
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i);
        if (end < 0) fail("unclosed comment", i);
        i = end + 3;
      } else if (src[i] === "{") out.push(parseBrace());
      else if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] ?? "")) out.push(parseElement());
      else {
        const pos = i;
        let text = "";
        let j = i;
        while (j < src.length) {
          const ch = src[j];
          // \{ and \} write a literal brace
          if (ch === "\\" && (src[j + 1] === "{" || src[j + 1] === "}")) { text += src[j + 1]; j += 2; continue; }
          if (ch === "{" || (j > i && ch === "<" && /[A-Za-z\/!]/.test(src[j + 1] ?? ""))) break;
          text += ch;
          j++;
        }
        out.push({ type: "text", text, pos });
        i = j;
      }
    }
    return out;
  }

  function parseBrace() {
    const pos = i;
    const end = scanExpr(src, i + 1, fail);
    const inner = src.slice(i + 1, end);
    i = end + 1;
    if (/^#if\s/.test(inner)) return parseIf(inner.slice(4).trim(), pos);
    if (/^#each\s/.test(inner)) return parseEach(inner.slice(6).trim(), pos);
    if (/^@html\s/.test(inner)) return { type: "html", expr: inner.slice(6), pos };
    if (/^[#@]/.test(inner)) fail(`unknown block {${inner.split(/\s/)[0]} ...}`, pos);
    if (!inner.trim()) fail("empty {}", pos);
    return { type: "expr", expr: inner, pos };
  }

  // Consume `{/...}` or `{:...}` at i, return its inner text trimmed.
  function takeBlockTag(name, start) {
    if (!(src.startsWith("{/", i) || src.startsWith("{:", i))) fail(`unclosed {#${name}}`, start);
    const end = scanExpr(src, i + 1, fail);
    const inner = src.slice(i + 1, end).trim();
    i = end + 1;
    return inner;
  }

  function parseIf(cond, pos) {
    const branches = [{ cond, body: parseChildren() }];
    let alt = null;
    for (;;) {
      const tagPos = i;
      const tag = takeBlockTag("if", pos);
      if (tag === "/if") break;
      if (alt) fail("nothing may follow {:else}", tagPos);
      if (tag === ":else") alt = parseChildren();
      else if (/^:else\s+if\s/.test(tag)) branches.push({ cond: tag.replace(/^:else\s+if\s+/, ""), body: parseChildren() });
      else fail(`unexpected {${tag}} in {#if}`, tagPos);
    }
    return { type: "if", branches, alt, pos };
  }

  function parseEach(header, pos) {
    const m = /^([\s\S]+?)\s+as\s+([\s\S]+)$/.exec(header);
    if (!m) fail("{#each} needs `list as item`", pos);
    let [, list, pat] = m;
    const km = /^([\s\S]*?)\s*\(([\s\S]*)\)\s*$/.exec(pat);
    let key = null;
    if (km) { pat = km[1]; key = km[2]; }
    const body = parseChildren();
    const tagPos = i;
    const tag = takeBlockTag("each", pos);
    if (tag !== "/each") fail(`expected {/each}, got {${tag}}`, tagPos);
    return { type: "each", list, pat, key, body, pos };
  }

  function parseAttr() {
    const start = i;
    const m = match(ATTR);
    if (!m) fail("unexpected character in tag", i);
    const name = m[0];
    i += name.length;
    if (src[i] !== "=") return { name, kind: "bool", pos: start };
    i++;
    if (src[i] === "{") {
      const end = scanExpr(src, i + 1, fail);
      const expr = src.slice(i + 1, end);
      i = end + 1;
      return { name, kind: "expr", expr, pos: start };
    }
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i++];
      const segs = [];
      let buf = "";
      for (;;) {
        if (i >= src.length) fail("unclosed attribute value", start);
        const c = src[i];
        if (c === quote) { i++; break; }
        if (c === "\\" && (src[i + 1] === "{" || src[i + 1] === "}")) { buf += src[i + 1]; i += 2; continue; }
        if (c === "{") {
          if (buf) { segs.push(buf); buf = ""; }
          const end = scanExpr(src, i + 1, fail);
          segs.push({ expr: src.slice(i + 1, end) });
          i = end + 1;
        } else { buf += c; i++; }
      }
      if (buf) segs.push(buf);
      return { name, kind: "str", segs, pos: start };
    }
    return fail(`attribute ${name}: use "quotes" or {expression}`, i);
  }

  function parseElement() {
    const pos = i;
    i++;
    const tag = match(NAME)[0];
    i += tag.length;
    const attrs = [];
    let selfClose = false;
    for (;;) {
      skipWs();
      if (i >= src.length) fail(`unclosed <${tag}>`, pos);
      if (src.startsWith("/>", i)) { i += 2; selfClose = true; break; }
      if (src[i] === ">") { i++; break; }
      attrs.push(parseAttr());
    }
    let children = [];
    if (!selfClose && !VOID.has(tag)) {
      children = parseChildren();
      if (!src.startsWith("</", i)) fail(`unclosed <${tag}>`, pos);
      const closePos = i;
      i += 2;
      const c = match(NAME);
      if (!c || c[0] !== tag) fail(`expected </${tag}>`, closePos);
      i += c[0].length;
      skipWs();
      if (src[i] !== ">") fail("expected >", i);
      i++;
    }
    return { type: "el", tag, attrs, children, pos };
  }

  const tree = parseChildren();
  if (i < src.length) fail(`unexpected ${src.slice(i, i + 12).split("\n")[0]}`, i);

  // 3. Generate code.
  const arr = (kids) => `[${kids.join(", ")}]`;

  let preserve = 0; // inside <pre> / <textarea> whitespace stays as written
  let inSvg = false;

  function genChildren(nodes) {
    const out = [];
    nodes.forEach((n, idx) => {
      if (n.type === "text" && preserve) out.push(q(n.text));
      else if (n.type === "text") {
        let t = n.text;
        if (idx === 0) t = t.trimStart();
        if (idx === nodes.length - 1) t = t.trimEnd();
        if (/^\s*$/.test(t) && (t.includes("\n") || t === "")) return;
        out.push(q(t.replace(/\s+/g, " ")));
      } else out.push(gen(n));
    });
    return out;
  }

  const isStatic = (segs) => segs.every((s) => typeof s === "string");
  const template = (segs) =>
    "`" + segs.map((s) => (typeof s === "string" ? s.replace(/\\|`|\$\{/g, "\\$&") : "${" + s.expr + "}")).join("") + "`";
  const genStr = (segs) => (isStatic(segs) ? q(segs.join("")) : "() => " + template(segs));

  // the text a static or interpolated attribute stands for, as a JS expression (used by bind:group)
  const attrExpr = (attrs, name) => {
    const x = attrs.find((y) => y.name === name);
    if (!x) return null;
    if (x.kind === "expr") return `(${x.expr})`;
    if (x.kind === "str") return isStatic(x.segs) ? q(x.segs.join("")) : template(x.segs);
    return "true";
  };
  const staticAttr = (attrs, name) => {
    const x = attrs.find((y) => y.name === name);
    return x && x.kind === "str" && isStatic(x.segs) ? x.segs.join("") : null;
  };

  function genProps(attrs, isComp, tag) {
    const out = [];
    for (const a of attrs) {
      const { name } = a;
      if (name.startsWith("on:")) {
        if (a.kind !== "expr") fail(`${name} needs {handler}`, a.pos);
        out.push(`${q("on" + name.slice(3))}: ${a.expr}`);
      } else if (name.startsWith("bind:")) {
        const prop = name.slice(5);
        if (isComp) fail("bind: works on elements, not components", a.pos);
        if (a.kind !== "expr") fail(`${name} needs {signal}`, a.pos);
        const sig = `(${a.expr})`;
        const type = staticAttr(attrs, "type");
        if (prop === "group") {
          // radio buttons that share one signal: it holds the value of the selected one
          if (tag !== "input" || type !== "radio") fail("bind:group works on <input type=\"radio\"> (checkbox groups are not supported yet)", a.pos);
          const value = attrExpr(attrs, "value");
          if (value === null) fail("bind:group needs a value attribute on the radio button", a.pos);
          out.push(`"checked": () => ${sig}() === ${value}`);
          out.push(`"onchange": (e) => { if (e.target.checked) ${sig}.set(${value}); }`);
        } else if (prop === "value" && (type === "number" || type === "range")) {
          // a number, or null while the field is empty
          out.push(`"value": () => ${sig}()`);
          out.push(`"oninput": (e) => ${sig}.set(e.target.value === "" ? null : Number(e.target.value))`);
        } else if (prop === "value" && tag === "select") {
          out.push(`"value": () => ${sig}()`);
          out.push(`"onchange": (e) => ${sig}.set(e.target.value)`);
        } else {
          out.push(`${q(prop)}: () => ${sig}()`);
          out.push(`${q(prop === "checked" ? "onchange" : "oninput")}: (e) => ${sig}.set(e.target.${prop})`);
        }
      } else if (a.kind === "bool") out.push(`${q(name)}: true`);
      // Component props that hold an expression are getters: the expression runs whenever the component
      // reads props.name, so inside a {…} or an effect it stays live. Reading once (destructuring) is a snapshot.
      else if (isComp && a.kind === "str") out.push(isStatic(a.segs) ? `${q(name)}: ${q(a.segs.join(""))}` : `get ${q(name)}() { return ${template(a.segs)}; }`);
      else if (isComp && !name.startsWith("on") && name !== "ref") out.push(`get ${q(name)}() { return (${a.expr}); }`);
      else if (a.kind === "str") out.push(`${q(name)}: ${genStr(a.segs)}`);
      else if (isComp || name === "ref" || name.startsWith("on")) out.push(`${q(name)}: (${a.expr})`);
      else out.push(`${q(name)}: () => (${a.expr})`);
    }
    return out;
  }

  function gen(n) {
    switch (n.type) {
      case "expr": return `() => (${n.expr})`;
      case "html": return `() => __raw(${n.expr})`;
      case "if": {
        // conditions are tracked, branch bodies are not (a prop read inside must not rebuild the branch)
        let code = n.alt ? `untracked(() => ${arr(genChildren(n.alt))})` : "null";
        for (const b of [...n.branches].reverse()) code = `(${b.cond}) ? untracked(() => ${arr(genChildren(b.body))}) : ${code}`;
        return `() => (${code})`;
      }
      case "each":
        // with a plain `item` / `item, i` pattern, a changed item object updates the row in place
        const live = /^[A-Za-z_$][\w$]*(\s*,\s*[A-Za-z_$][\w$]*)?$/.test(n.pat.trim());
        return `__each(() => (${n.list}), ${n.key ? `(${n.pat}) => (${n.key})` : "null"}, (${n.pat}) => ${arr(genChildren(n.body))}, ${live})`;
      case "el": {
        const isComp = /^[A-Z]/.test(n.tag);
        const props = genProps(n.attrs, isComp, n.tag);
        const keep = !isComp && (n.tag === "pre" || n.tag === "textarea");
        if (keep) preserve++;
        // inside <svg>, `a` and `title` are SVG elements; <foreignObject> switches back to HTML
        const prevSvg = inSvg;
        if (n.tag === "svg") inSvg = true;
        else if (n.tag === "foreignObject") inSvg = false;
        const tagName = inSvg && (n.tag === "a" || n.tag === "title") ? "svg:" + n.tag : n.tag;
        const kids = genChildren(n.children);
        inSvg = prevSvg;
        if (keep) preserve--;
        if (isComp) {
          if (kids.length) props.push(`children: ${arr(kids)}`);
          return `${n.tag}({ ${props.join(", ")} })`;
        }
        return `__h(${q(tagName)}, { ${props.join(", ")} }${kids.map((k) => ", " + k).join("")})`;
      }
    }
  }

  const roots = tree.filter((n) => !(n.type === "text" && /^\s*$/.test(n.text)));
  if (roots.length !== 1 || roots[0].type !== "el") {
    fail("a component needs exactly one root element", (roots[1] ?? roots[0])?.pos ?? 0);
  }

  // 4. Assemble the module.
  const base = file.split(/[\\/]/).pop().replace(/\.mau$/, "").replace(/[^\w$]/g, "_");
  const name = /^[A-Za-z_$]/.test(base) ? base[0].toUpperCase() + base.slice(1) : "_" + base;

  const split = splitImports(parts.script ?? "");
  const imports = split.imports;
  const body = split.body.trim();

  const scopeClass = parts.style !== null ? "mau-" + hash(source) : null;
  const css = scopeClass ? `@scope (.${scopeClass}) {\n${parts.style.trim()}\n}` : null;

  const lines = [
    `// Generated by mau from ${file.split(/[\\/]/).pop()} - do not edit.`,
    "// mau · Copyright (c) 2026 hexedmaya · mau License 1.0",
    `import { signal, computed, effect, untracked, batch, onDestroy, router, route, navigate, h as __h, raw as __raw, each as __each, adoptStyle as __style } from ${q(runtime)};`,
    ...imports,
    "",
  ];
  if (css) lines.push(`__style(${q(css)});`, "");
  lines.push(`export default function ${name}(props = {}) {`);
  // The script is copied as written. Re-indenting it would change the content of multi-line strings.
  if (body) lines.push("  " + body);
  lines.push(`  const __root = ${gen(roots[0])};`);
  if (scopeClass) lines.push(`  __root.classList.add(${q(scopeClass)});`);
  lines.push("  return __root;", "}", "");
  return { code: lines.join("\n") };
}
