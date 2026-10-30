The Vite + React app: the tool (`index.html`, `src/tool/`), the content pages (`src/pages/`), the service worker (`src/sw.ts`) and the headers every response gets (`public/_headers`). It's served as static assets with no Worker script (the root's `wrangler.example.jsonc`).

## Rules

- All UI copy is in `src/strings.ts`, in the words of `GLOSSARY.md`. An engine error reaches the user as the text for its code, through `errorMessage()`.
- The CSP in `public/_headers` requires Trusted Types for scripts. The one policy, `default` in `src/trusted-types.ts`, lets same-origin script URLs through to `new Worker` and `serviceWorker.register`, and nothing turns a string into HTML or script. An entry that starts a worker imports `trusted-types.ts` first, like `src/tool/main.tsx`. A new policy is named in `_headers`' `trusted-types` too, which `src/trusted-types.test.ts` checks.
- A content page is its name in `PAGES` (`pages.ts`), its `<page>/index.html`, and its component in `src/pages/main.tsx`. The build and the e2e CSP test both read `PAGES`.
- The build number (`__BUILD_NUMBER__`) is the commit's time. `public/security.json`, never cached, names the oldest build still safe to run, and the tool disables encrypting and decrypting on an older one. Raise `minSafeBuild` only to a build that's deployed.
- A service-worker update is offered, never forced, and only while no job runs.

## Tests

- `pnpm --filter @encryptee/web test`: Vitest in Node, with the app's Vite config. A test next to its module in `src/` is typed as app code and reads other files with `?raw`; `test/` holds the build's and the deployment's tests, typed for Node.
- `pnpm build && pnpm e2e`: Playwright against the production build under `wrangler dev`, so the real `_headers` apply. Run it after changing the app, its headers or the service worker.
