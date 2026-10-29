# Encryptee v2 research: framework, PWA, Cloudflare and tooling (as of 2026-10-29)

All versions come from the npm registry (`dist-tags.latest` plus publish timestamps), queried today. Every other claim has a primary-source link. Anything I could not verify is marked **[unverified]** and collected in section 5.

## 0. Current versions

| Package | Latest | Major released | Notes |
|---|---|---|---|
| astro | 7.4.4 | 7.0.0 on 2026-06-22 (6.0.0 on 2026-03-10) | [Astro 7](https://astro.build/blog/astro-7/), [Astro 7.4](https://astro.build/blog/astro-740/) |
| vite | 8.3.5 | 8.0.0 on 2026-03-12 | [Vite 8](https://vite.dev/blog/announcing-vite8) |
| rolldown | 1.2.15 | 1.0.0 on 2026-05-07 | [Rolldown 1.0](https://voidzero.dev/posts/announcing-rolldown-1-0) |
| react / react-dom | 19.3.1 | 19.3 on 2026-09-09 | [React 19.3](https://react.dev/blog/2026/09/09/react-19-3) |
| babel-plugin-react-compiler | 1.0.0 | 2025-10-07 | [Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1) |
| @vitejs/plugin-react | 6.1.2 | 6.0.0 on 2026-03-12 | peer `vite ^8` |
| @tanstack/react-router | 1.170.46 | — | |
| @tanstack/react-start | 1.169.4 | "1.0 stable" post dated 2026-10-13 | [Start 1.0](https://tanstack.com/blog/tanstack-start-1-0); peer `vite >=8` |
| vite-plugin-pwa | 2.0.0 | 2026-10-03 | peer `vite ^3…^8`, `workbox-build ^7.4.1`, Node ≥20.19 |
| @vite-pwa/astro | 1.2.0 | 2025-11-27 | **peer `astro ^1.6…^5` only** |
| serwist / @serwist/vite | 9.5.13 | — | `@serwist/astro` exists only as 10.0.0-preview |
| workbox-build | 7.4.1 | 2026-05-04 | |
| tailwindcss | 4.3.3 | 4.3 on 2026-05-08 | [v4.3](https://tailwindcss.com/blog/tailwindcss-v4-3) |
| vitest | 5.0.5 | 5.0 on 2026-09-03 | [Vitest 5](https://vitest.dev/blog/vitest-5) |
| @playwright/test | 1.64.1 | — | |
| typescript | 7.0.2 | 7.0 GA on 2026-07-08 | [TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |
| @biomejs/biome | 2.6.4 | 2.6 on 2026-10-15 | [Biome 2.6](https://biomejs.dev/blog/biome-v2-6/) |
| oxlint / oxfmt | 1.90.0 / 0.75.0 | oxfmt is still pre-1.0 | |
| eslint / prettier | 10.13.0 / 3.9.10 | ESLint 10 on 2026-02-06 | |
| pnpm | 12.16.1 | 11.0 on 2026-04-28, 12.0 on 2026-08-26 | |
| wrangler / @cloudflare/vite-plugin | 4.155.0 / 1.66.0 | — | |
| @sveltejs/kit | 3.1.0 | 3.0.0 on 2026-10-01 | v1 is on kit ^1.20 |
| preact / solid-js | 11.1.0 / 1.9.17 | Preact 11 on 2026-09-30; Solid 2.0 is still RC | |

Context:
- Cloudflare acquired the Astro team on 2026-01-16. Astro stays MIT-licensed and keeps other deploy targets ([Astro post](https://astro.build/blog/joining-cloudflare/), [press release](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-astro-to-accelerate-the-future-of-high-performance-web-development/)).
- Tailwind Labs joined Shopify on 2026-09-09 ([post](https://tailwindcss.com/blog/tailwind-is-joining-shopify)).

---

## 1. Framework fit

### 1.1 Astro 7

**Static output and islands**
- Astro 7 is built on Vite 8/Rolldown. Its focus is build speed: a Rust `.astro` compiler that now errors on malformed markup, Rust Markdown, and stable route caching ([Astro 7](https://astro.build/blog/astro-7/)).
- A fully static site needs no adapter. You point Wrangler `assets.directory` at `./dist`, and Astro's guide recommends Workers over Pages ([Astro Cloudflare guide](https://docs.astro.build/en/guides/deploy/cloudflare/)).
- `client:load` renders the component to HTML at build time and hydrates it immediately. `client:only="react"` skips server HTML entirely ([directives](https://docs.astro.build/en/reference/directives-reference/)).
- For the tool page, prefer `client:load` for faster first paint. React 19.3's `use(browser())` can opt individual subtrees out of server rendering ([React 19.3](https://react.dev/blog/2026/09/09/react-19-3)).

**CSP**
- Astro's CSP feature (stable since Astro 6, [Astro 6](https://astro.build/blog/astro-6/)) emits a per-page `<meta http-equiv>` with script and style hashes. It does not work in dev ([config reference](https://docs.astro.build/en/reference/configuration-reference/#security)).
- A meta CSP cannot carry `frame-ancestors` ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)), so you would still need the Cloudflare `_headers` file.

**Workers and WASM**
- Astro uses Vite, so `new Worker(new URL(...), {type:'module'})` inside a React island goes through Vite's worker pipeline (section 1.5). **[unverified: I did not build-test this inside Astro 7.]**

**PWA: a real gap**
- `@vite-pwa/astro` 1.2.0 still declares `astro ≤5` as its peer range. Issue [#72](https://github.com/vite-pwa/astro/issues/72) (Astro 6, opened 2026-03-11) and [#74](https://github.com/vite-pwa/astro/issues/74) (Astro 7) are open with no maintainer response, and the fix PR #73 was closed unmerged.
- A community `overrides` workaround is reported working with Astro 7.0.4 ([#72](https://github.com/vite-pwa/astro/issues/72)). **[unofficial]**
- Serwist has a separate problem: its Vite plugin decides whether to emit `sw.js` by checking `build.ssr`, and Astro sets that to true for every build, so `sw.js` is never emitted ([serwist#300](https://github.com/serwist/serwist/issues/300); the Astro report is from 2026-04-20).
- So on Astro you would realistically hand-roll the service worker, for example by calling Workbox `injectManifest` from an `astro:build:done` hook.

**TypeScript 7**
- Volar-based tooling (Astro, Svelte, Vue, MDX) is not supported on TS 7 yet, so Astro projects should stay on TS 6 for editor features ([TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).

### 1.2 Vite 8 + React 19.3 SPA (or small multi-page app)

**React and the React Compiler**
- React 19.3 stabilizes View Transitions and Fragment Refs and adds Trusted Types pass-through. That makes `require-trusted-types-for 'script'` practical ([React 19.3](https://react.dev/blog/2026/09/09/react-19-3)). Browser support: Chrome 83, Firefox 148, Safari 26 ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/http/headers/Content-Security-Policy.json)).
- React Compiler 1.0 has been stable since 2025-10-07. Its lint rules ship in `eslint-plugin-react-hooks` ([post](https://react.dev/blog/2025/10/07/react-compiler-1)).
- `@vitejs/plugin-react` v6 dropped Babel and uses Oxc for Refresh ([Vite 8](https://vite.dev/blog/announcing-vite8)). You enable the compiler with `@rolldown/plugin-babel` plus `reactCompilerPreset()`. There is also an experimental native `react({ compiler: true })` path ([plugin README](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md)).

**Bundle-size baseline**
- React 19's `react-dom/client` is about 60 KB gzip after minification, according to TanStack's esbuild measurement of 19.2.3 ([TanStack](https://tanstack.com/redact/latest/docs/SAVINGS_ANALYSIS)). That is a third-party figure.
- My own check on react-dom 19.3.1: the shipped `react-dom-client.production.js` is 625 KB raw, 110 KB gzip. React 19 ships it unminified, so it is not directly comparable.
- Preact 11.1.0 (core + hooks + compat, shipped minified) measures about 10.6 KB gzip (5.0 + 1.6 + 4.0).
- Default build target is "Baseline widely available as of 2026-01-01": Chrome/Edge 111, Firefox 114, Safari 16.4 ([build options](https://vite.dev/config/build-options)).

**PWA**
- vite-plugin-pwa 2.0.0 officially supports Vite 8 (peer range). That is the cleanest PWA path of the three stacks.

**Prerendering content pages**
- Vite has no built-in static site generation. It does support multi-page apps with several `.html` entries ([build guide](https://vite.dev/guide/build)), which is enough for 3–4 static pages with no JS.
- Alternatives: `vite-prerender-plugin` 0.5.14 (peer `vite 5–8`), or React Router 8 framework mode with `ssr:false` + `prerender: [...]` ([RR prerendering](https://reactrouter.com/how-to/pre-rendering)).

**Cloudflare**
- Cloudflare's React guide is exactly this setup: Vite plugin plus `not_found_handling: "single-page-application"` ([CF React guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)).

### 1.3 TanStack Router and TanStack Start

**Router only**
- File-based routing is the recommended mode ([quick start](https://tanstack.com/router/latest/docs/framework/react/quick-start)).
- Its value is type-safe routes and search params. For one tool view plus a few content pages it is optional.
- Bundlephobia reports 31 KB gzip for the whole package; the real tree-shaken cost is likely lower **[unverified]**.

**Start**
- 1.0 was declared stable on 2026-10-13, about two weeks ago ([post](https://tanstack.com/blog/tanstack-start-1-0)). It is built around server rendering, server functions and Nitro/Vite environments.
- SPA mode still runs a prerender step to produce `/_shell.html`. Its docs pair it with server functions, and the deploy rules route `/_serverFn/*` to a server ([SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode)).
- Full static prerendering exists, but routes with path parameters are only covered via `crawlLinks` ([prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering)).
- On Cloudflare the default setup is a Worker script (`main: @tanstack/react-start/server-entry`) ([CF guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)). `_headers` rules do not apply to responses generated by a Worker script ([CF headers](https://developers.cloudflare.com/workers/static-assets/headers/)), so CSP would have to be set in code.
- The Serwist service-worker build fails with Start's Nitro v2 plugin ([serwist#300](https://github.com/serwist/serwist/issues/300)).
- **Verdict: Start is overkill for an app with no server.**

### 1.4 Lighter alternatives (brief)

- **Preact 11** (released 2026-09-30) via `@preact/preset-vite` 2.10.6 (peer `vite 8`): about a sixth of React's runtime size (measured above). It is the clear win if raw JS size dominates.
- **Solid 2.0** is still at RC (`next` = 2.0.0-rc.19). I would not adopt it now.

### 1.5 Vite 8 and Rolldown: workers and WASM

**Bundler**
- Rolldown replaces both esbuild and Rollup, with Oxc as the compiler. Existing `rollupOptions` are auto-converted ([Vite 8](https://vite.dev/blog/announcing-vite8)).

**Workers** ([features](https://vite.dev/guide/features), [worker options](https://vite.dev/config/worker-options))
- A worker is only detected if `new URL()` is written directly inside `new Worker()`, and every option must be a static literal.
- `?worker`, `?worker&inline` and `?worker&url` suffixes also exist. Avoid `&inline`: it inlines the worker as base64, and blob/inline workers conflict with WEBCAT's rules (section 2.4).
- Worker bundles have their own `worker.plugins` and `worker.rolldownOptions`.
- `worker.format` defaults to `'iife'`. Set it to `'es'` for module workers that code-split.

**WASM** ([features](https://vite.dev/guide/features))
- Three import styles: direct ESM-integration import (needs top-level await), `?init`, or `?url` plus `instantiateStreaming`.
- `.wasm` files smaller than `assetsInlineLimit` are inlined as base64. Prefer `?url` so the WASM is a separately cached, hashable file.
- Any CSP must include `'wasm-unsafe-eval'` ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)).

---

## 2. Offline / PWA

### 2.1 Which service-worker tool

| | Vite + React | Astro 7 | TanStack Start |
|---|---|---|---|
| vite-plugin-pwa 2.0 | Supported (peer `vite ^8`) | Only via `@vite-pwa/astro`, which is stuck on Astro ≤5 | Not verified |
| Serwist 9.5 | Works in principle (peers Vite and Rollup, not Rolldown) **[unverified on Vite 8]** | `build.ssr` bug, and `@serwist/astro` is preview-only | `build.ssr` bug ([#300](https://github.com/serwist/serwist/issues/300)) |
| Hand-written SW plus `workbox-build` injectManifest | Works | The realistic Astro path | Works |

- Serwist forked Workbox because Workbox development stagnated ([repo](https://github.com/serwist/serwist)). Workbox does still ship releases (7.4.0 in Nov 2025, 7.4.1 in May 2026).
- For Vite + React, use vite-plugin-pwa 2.0 with `strategies: 'injectManifest'`. You write the small service worker yourself and the plugin injects the precache manifest.
- Use `injectRegister: null` and import `virtual:pwa-register/react`. The `'inline'` mode adds an inline script, which would break a strict CSP ([register docs](https://vite-pwa-org.netlify.app/guide/register-service-worker)).

### 2.2 Precaching app shell, worker and WASM

- Only js/css/html are precached by default. Add `wasm`, `woff2`, `svg` and `png` to `globPatterns` ([precache](https://vite-pwa-org.netlify.app/guide/service-worker-precache)).
- Workbox skips files over `maximumFileSizeToCacheInBytes`, which defaults to 2,097,152 bytes. Raise it if the WASM is larger ([workbox-build](https://developer.chrome.com/docs/workbox/reference/workbox-build)).
- Keep `cleanupOutdatedCaches` on. The plugin enables it by default for generateSW and strongly advises against turning it off ([prompt guide](https://vite-pwa-org.netlify.app/guide/prompt-for-update)).
- Safari/WebKit can evict best-effort storage, including Cache API and service-worker data. Call `navigator.storage.persist()`; WebKit grants it based on heuristics such as whether the app was added to the Home Screen ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)).

### 2.3 Update flow for a security tool

**How browsers update a service worker** ([web.dev lifecycle](https://web.dev/articles/service-worker-lifecycle))
- The browser checks for a new SW script on navigation and on functional events (24-hour throttle for the latter). Chrome 68+ ignores HTTP caching headers for the main SW script.
- An update is detected by byte difference.
- A new worker that fails to install is discarded and the old one stays active, so a broken build cannot take over.
- A new worker waits until no tabs use the old one. Using `skipWaiting()` risks mixing old and new versions in one page.

**What I recommend**
1. Use `registerType: 'prompt'` (the default). Never swap code during a running encrypt/decrypt job. Show an "update available" banner and call `updateSW()` once the job finishes ([prompt guide](https://vite-pwa-org.netlify.app/guide/prompt-for-update)).
2. Check for updates periodically with `onRegisteredSW` + `r.update()`, skipping when offline or already installing ([periodic updates](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates)). Also check on `visibilitychange`. Don't block first render waiting for an update check ([web.dev](https://web.dev/learn/pwa/update)).
3. Fail closed on known-bad builds. This is my design suggestion, not a library feature. Publish a small `/security.json` that is never precached and served `no-store`, containing a `minSafeBuild`. If the running build is older, refuse new operations until the user updates. When offline, show the build date.
4. Caching headers. Cloudflare's default for static assets is `public, max-age=0, must-revalidate` plus an ETag ([CF headers](https://developers.cloudflare.com/workers/static-assets/headers/)). That is correct for `index.html` and `sw.js`. Only `/assets/*` should get `immutable`. Vite also recommends `no-cache` on HTML so stale-chunk errors (`vite:preloadError`) can recover ([build guide](https://vite.dev/guide/build)).
5. Kill switches:
   - Keep the SW filename stable forever. vite-plugin-pwa's `selfDestroying: true` replaces the worker under the same name and clears its caches ([unregister](https://vite-pwa-org.netlify.app/guide/unregister-service-worker)).
   - As a last resort, `Clear-Site-Data: "storage"` unregisters service workers ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data)). Serve it on a non-precached path. **[unverified: whether browsers honor it on the SW script response itself]**

### 2.4 Verifiable web app code in 2026

There is no cross-browser, production-ready answer yet.

| Mechanism | Status |
|---|---|
| SRI | Covers `<script>` and `<link>`. The `Worker()` constructor has no `integrity` option ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)). Vite has no built-in SRI; community plugins exist (e.g. [vite-plugin-sri-gen](https://classic.yarnpkg.com/en/package/vite-plugin-sri-gen)). |
| `Integrity-Policy` header ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Integrity-Policy)) | Chrome 138; Firefox 145 (partial, reporting endpoints ignored); Safari 26 (partial, module scripts blocked even when an import map supplies integrity). Scripts only; styles are behind a Firefox flag ([BCD](https://github.com/mdn/browser-compat-data/blob/main/http/headers/Integrity-Policy.json)). Treat as a stretch goal for an ESM build. |
| Signature-based SRI (Ed25519) | WICG draft ([spec](https://wicg.github.io/signature-based-sri)). Chrome origin trial ran M135–141 ([I2E](https://groups.google.com/a/chromium.org/g/blink-dev/c/QSsuBmjlnfk)); an Intent to Ship thread exists. **[shipping status unverified]** |
| WAICT (integrity manifest + transparency logs) | Proposed by Cloudflare on 2025-10-16 ([blog](https://blog.cloudflare.com/improving-the-trustworthiness-of-javascript-on-the-web/)). Firefox Nightly prototype behind a pref since 2026-05-05 ([Mozilla Hacks](https://hacks.mozilla.org/2026/05/trustworthy-javascript-for-the-open-web/)). Specs at github.com/waict-wg. No other browser has committed. |
| WEBCAT (Freedom of the Press Foundation) | Alpha Firefox extension ([announcement, 2026-08-06](https://freedom.press/tech/news/webcat-a-tamper-evident-seal-for-the-open-web/), [repo](https://github.com/freedomofpress/webcat)). Rules: all logic assets fixed at signing time, no `eval` and no `blob:` workers, no `unsafe-eval`, only relative redirects, an index page and an error page required ([requirements](https://docs.webcat.tech/webapp-developers/requirements)). |
| Meta Code Verify | Firefox extension that only covers WhatsApp, Messenger, Facebook and Instagram, with reference hashes on Cloudflare. Last version 4.1.0 (Sep 2025) ([AMO](https://addons.mozilla.org/en-US/firefox/addon/code-verify/)). Not usable by third parties. |
| Isolated Web Apps | Signed web bundles. Currently only for enterprise-managed ChromeOS and select partners ([Chrome docs](https://developer.chrome.com/docs/iwa/introduction)). Not for consumers. |

What this means for Encryptee:
- Build v2 so it is ready for WEBCAT/WAICT from day one: fully static, no inline scripts, no `blob:` workers, WASM as a separate file, and a strict CSP sent as a header.
- Publish build hashes per release.
- Enrolling in WEBCAT experimentally is realistic.

---

## 3. Cloudflare hosting

**Product choice**
- Workers Static Assets is Cloudflare's recommendation for new projects. In their words, "Pages continues to work, but new features and optimizations are focused on Workers" ([best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)). Pages docs now ask "Are you sure you want to use Pages?" ([Pages guides](https://developers.cloudflare.com/pages/framework-guides/)).
- Pages is not formally deprecated.
- Static asset requests are free, as on Pages ([migration](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)).
- A purely static site needs no Worker script, only `assets.directory`.

**Limits** ([limits](https://developers.cloudflare.com/workers/platform/limits/))
- 25 MiB per file; 20,000 files on Free (100,000 on Paid).
- `_headers`: 100 rules, 2,000 characters per line. Keep the CSP compact.

**Routing** ([SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [static assets](https://developers.cloudflare.com/workers/static-assets/))
- Use `not_found_handling: "single-page-application"` for an SPA (navigation requests get `index.html` with 200), or `"404-page"` for a multi-page app.

**Headers**
- `_headers` in the asset directory is supported natively. It does not apply to responses generated by a Worker script ([headers](https://developers.cloudflare.com/workers/static-assets/headers/)).
- COOP/COEP is only needed if you use `SharedArrayBuffer`, for example multi-threaded WASM such as threaded Argon2. COEP must then also apply to worker scripts ([web.dev](https://web.dev/articles/coop-coep)).
- Starting `_headers` (test before enforcing; this is a starting point, not a verified policy):
  ```
  /*
    Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: require-corp
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
    Referrer-Policy: no-referrer
    X-Content-Type-Options: nosniff
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```

**Branch previews**
- Worker Previews (Wrangler ≥4.135.0, run with `wrangler preview`) give each branch a stable URL plus an immutable URL per deployment ([Previews](https://developers.cloudflare.com/workers/previews/)).
- Workers Builds can post preview URLs on pull requests. For existing Workers, the switch to the new preview model is one-way ([build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)).
- `workers.dev` preview URLs get `X-Robots-Tag: noindex` automatically; preview URLs on a custom domain do not ([custom-domain previews](https://developers.cloudflare.com/workers/previews/custom-domains/)).

**Keeping v1 on `v1.` (based on your repo)**
- `package.json` shows `@sveltejs/kit ^1.20.4`, `svelte ^4`, `vite ^4` and `@sveltejs/adapter-vercel ^2.4.3`. `src/routes/+page.ts` already sets `prerender = true`, and there is no service worker.
- **Adapter:** use `@sveltejs/adapter-static@2.0.3`. It is the last line that supports kit 1 (peer `^1.5.0`); 3.x needs kit 2 and 4.x needs kit 3. adapter-static works with both Workers Static Assets and Pages ([adapter-cloudflare docs](https://svelte.dev/docs/kit/adapter-cloudflare)). The kit-1-era adapter-cloudflare (2.3.4, Dec 2023) predates Workers Static Assets.
- **Prerender:** move `export const prerender = true` into the root `+layout.ts`, as adapter-static requires ([adapter-static docs](https://svelte.dev/docs/kit/adapter-static)).
- **Deploy:** create a second Worker (e.g. `encryptee-v1`) with `assets.directory: "build"` and a custom domain (`routes: [{ pattern: "v1.<domain>", custom_domain: true }]`) ([custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
- **CI options:**
  - Connect Workers Builds with the production branch set to the `v1` branch ([build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)). The Worker name must match the Wrangler `name` ([Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)).
  - Or, since it is a frozen archive, build once locally and run `wrangler deploy`. That avoids future build-image churn ([build image policies](https://developers.cloudflare.com/changelog/post/2025-12-01-build-image-policies-dev-plat/)). **[unverified: whether Vite 4 / kit 1 builds cleanly on the current build image]**
- **Two things to fix in the repo before any CI build:**
  - `pnpm-workspace.yaml` contains placeholder `allowBuilds` values ("set this to true or false"). pnpm 11+ expects booleans there.
  - `.npmrc` has `engine-strict=true`, but pnpm 11+ only reads auth settings from `.npmrc` ([pnpm 11](https://pnpm.io/blog/releases/11.0)).
- **Isolation:** a subdomain is a separate origin, so v1 and v2 never share service workers or storage.

---

## 4. Tooling baseline

**CSS**
- Tailwind 4.3 via `@tailwindcss/vite` 4.3.3 (peer `vite ^8`).

**TypeScript**
- TS 7.0 (the Go port) is 8–12x faster but has no programmatic API until 7.1 ([TS 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
- `typescript-eslint` 8.72 only supports TypeScript `<6.1`. Volar tooling (Astro, Svelte) also needs TS 6.
- Microsoft provides `@typescript/typescript6` aliases so both can run side by side.

**Testing**
- Use Vitest 5 browser mode (stable since 4.0) with the Playwright provider for `crypto-engine`. It runs in real Chromium, Firefox and WebKit ([browser mode](https://vitest.dev/guide/browser/)). Vitest 5 adds Trace View and strict locators ([Vitest 5](https://vitest.dev/blog/vitest-5)). **[unverified: the docs do not explicitly cover workers, streams or OPFS]**
- Use Playwright 1.64 for end-to-end tests: drop file, encrypt, download, offline, update prompt.
- Playwright's service-worker APIs are Chromium-only, and updated SW main scripts cannot be intercepted ([Playwright SW](https://playwright.dev/docs/service-workers)). Test the update flow by serving two separate builds.

**Lint and format**

| Option | Status |
|---|---|
| Oxlint 1.90 + oxfmt | 872 rules; type-aware linting runs on TS 7 (tsgo); JS plugins are alpha ([linter](https://oxc.rs/docs/guide/usage/linter.html)). oxfmt is 0.75 (pre-1.0) but includes Tailwind class sorting and import sorting ([formatter](https://oxc.rs/docs/guide/usage/formatter.html)). |
| Biome 2.6 | Stable single tool; Markdown, YAML and SCSS support; JS lint plugins in preview ([v2.6](https://biomejs.dev/blog/biome-v2-6/)). |
| ESLint 10 + typescript-eslint + Prettier 3.9 | Most mature, and the only native home for the React Compiler lint rules (`eslint-plugin-react-hooks` 7.1.1). Type-aware rules are tied to TS ≤6.0. |

My pick: Oxlint + oxfmt, matching the Vite/Rolldown/Oxc toolchain. Choose Biome instead if you want a formatter that is past 1.0.

**Monorepo**
- pnpm workspaces plus catalogs ([catalogs](https://pnpm.io/catalogs)).
- pnpm 11 turned supply-chain protection on by default (e.g. `minimumReleaseAge` of 1 day, `allowBuilds`), which is valuable for a security tool. pnpm 12 is the stable Rust rewrite ([12.0](https://pnpm.io/blog/releases/12.0)).
- Suggested layout:
  - `packages/crypto-engine`: pure TypeScript, no DOM framework. Web Crypto, Streams, the worker entry, WASM loader, and test vectors.
  - `apps/web`: UI only, importing the engine through `catalog:` or `workspace:` dependencies.

---

## 5. Flagged / not verified

- Astro 7 build behavior with React-island workers was not build-tested.
- `@vite-pwa/astro` working with an override is a community report only.
- Serwist on Vite 8/Rolldown.
- vite-plugin-pwa 2.0 breaking changes: only the Node ≥20.19 requirement and assets-generator v2 are documented.
- Signature-based SRI shipping status.
- WEBCAT's current version (store listings differ).
- Whether `Clear-Site-Data` works on the SW script response.
- Vitest browser-mode coverage of workers, streams and OPFS.
- Whether Oxlint JS plugins can run `eslint-plugin-react-hooks`.
- Bundle sizes: React's is a third-party figure; Preact's is my own measurement from the npm tarballs.
- Whether the current Workers Builds image can build Vite 4 / SvelteKit 1.

---

## Implications for Encryptee v2

**1st choice: Vite 8 + React 19.3 (with React Compiler), vite-plugin-pwa 2.0 (injectManifest, prompt), Workers Static Assets with no Worker script**

- Structure it as a small multi-page app: the React tool page plus 3–4 static HTML/Markdown pages with no JS. Add TanStack Router only if the tool itself needs several views.
- Decisive reasons:
  1. It is the only stack where the PWA tooling officially supports the current toolchain. Astro's PWA integration is stuck on Astro ≤5, and Serwist breaks on Astro and Start builds.
  2. With no server or Worker script, `_headers` covers every response. CSP, COOP/COEP and Integrity-Policy are then deterministic, and the output already meets WEBCAT/WAICT's static-site rules.
  3. On the tool page the React runtime (about 60 KB gzip) costs the same in Astro, so Astro's zero-JS advantage only helps the few content pages. A multi-page Vite build can ship those with no JS too.
  4. No Volar dependency, so TS 7 works.

**2nd choice: Astro 7 static + one React island (`client:load`) + a hand-written service worker (Workbox injectManifest in `astro:build:done`) + Workers Static Assets**

**Not recommended: TanStack Start.** It is server-first, defaults to a Worker script where `_headers` doesn't apply, has PWA-plugin friction, and has only been "stable" for two weeks. Revisit it if a backend appears.

**When I'd change the ranking:**
- Many content or SEO pages (docs, blog, i18n, MDX): Astro first. Content collections and pages with no JS outweigh the PWA friction, especially if `@vite-pwa/astro` fixes #72/#74.
- Server features needed (share links, accounts, sync): TanStack Start or React Router 8 framework mode on Workers, with security headers set in code.
- A hard JS budget, or targeting low-end devices: keep the Vite stack but swap React for Preact 11 + compat (about 10.6 KB vs 60 KB gzip).
- WAICT ships in stable browsers: either stack works, but the fully static Vite build needs the least change.
