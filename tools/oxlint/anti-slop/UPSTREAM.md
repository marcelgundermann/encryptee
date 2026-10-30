# Vendored anti-slop Oxlint plugin

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13, merge of PR #45). The last upstream commit touching the copied files is `d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8`.

Copied from `skills/install-anti-slop/assets/anti-slop/` (git tree `54b50f11bed7f52ca1948f8802f4df591644762f`) by the `install-anti-slop` skill's `scripts/install.mjs` on 2026-10-29. That asset tree is upstream `src/` without the `*.test.ts` files. At install time the copy was verified byte-identical to both the asset tree and `src/` (excluding tests) at the commit above. Use that revision as the pristine base for the next three-way update.

## Installed entry points

- `index.ts`, registered in the root `vite.config.ts` (`lint.jsPlugins`, Vite+) as the `anti-slop` JS plugin with all 18 generic rules at `error`, plus the native companion `oxc/no-accumulating-spread`.
- `effect/index.ts`, copied but **not registered**: no package manifest depends on `effect` directly.
- `vendor/eslint-stylistic/`: vendored `padding-line-between-statements` with its own `LICENSE` and `UPSTREAM.md`.

## Dependencies

The plugin API comes from `vite-plus` (pinned in the pnpm catalog, `1.4.0` as of 2026-10-30), which bundles `oxlint` and `@oxlint/plugins` at the same exact version (`1.89.0`) and re-exports the latter as `vite-plus/lint/plugins`. There is no direct `@oxlint/plugins` or `oxlint` dependency any more. Upstream develops against `1.78.0`; the plugin loads and reports under `1.89.0` (checked on 2026-10-30 with planted `no-unknown-parameters`, `no-unknown-returns`, `no-reflect-get` and `require-readable-spacing` violations).

## Local deviations

- **Plugin API import specifier (2026-10-30, Vite+ migration):** every import of `@oxlint/plugins` in the 35 vendored `.ts` files, `vendor/eslint-stylistic/` included, reads `vite-plus/lint/plugins` instead. `vp migrate` (Vite+ 1.4.0) made the rewrite. Nothing else changed: the diff is 50 import lines, each with the same imported names and quote style as upstream. Upstream still imports `@oxlint/plugins`, so the next update must reapply this rewrite to incoming files rather than take their imports as an upstream change.

Every other byte matches the base revision above.

## Known gaps

- Upstream rule tests (`*.test.ts`) are not vendored, and the plugin directory is excluded from lint, format, and `pnpm typecheck`.
- Under this repo's `noUncheckedIndexedAccess`, `shared/dictionary-types.ts:201` fails `tsc` (TS2322: `unsafeMembers[0]` may be `undefined`). The surrounding `length > 0` check makes this safe at runtime; it is an upstream typing gap, left unpatched.
