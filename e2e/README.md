# End-to-end check

Proves the codec works in a real Prisma Next project against a real database — the unit tests cannot,
because they never go through `contract emit`, the DDL planner, or the query path.

Not wired into `pnpm test`: it needs Postgres, a linked build, and a scratch project.

## What it proved

Run against `prisma-next@0.16.0` and Postgres 16:

- `contract emit` succeeds with a `zodJson` column, and both contract planes carry it — `domain` with
  codec id `zod/json@1` and the full JSON Schema in `typeParams`, `storage` with `nativeType: jsonb`,
  `version` and `validateOnWrite`
- `db init` creates the `settings jsonb` column
- a valid write succeeds
- four invalid writes are rejected **at encode**, each naming its path:

  ```
  theme                       → Invalid option: expected one of "light"|"dark"
  notifications.digestHour    → Too big
  tags                        → Too big: expected array to have <=5 items
  notifications               → Invalid input: expected object
  ```

- `SELECT count(*)` returns **1**. The rejected writes never reached the database — which is the whole
  claim this package makes over validating on read alone.

## Running it

```sh
docker run -d --name pnzj-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=pnzj -p 55433:5432 postgres:16-alpine

pnpm build
cd <a prisma-next postgres project>
pnpm link <path to this repo>
pnpm add zod
```

Copy `contract.example.ts` over `src/prisma/contract.ts` and `prisma-next.config.example.ts` over
`prisma-next.config.ts` — between them they show all three registrations. Then:

```sh
echo 'DATABASE_URL=postgresql://postgres:pg@localhost:55433/pnzj' > .env
pnpm contract:emit
npx prisma-next db init
npx tsx live-write-validation.mts
```

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
