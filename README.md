# mau

**Make A UI.** A small, dependency-free frontend framework. You write `.mau` files, a compiler turns them into plain JavaScript that builds the DOM directly. No virtual DOM, no runtime dependencies, works under a strict Content-Security-Policy. By hexedmaya.

```html
<script>
  const n = signal(0);
</script>

<button on:click={() => n.set(n() + 1)}>
  clicked {n()}
</button>
```

## Use it

Copy this folder into your project. A project has two folders next to `mau/`:

```
my-app/
  index.html
  src/     what people write: .mau files, plain .js, css, images
  dist/    what the browser loads. Generated, commit it
  mau/     this folder
```

Compile from the project folder:

```
node mau/compiler/cli.js            # src/ -> dist/
node mau/compiler/cli.js --watch
```

Every `.mau` file in `src/` becomes a `.js` file at the same place in `dist/`. Every other file is copied as it is. `dist/` mirrors `src/` and sits next to it, so a relative import like `../mau/index.js` is the same in both. `src/` is never written to, and `dist/` belongs to mau: what is in there is overwritten or removed (mau refuses to touch a `dist/` it did not create).

```js
// src/main.js
import { mount } from "../mau/index.js";
import Counter from "./Counter.js";

mount(document.getElementById("app"), Counter);
```

```html
<script type="module" src="/dist/main.js"></script>
```

Any static server works, and for an app with paths like `/instance/3` it has to answer unknown paths with `index.html`. Commit `dist/`, then nobody else needs a build step.

## What is in here

| Path | |
| --- | --- |
| `index.js`, `reactive.js`, `dom.js`, `router.js` | the runtime (about 3 KB gzipped) |
| `compiler/` | the compiler and its command line |
| `SYNTAX.md` | the `.mau` syntax |
| `brand/` | logo, icon and PNG variants, see `BRAND-POLICY.md` |
| `examples/` | a small project (`src/` and the generated `dist/`) |
| `test/` | Node tests (`npm install`, then `npm test`) and a browser test page |

## Related

- mau-website: the website and docs, built with mau (not in this repo)
- mau-vs: VS Code syntax highlighting for `.mau` (not in this repo)

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) says how to work on mau. Security problems: [SECURITY.md](SECURITY.md).

## License

mau License 1.0. mau is source-available, not an open source license. You may use it, also commercially, to build your own products and you do not have to publish their source. You may not sell mau itself. Read the full text in [LICENSE](LICENSE). How the name and logo may be used: [BRAND-POLICY.md](BRAND-POLICY.md).
