# Bootstrap

Infra setup log for Out of Service (NYC subway accessible routing with a derived elevator
reliability index, WebMCP-enabled, built for The WebMCP Challenge).

## Repo

- GitHub: https://github.com/kamalbuilds/out-of-service (public, MIT licence, confirmed via
  `gh api repos/kamalbuilds/out-of-service --jq .license.spdx_id` -> `MIT`)
- Vercel project: `kamalisheres-projects/out-of-service`, GitHub-connected for auto-deploys
  on push to `main`.

## Production URL

https://out-of-service-sepia.vercel.app

Verified live: `curl -s https://out-of-service-sepia.vercel.app | grep -c "Out of Service"`
returned `1`.

## State store

**Chosen: Vercel Blob** (option (b) in the bootstrap plan). Option (a),
`vercel integration add upstash/upstash-kv`, hung indefinitely on an interactive
plan-selection prompt that the CLI's `--non-interactive` flag does not suppress (killed
after 90s with no output). Vercel Blob's own linking flow also renders interactive
prompts (link store to project Y/n, then a checkbox for environments) that plain
piped stdin cannot satisfy either -- piped input is not a TTY so the checkbox UI never
receives raw keypresses. This was solved with `expect` (`/usr/bin/expect`, already on the
box) driving a real pty:

```
spawn vercel blob create-store <name>
expect "link this blob store" { send "y\r"; exp_continue }
expect "Select environments"  { send "\r";  exp_continue }
```

Store `out-of-service-kv7` (`store_BNjKDnXtsSVYLLEL`) is linked to the project across
Production, Preview, and Development.

Env var name (value never printed or committed): `BLOB_READ_WRITE_TOKEN`

Six earlier stores created while iterating on the non-interactive flow
(`out-of-service-state`, `out-of-service-kv`, `out-of-service-kv3` through `kv6`) were
never linked to a project, so `vercel blob delete-store` can't clean them up (deleting an
unlinked store needs a token that only exists once a store is linked). They hold no
data and cost nothing sitting idle; delete manually from the Vercel dashboard
(Storage tab) if desired.

`vercel env pull .env.local` was run; `.env.local` exists locally (gitignored, 3 lines,
never committed or catted to a log).

## Commands

```bash
pnpm dev                    # local dev server
pnpm build                  # production build (passes on the current tree)
vercel deploy --prod --yes  # ship to production
```

## Gotchas

- `pnpm build` / `pnpm install` fail hard with `ERR_PNPM_IGNORED_BUILDS` on a fresh
  clone until `esbuild`'s postinstall script is approved: run
  `pnpm approve-builds --all` once per machine.
- `vercel integration add <name>` errors if the integration has multiple products
  (e.g. `upstash` has `upstash-qstash`, `upstash-vector`, `upstash-search`,
  `upstash-kv`) -- must specify `<integration>/<product>`.
- Any Vercel CLI subcommand that renders an interactive prompt (Y/n confirms,
  checkboxes) ignores piped stdin outright; wrap it with `expect` if it must run
  headlessly.
- `.env*` and `.env*.local` are both gitignored (the latter added automatically by
  `vercel env pull`). Never `cat` or commit `.env.local`.
