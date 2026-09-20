# Contributing

Thank you for helping. mau is small on purpose, so the best contributions are small too: a fix with a test, a clearer error message, a docs correction.

## Before you start

- Open an issue first for anything bigger than a fix, so we agree on the direction. mau does not aim to be a general framework: no virtual DOM, no dependencies in the runtime, nothing that needs `eval`.
- Security problems: do not open an issue, see [SECURITY.md](SECURITY.md).

## How to work on it

```
npm install
npm test
```

The runtime is `index.js`, `reactive.js`, `dom.js` and `router.js`. The compiler is `compiler/`. Tests are in `test/`: `runtime-cases.js` runs in Node and in the browser (`test/reactivity.html`), the rest run with Node and jsdom.

A mau project has `src/` (what people write) and `dist/` (generated, committed). If you change the compiler and the examples change, run `node compiler/cli.js examples` and commit `examples/dist/` with it.

A change should come with a test that fails without it. Keep the style of the code around it: short comments that say why, no dependencies.

## Contribution terms

By sending a pull request or other material you confirm that

1. you wrote it, or you have the right to send it;
2. you license it to the project under the [mau License 1.0](LICENSE), and you allow the Licensor (HexedMaya) to distribute it as part of mau, also under later versions of the license (section 18);
3. you keep the copyright of your own work (section 20).

If you cannot agree to that, please do not send the change.

## Name and logo

The name mau and the logo follow the [BRAND-POLICY](BRAND-POLICY.md). A fork needs its own name (section 13 of the license).
