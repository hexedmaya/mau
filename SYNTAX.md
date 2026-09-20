# .mau syntax (v0.1 draft)

A `.mau` file has up to three parts: one `<script>`, one markup root, one `<style>`.

```html
<script>
  import Item from "./Item.js";          // imports are hoisted; one per statement
  const n = signal(0);                   // signal, computed, effect, untracked, onDestroy are always in scope
  const inc = () => n.set(n() + 1);      // `props` is the object passed by the parent
</script>

<section class="box {n() > 2 ? 'big' : ''}">
  <p>Wert: {n()}</p>                     <!-- {expr} is reactive, output as text -->
  <button on:click={inc}>+1</button>     <!-- on:event={handler} -->
  <button disabled={n() >= 3}>max</button>
  <input bind:value={name}>              <!-- two-way with a signal; bind:checked too -->
  <p>{@html trustedHtml}</p>             <!-- the only way to insert raw HTML -->

  {#if n() > 2} ... {:else if n() > 0} ... {:else} ... {/if}
  {#each items() as item, i (item.id)} <Item label={item.label} /> {/each}
</section>

<style>
  :scope { padding: 1rem; }              /* the root element */
  b { color: purple; }                   /* everything else is scoped to this component */
</style>
```

## Rules
- Exactly **one root element**. Components are capitalized tags (`<Item label={x} />`). A prop with an expression is a getter: `{props.label}` in the markup stays live, while `const { label } = props` reads it once.
- Attribute values: `"text"`, `"text {expr} text"`, or `{expr}`. No unquoted values.
- Every `{expr}` is wrapped in a function and re-runs when the signals it reads change.
- `{#each list as item (key)}`: keyed. Rows with the same key are kept and only moved. With a plain `item` (or `item, i`) pattern, a new object for the same key updates the row in place, so polling data is cheap. A destructuring pattern (`{ a, b }`) rebuilds instead. Without a key the index is used.
- Styles compile to `@scope (.mau-xxxxxx)` and are added via a constructed stylesheet, so a strict CSP works. The root gets that class.
- Text: write `\{` and `\}` for a literal brace (also inside attribute strings). Whitespace inside `<pre>` and `<textarea>` is kept.
- SVG tags (`svg`, `path`, `g`, ...) are created in the SVG namespace.
- Every event handler runs inside `batch()`: several signal writes give one round of updates. `batch(fn)` is also in scope.
- A `</script>` inside a string or comment in the script part is fine.
- Names reserved in the script: `signal computed effect untracked batch onDestroy props` and the `__`-prefixed helpers.
- Import lines must be at the start of a line. Import a component by the name of its compiled file (`./Item.js`). `dist/` mirrors `src/` and sits next to it, so that path and relative paths out of the project (`../mau/index.js`) are the same in both.

## Router
History based: real paths like `/docs/router`, no `#`. The server has to answer every unknown path with `index.html`. In the script:
```js
const view = router({ "/": Home, "/inst/:id": Inst, "*": NotFound });   // pages get props { params, query }
```
In the markup: `<main>{view()}</main>` and plain links `<a href="/inst/3">`. A click on a link to the same site is a navigation without a page load (not with ctrl/shift, `target`, `download`, other sites or `#anchors`). `navigate("/x")`, `navigate("/x", { replace: true })` and `route()` (reactive `{ path, query }`) are in scope too. `router(routes, { base: "/app" })` for a site below a path.

## Compile
```
node mau/compiler/cli.js            # src/ -> dist/, from the project folder
node mau/compiler/cli.js --watch
```
Compile errors show `file:line:col`. Runtime source maps are not done yet.
