Encryptee encrypts and decrypts files in the browser, on the user's device, as age files. A pnpm workspace:

- `packages/engine/` (`@encryptee/engine`): the age engine: the header through typage, the payload in parallel workers, saving, keys. Read `packages/engine/AGENTS.md` before working in it.
- `apps/web/` (`@encryptee/web`): the Vite + React app, the content pages, the service worker and `_headers`. Read `apps/web/AGENTS.md` before working in it.
- `deploy/v1/`: the Worker serving the frozen v1 (the `v1` branch).
- `tools/oxlint/anti-slop/`: a vendored Oxlint plugin; change it only through the `install-anti-slop` skill.

Name things by `GLOSSARY.md`, in code, UI copy and commits. Read the ADRs in `docs/adr/` that touch the area you're working in. An ADR that changes an earlier one names it, and the earlier one gets `Amended by ADR NNNN` at its top.

## Commands

Run everything through pnpm from the root, and a package's own scripts with `pnpm --filter @encryptee/<package> <script>`.

```bash
pnpm fmt                  # format (Oxfmt)
pnpm check                # format check, lint, typecheck, Knip (knip.jsonc) and every package's tests
pnpm dev                  # the tool at http://localhost:5173
pnpm build && pnpm e2e    # Playwright against the production build, served by wrangler dev with the real _headers
pnpm --filter @encryptee/engine bench   # throughput bench at http://localhost:5174
```

- `BROWSERS=chromium,webkit` narrows the engine's tests and the e2e tests to those browsers; all three run by default.
- `AGE_BIN` names the folder of an `age` ≥ 1.3 release (`age`, `age-keygen`, `age-plugin-batchpass`) for the engine's CLI interop tests. Without it they look on `PATH`, and skip when `age` isn't there.
- Firefox can't launch in the agent sandbox: run with `BROWSERS=chromium,webkit` there, and ask the user to run Firefox.

Run `pnpm fmt`, then `pnpm check`, before declaring any task done.

## Workspace

- Versions are exact, in the `catalog:` of `pnpm-workspace.yaml`, and packages name them as `catalog:`. pnpm installs nothing published less than a day ago (`minimumReleaseAge`), so take the release before one from today.
- Wrangler configs are committed only as `*.example.jsonc`. The real `wrangler.jsonc`, with the `account_id`, is git-ignored: `cp wrangler.example.jsonc wrangler.jsonc` once, for `pnpm e2e`.
- A package joins `pnpm typecheck` and `pnpm test` by having those scripts, and Knip by a workspace in `knip.jsonc`. Every exception in `knip.jsonc` says why.
- CI (`.github/workflows/ci.yml`) runs what `pnpm check` runs, split in two: the engine's tests in their own job, with the three browsers and `age`, and everything else in the check job. A new step in `pnpm check` goes in CI too.

## Tests

- Fix a bug by first writing a test that goes red on it.
- One behaviour per test, named by a sentence that states it, like `'a plaintext file named .age, since names never decide, is encrypted'`. A table of cases is one `test.each`.
- Swap a dependency through a seam the code already has; each package's `AGENTS.md` lists them. `anti-slop/no-module-mocking` turns down `vi.mock`, while `vi.stubGlobal` for a browser global like `fetch` is fine.
