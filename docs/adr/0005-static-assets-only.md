# Serve v2 as static assets only, with no Worker script

Amended by ADR 0006.

Encryptee v2 deploys to Cloudflare Workers Static Assets with no Worker script: `wrangler.jsonc` has `assets` and no `main`. The security headers in `apps/web/public/_headers` (a strict CSP with Trusted Types, COOP/COEP, `frame-ancestors 'none'`) apply only to responses served straight from static assets. Responses produced by a Worker script skip `_headers` ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/headers/)), so adding one would quietly drop them unless every header were set again in code. A server-less app also keeps the zero-knowledge promise easy to check: there is no code on the server that could see a file, a key or a passphrase.

Full-stack frameworks that bring a Worker script were weighed and turned down for that reason: Void, Cloudflare's Hono + Vite framework, which deploys into our own account; TanStack Start; and SSR in general (`docs/research/2026-10-framework-pwa-hosting.md`, `docs/research/2026-10-vite-plus-void.md`).

## Consequences

- Share links carry the public key in the URL fragment only. There are no short links, since those need server storage.
- Security headers live in `_headers`, and the e2e tests check them against `wrangler dev`, which serves that file.
- Build tooling can change freely, Vite+ included, as long as the output stays plain static files.
- A feature that needs server state (accounts, sync, short links) reopens this decision, and the headers would then have to be set in code.
