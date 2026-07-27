# End-to-end check

Proves the codec works in a real Prisma Next project against a real database. The unit tests cannot:
they never go through `contract emit`, the DDL planner, or the query path — and that gap hid two live
bugs (see below).

`fixture/` is a real Prisma Next Postgres project that links this package via `link:../..`. CI runs the
whole thing on every push; see `.github/workflows/ci.yml`.

## What it checks

`assert-contract.mjs`, against the emitted `contract.json`:

- both planes record codec id `zod/json@1`, backed by `jsonb`
- the schema is stored as an opaque string, `additionalProperties: false` intact
- nested bounds and enum members survived

`fixture/live-write-validation.mts`, against the live database:

- a valid object writes
- seven invalid writes are each rejected **at encode**, naming their path — including
  `notifications.digestHour` and an undeclared key
- exactly one row was added: the rejected writes never landed
- the stored row reads back through decode

## The negative control

CI then flips the column to `validateOnWrite: false` and **requires the check to fail**. A test that
cannot fail proves nothing — and this one silently could not. It reported 8/8 with validation disabled,
which is how the transport bugs below were found.

## What that flushed out

`prisma-next contract emit` walks type params and drops every boolean `false`, recursively. Measured on
0.16.0 with probe values: `'off'`, `true` and `0` all survived; only `false` disappeared.

- `additionalProperties: false` was stripped out of the stored JSON Schema, so the rehydrated validator
  came back **loose** and the column silently accepted and persisted undeclared keys.
- `validateOnWrite: false` was dropped, so the documented opt-out did nothing.

Fixed by storing the schema as a JSON string the walk cannot descend into, and encoding the opt-out as
a truthy `writeValidation: 'off'` — so a marker lost in transit leaves validation on rather than off.

## Running it locally

```sh
docker run -d --name pnzj-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=pnzj -p 55434:5432 postgres:16-alpine
pnpm build                       # from the repo root; the fixture links to dist/

cd e2e/fixture
echo 'DATABASE_URL=postgresql://postgres:pg@localhost:55434/pnzj' > .env
pnpm install
pnpm emit && node ../assert-contract.mjs
pnpm db:init
pnpm check
```

Re-runnable: each run scopes its own ids and asserts on the row delta, so no truncation step and no
`psql` needed.

## Gotchas worth knowing

Each of these cost a debugging cycle:

- the column goes in as `field.column(zodJson(S))`, not `zodJson(S)` on its own
- `extensionPacks` belongs in the object the `defineContract` callback **returns**, beside `models` —
  not in `defineConfig`, which accepts it silently and ignores it
- the control-plane descriptor goes in `defineConfig({ extensions: [...] })`, and without it `db init`
  fails with `no expandNativeType hook is registered`
- the runtime descriptor goes in `postgres({ extensions: [...] })`, and without it client construction
  fails with `no contributor registered a codec descriptor`
- models hang off the namespace: `db.orm.public.Account`, not `db.orm.Account`
- `create(data)` takes the record directly, and reads are `all()`
