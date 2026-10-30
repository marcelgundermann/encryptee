# Encryptee v2: Vite+ and Void (as of 2026-10-30)

The questions were whether to move the v2 toolchain to Vite+ and the deploy to Void, given that Encryptee is hosted on Cloudflare. Versions come from the npm registry. Every other claim links a primary source or the migration of this repo (branch `v2/vite-plus`). Anything not confirmed is marked **[unverified]**.

## 1. Vite+

**What it is**
- One `vite-plus` package and a `vp` CLI, "the unified toolchain and entry point for web development". It bundles Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown and the Vite Task runner ([guide](https://viteplus.dev/guide/)).
- Commands:
  - `dev`, `build`, `preview`, `test`, `lint`, `fmt`, `check` (fmt + lint + optional tsgolint type checks)
  - `run` (tasks with caching), `exec`, `pack`, `staged`, `env`, `migrate`
- Built-in commands can't be overridden by scripts of the same name.

**Status, license and ownership**
- 1.0 shipped on 2026-09-28, stable and MIT licensed ([1.0](https://voidzero.dev/posts/announcing-vite-plus-1-0)).
- The paid company license floated at the alpha was dropped; it is "truly free and open source" ([alpha post](https://voidzero.dev/posts/announcing-vite-plus-alpha)).
- VoidZero has been part of Cloudflare since 2026-06-04, and its projects stay MIT ([post](https://voidzero.dev/posts/voidzero-cloudflare)).

**What `vite-plus@1.4.0` bundles** (latest, published 2026-10-23 by GitHub Actions OIDC)
- Its `vite` is `@voidzero-dev/vite-plus-core@1.4.0`, built from Vite 8.3.5 and Rolldown 1.2.15 (`bundledVersions` in the package).
- Vitest 5.0.5.
- Oxlint and `@oxlint/plugins` `=1.89.0`, and Oxfmt `=0.74.0`. That is one minor behind the 1.90.0 / 0.75.0 that v2 pinned before.

**Task cache** ([run config](https://viteplus.dev/config/run), [cache](https://viteplus.dev/guide/cache))
- Tasks in `vite.config.ts` are cached by default; `package.json` scripts are not.
- Inputs are tracked automatically from the files a task reads.
- Tasks see only `cache.env`, `cache.untrackedEnv` and built-in pass-through variables. Whether external binaries count toward the cache key is not documented.
- The cache is local (`node_modules/.vite/task-cache`). CI keeps it with `actions/cache` ([guide](https://viteplus.dev/guide/github-actions-cache)).

**Deployment:** none. Vite+ has no deploy feature ([guide](https://viteplus.dev/guide/)).

## 2. Void

- "Void is a CLI, platform, and full-stack SDK that unifies building & deploying apps" ([void.cloud](https://void.cloud/)).
  - It is a framework for Cloudflare Workers on Vite, with handlers on Hono ([guide](https://void.cloud/guide/), [Hono](https://void.cloud/integrations/hono)).
  - Cloudflare announced it on 2026-10-15 ([blog](https://blog.cloudflare.com/deploy-with-void/)). It is MIT licensed and needs Node ≥ 24.21 ([repo](https://github.com/voidzero-dev/void)).
- It deploys into your own Cloudflare account (`void deploy`), or to a self-hosted Void Platform on Workers for Platforms ([deployment](https://void.cloud/guide/deployment)). void.cloud is the docs site; no hosted service is documented.
- A static SPA is supported (`void deploy --dir`) ([app types](https://void.cloud/guide/app-types)).
  - It replaces `wrangler.jsonc` with `void.config.ts` + `void.lock.json` ([Cloudflare integration](https://void.cloud/integrations/cloudflare)).
  - Whether a static deploy stays free of a Worker script is **[unverified]**. If it isn't, `_headers` stops applying ([Cloudflare headers](https://developers.cloudflare.com/workers/static-assets/headers/)).
- Its value is the backend: D1, KV, R2, auth, queues. None of it applies to a static, zero-knowledge app.

## 3. The migration (`vp migrate`, Vite+ 1.4.0)

**Ran cleanly at the workspace root**
- Moved `.oxlintrc.json` and `.oxfmtrc.json` into the root `vite.config.ts`.
- Rewrote `vitest` and `vite` imports to `vite-plus`, `vite-plus/test` and `vite-plus/test/browser-playwright`. It also rewrote the vendored anti-slop plugin's imports to `vite-plus/lint/plugins`.
- Aliased `vite` in the catalog and added pnpm `overrides` and `peerDependencyRules` for it.
- Wrapped the app's plugins in `lazyPlugins`.

**Corrected by hand**
- It added a `minimumReleaseAgeExclude` list exempting `vite-plus`, Oxlint, Oxfmt and Vitest from pnpm's one-day release delay. That list was removed; the install works without it.
- It turned on `lint.options.typeAware` and `typeCheck`.

**Type checking**
- With `typeCheck` on, tsgolint caught a plain type error in all five tsconfig scopes.
- It missed `noUncheckedIndexedAccess` errors and wrong-lib errors (`document` in a worker) in files under `tsconfig.sw.json`, `tsconfig.node.json` and `tsconfig.worker.json`. It evidently checks every file against the package's `tsconfig.json`.
- For the same reason, the type-aware rules reported necessary `!` assertions as unnecessary.
- So `tsc` stays the type checker, and type-aware lint is off ([check](https://viteplus.dev/guide/check) doesn't cover multi-tsconfig projects).

**Result**
- `apps/web/dist` is byte-for-byte identical to the pre-migration build.
- Lint (with anti-slop), format check, typecheck, Knip, unit tests, the engine's browser tests and e2e (Chromium, WebKit) pass with unchanged counts.

## Implications for Encryptee v2

**Adopt Vite+.** v2 already ran its stack, so the build is unchanged and there is no speed gain to speak of. What it buys:
- One dependency for the toolchain and one config for lint and format.
- Cached tasks.
- One CI setup step: `voidzero-dev/setup-vp`, pinned by commit.

**Don't adopt Void.** For a static app it only replaces `wrangler deploy`, and it puts the `_headers` security policy at risk. ADR 0005 records the static-only constraint that rules it out.

**Revisit**
- Type-aware lint, once tsgolint applies the tsconfig that includes each file.
- Void, only if a feature needs server state (ADR 0005).
