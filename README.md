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

Copy this folder into your project, then:

```
node mau/compiler/cli.js src            # every .mau file gets a .js file next to it
node mau/compiler/cli.js src --watch
```

```js
import { mount } from "./mau/index.js";
import Counter from "./src/Counter.js";

mount(document.getElementById("app"), Counter);
```

Any static server works. Commit the generated `.js` files, then nobody else needs a build step.

## What is in here

| Path | |
| --- | --- |
| `index.js`, `reactive.js`, `dom.js`, `router.js` | the runtime (about 3 KB gzipped) |
| `compiler/` | the compiler and its command line |
| `SYNTAX.md` | the `.mau` syntax |
| `brand/` | logo, icon and PNG variants, see `BRAND-POLICY.md` |
| `examples/` | a small example |
| `test/` | Node tests (`npm install`, then `npm test`) and a browser test page |

## Related

- mau-website: the website and docs, built with mau (not in this repo)
- mau-vs: VS Code syntax highlighting for `.mau` (not in this repo)

## License

mau License 1.0. mau is source-available, not an open source license. You may use it, also commercially, to build your own products and you do not have to publish their source. You may not sell mau itself. Read the full text in [LICENSE](LICENSE). How the name and logo may be used: [BRAND-POLICY.md](BRAND-POLICY.md).
