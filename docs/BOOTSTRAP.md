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

**Chosen: Upstash Redis via the Vercel Marketplace** (option (a), retried). The original
attempt at this option hung on an interactive plan-selection prompt (see the superseded
Vercel Blob writeup below); on a later Vercel CLI (50.39.0) `vercel integration add
upstash/upstash-kv` takes `--plan free -m primaryRegion=iad1 --non-interactive` and
completes with no TTY needed:

```
vercel integration add upstash/upstash-kv --plan free -m primaryRegion=iad1 \
  --non-interactive -e production -e preview -e development -n out-of-service-redis
```

This was needed because the linked Vercel Blob store (`out-of-service-kv7`,
`store_BNjKDnXtsSVYLLEL`) went to `Billing State: Inactive` at the account level
(surfaced to the app as `HTTP 403 store_suspended` on every `put`), blocking every write
(`create_trip`, `accept_route`, `accept_reroute`, `propose_reroute`, `add_note`,
`report_broken_equipment`, `watch_equipment`) on both local and production. `vercel blob
get-store <id>` is the only way to read a store's status from the CLI; there is no `list`
subcommand for stores (only for blobs inside a store), so the six orphaned stores from the
original bootstrap run (see below) could not be enumerated or removed via CLI -- they
have no recorded IDs and `get-store`/`delete-store` both require an ID, not a name.

`src/lib/store/backend.ts` already preferred `UPSTASH_REDIS_REST_URL`/`_TOKEN` over
`KV_REST_API_URL`/`_TOKEN` over `BLOB_READ_WRITE_TOKEN` over in-memory, so no code change
was needed -- the Vercel-Marketplace Upstash resource provisions `KV_REST_API_URL` /
`KV_REST_API_TOKEN` (identical REST protocol to Upstash's own vars, just Vercel-prefixed
naming), which the existing second-priority branch (`vercel-kv`) already picks up.
`GET /api/health` now reports `store.backend: "vercel-kv"` pointing at the Upstash host.

Env var names added (values never printed or committed): `KV_REST_API_URL`,
`KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`.
`BLOB_READ_WRITE_TOKEN` is still present (Production, Preview, Development) as a fallback
env var but is no longer the active backend.

Verified end to end on both local and production after redeploy: `POST /api/trip`
creates a trip at version 1, `GET /api/trip/<id>` reads it back at version 1, `POST
/api/trip/<id>/action` (a `note`) advances it to version 2 with the note appended to
`trip.notes`.

### Superseded: Vercel Blob (original choice, now suspended)

**Original choice: Vercel Blob** (option (b) in the bootstrap plan). Option (a),
`vercel integration add upstash/upstash-kv`, hung indefinitely on an interactive
plan-selection prompt that the CLI's `--non-interactive` flag does not suppress (killed
after 90s with no output) -- this was a CLI-version-specific bug, since a later CLI
version (50.39.0, see above) resolved it with an explicit `--plan`. Vercel Blob's own
linking flow also renders interactive prompts (link store to project Y/n, then a
checkbox for environments) that plain piped stdin cannot satisfy either -- piped input is
not a TTY so the checkbox UI never receives raw keypresses. This was solved with `expect`
(`/usr/bin/expect`, already on the box) driving a real pty:

```
spawn vercel blob create-store <name>
expect "link this blob store" { send "y\r"; exp_continue }
expect "Select environments"  { send "\r";  exp_continue }
```

Store `out-of-service-kv7` (`store_BNjKDnXtsSVYLLEL`) was linked to the project across
Production, Preview, and Development, then went to `Billing State: Inactive` the same
day, which is what forced the move to Upstash above. It is still linked and still holds
221KB of historical trip data; leave it in place as a dormant fallback unless the
`BLOB_READ_WRITE_TOKEN` env var is deliberately removed.

Six earlier stores created while iterating on the non-interactive flow
(`out-of-service-state`, `out-of-service-kv`, `out-of-service-kv3` through `kv6`) were
never linked to a project, so `vercel blob delete-store` can't clean them up (deleting an
unlinked store needs a token that only exists once a store is linked, and the CLI has no
`list` command to even discover their store IDs). They hold no data and cost nothing
sitting idle; **delete manually from the Vercel dashboard (Storage tab)** -- this is the
one remaining manual step, since no CLI path reaches them.

`vercel env pull .env.local` was run; `.env.local` exists locally (gitignored, never
committed or catted to a log).

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
- `vercel integration add <integration>/<product> --help` prints the exact `--plan`
  IDs and `-m` metadata keys accepted for that product (e.g. `free`, `paid`,
  `fixed_250mb`, ... for `upstash-kv`); passing `--plan` and every required `-m` key up
  front avoids the interactive picker entirely, no `expect` needed.
- `vercel blob get-store` (and `delete-store`) take a store **ID**, never a name, and
  there is no CLI command to list all Blob stores in an account or map a name to its ID
  -- if a store's ID wasn't recorded at creation time, the Vercel dashboard (Storage tab)
  is the only way to find or delete it.
