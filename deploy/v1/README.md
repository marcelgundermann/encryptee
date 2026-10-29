# v1 archive deploy

Encryptee v1 (SvelteKit 1) is frozen on the `v1` branch and tag `v1.0.0`. It is
served as static assets by the `encryptee-v1` Worker at <https://v1.encryptee.io>.
There is no CI for it, so deploys run from a local build.

```sh
git worktree add .worktrees/v1 v1          # once; .worktrees/ is git-ignored
cd .worktrees/v1
mise exec node@18 -- npx pnpm@8 install --frozen-lockfile
mise exec node@18 -- npx pnpm@8 build      # adapter-vercel refuses Node > 18
cd ../..
npx wrangler deploy -c deploy/v1/wrangler.jsonc
```

The build output in `.vercel/output/static` is plain static files, so the Vercel
adapter is only used as a static exporter here.
