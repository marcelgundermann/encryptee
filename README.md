# Encryptee

Encrypt and decrypt files in the browser, entirely on your device. Files use the
[age](https://age-encryption.org) format, so the `age` CLI opens them too.

> v2 is in development on this branch. v1 (SvelteKit) is frozen on the `v1`
> branch and served at <https://v1.encryptee.io>.

## Layout

- `packages/engine`: the age engine (header via typage, parallel payload in workers, save paths, keys). The UI only talks to its public interface, `src/index.ts`.
- `apps/web`: the Vite + React app, content pages, service worker and `_headers`.
- `docs/research`, `docs/adr`, `GLOSSARY.md`: background, decisions and vocabulary.
- `deploy/v1`: the v1 archive Worker.

## Development

Requires Node 26 and pnpm 12. The toolchain is [Vite+](https://viteplus.dev)
(`vp`), installed with the workspace: `pnpm vp …` runs it without a global install.

```sh
pnpm install
cp wrangler.example.jsonc wrangler.jsonc   # once; git-ignored, add your account_id here
pnpm dev                 # tool at http://localhost:5173
pnpm test                # engine tests in Chromium, Firefox and WebKit; the app's in Node
pnpm check               # format check, lint, typecheck, Knip and tests
pnpm build && pnpm e2e   # end-to-end against the production build (wrangler dev)
pnpm vp run @encryptee/engine#bench   # throughput bench at http://localhost:5174
```

Lint, format check, typecheck, Knip, and the app's unit tests and build are cached
Vite+ tasks: they replay when nothing they read changed (`--no-cache` forces a run).
The engine's tests and e2e always run.

Set `BROWSERS=chromium,webkit` to narrow test runs, and `AGE_BIN` to the directory
of an `age` ≥ 1.3 release to run the CLI interop tests.
