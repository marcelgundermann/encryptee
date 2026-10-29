# Vendored anti-slop Oxlint plugin

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13, merge of PR #45). The last upstream commit touching the copied files is `d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8`.

Copied from `skills/install-anti-slop/assets/anti-slop/` (git tree `54b50f11bed7f52ca1948f8802f4df591644762f`) by the `install-anti-slop` skill's `scripts/install.mjs` on 2026-10-29. That asset tree is upstream `src/` without the `*.test.ts` files. At install time the copy was verified byte-identical to both the asset tree and `src/` (excluding tests) at the commit above. Use that revision as the pristine base for the next three-way update.

## Installed entry points

- `index.ts`, registered in `.oxlintrc.json` as the `anti-slop` JS plugin with all 18 generic rules at `error`, plus the native companion `oxc/no-accumulating-spread`.
- `effect/index.ts`, copied but **not registered**: no package manifest depends on `effect` directly.
- `vendor/eslint-stylistic/`: vendored `padding-line-between-statements` with its own `LICENSE` and `UPSTREAM.md`.

## Dependencies

`@oxlint/plugins` is pinned in the pnpm catalog to `1.90.0` to match `oxlint`. Upstream develops against `1.78.0`; the plugin loads and reports under `1.90.0`.

## Local deviations

None. All files match upstream.

## Known gaps

- Upstream rule tests (`*.test.ts`) are not vendored, and the plugin directory is excluded from lint, format, and `pnpm typecheck`.
- Under this repo's `noUncheckedIndexedAccess`, `shared/dictionary-types.ts:201` fails `tsc` (TS2322: `unsafeMembers[0]` may be `undefined`). The surrounding `length > 0` check makes this safe at runtime; it is an upstream typing gap, left unpatched.
