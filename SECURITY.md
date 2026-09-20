# Security

mau is built so that text from users is never run as code: text is escaped, raw HTML needs an explicit `{@html}`, event handlers must be functions, and `javascript:` addresses are blocked. The runtime and the generated files work under a strict Content-Security-Policy.

If you find a way around that, or any other security problem in mau (the runtime, the compiler, the router, the editor extension or the website), please tell me privately before you make it public.

## Report a problem

Use GitHub's private report: on the repository open **Security → Report a vulnerability**. If that does not work for you, write to maja@melloo.me.

Please include what you found, how to reproduce it (a small `.mau` file or a page is ideal) and which version or commit you used.

I read every report and answer as soon as I can. When a problem is confirmed, I fix it first and say so in the release notes when the fix is out.

## What counts

- text, attributes or URLs from a user that end up running as script
- a way to make generated code need `unsafe-eval`, `unsafe-inline` or another loosening of the policy
- the compiler writing outside of `dist/`, or deleting files that mau did not create
- the router sending a visitor to another site or running script through a link

## What does not

- problems in code that you add yourself, for example `{@html}` with input you did not check
- missing features that are listed as not done yet (runtime source maps, for example)

## Versions

Only the latest release and the current `main` get fixes.
