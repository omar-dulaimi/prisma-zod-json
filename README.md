# prisma-orm-extension-zod-json

[![CI](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/actions/workflows/ci.yml/badge.svg)](https://github.com/omar-dulaimi/prisma-orm-extension-zod-json/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/prisma-orm-extension-zod-json.svg)](https://www.npmjs.com/package/prisma-orm-extension-zod-json)

JSON columns validated by a [zod](https://zod.dev) schema: a
[Prisma 8 extension](https://www.prisma.io/docs/orm/v8/extensions/using-extensions) implementing the
`zod/json@1` codec.

An extension is a package that adds a database capability Prisma 8 does not have out of the box, while
keeping the Prisma 8 experience: typed schema declarations, generated TypeScript, migration support, and
query helpers that feel native to your app. Prisma's own catalog covers vector search (pgvector),
geospatial data (PostGIS), full-text search (ParadeDB), and arktype-validated JSON; this package adds
the zod half of typed JSON. Declare a `jsonb` column whose contents are described and enforced by a zod
schema:

```ts
const Settings = z.object({
  theme: z.enum(['light', 'dark']),
  notifications: z.object({ email: z.boolean(), digestHour: z.number().int().min(0).max(23).optional() }),
  tags: z.array(z.string()).max(5),
});

Account: model('Account', {
  fields: {
    id: field.id.uuidv7String(),
    settings: field.column(zodJson(Settings)),
  },
}),
```

The schema is serialised to JSON Schema when you author the column, travels in the contract, and is
rebuilt into a validator at runtime. Like every Prisma 8 extension it is one package with a registration
in the config and one on the client, and the bookkeeping exists to fail early: a contract that needs
this extension with a client that does not register it fails when the client is constructed, never at
query time with the extension half wired.

## 1. Install the package

```sh
npm install prisma-orm-extension-zod-json
```

`zod` ships as a regular dependency of this package. Your application needs
`@prisma/orm-postgres@8.0.0-rc.4`; this package's version always matches the Prisma release it targets
(see Versioning below), so keep the two aligned.

## 2. Register it in the config

Prisma 8 uses this registration when it emits your contract and plans migrations:

```ts
// prisma.config.ts
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-orm-extension-zod-json/control';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/contract.ts',
    extensions: [zodJsonExtensionDescriptor],
    db: { connection: process.env.DATABASE_URL! },
  }),
});
```

## 3. Register it on the client

Prisma 8 uses this registration when your app runs queries: it provides the codec that validates and
decodes your columns. Pass your emitted `Contract` type explicitly so the client is fully typed, not
`unknown`:

```ts
// src/prisma/db.ts
import postgres from '@prisma/orm-postgres/runtime';
import { zodJsonRuntimeDescriptor } from 'prisma-orm-extension-zod-json/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

export const db = postgres<Contract>({ contractJson, url, extensions: [zodJsonRuntimeDescriptor] });
```

## 4. Use it in your contract

This package targets contracts authored with the TypeScript builder. Add the pack in the object your
`defineContract` callback returns, next to `models`, then declare columns with `zodJson(schema)`:

```ts
import { defineContract } from '@prisma/orm-postgres/contract-builder';
import { zodJson } from 'prisma-orm-extension-zod-json/column-types';
import zodJsonPack from 'prisma-orm-extension-zod-json/pack';

export const contract = defineContract({}, ({ field, model }) => ({
  extensions: { zodJson: zodJsonPack },
  models: {
    Account: model('Account', {
      fields: {
        id: field.id.uuidv7String(),
        settings: field.column(zodJson(Settings)),
      },
    }),
  },
}));
```

## 5. Apply and query

```sh
npx prisma contract emit
npx prisma db init
```

`contract emit` stores the JSON Schema in `contract.json` and renders the column's TypeScript type into
`contract.d.ts`. `db init` (or `db update` on an existing database) creates the `jsonb` column. From
there every write and read of the column validates against the schema, and a missing registration
surfaces as a clear error naming what is absent, not silent misbehaviour.

## Two things this does differently

### It validates writes

`arktype/json@1` validates on `decode` only. Its README is candid about the consequence: "schema-invalid
writes can commit before failing on read-back: a footgun requiring TypeScript discipline or
pre-validation".

Discipline does not survive `any`, a JSON body off an HTTP request, or a backfill script. A validator
that admits the bad write and fails the innocent read has put the error in the wrong place, at the wrong
time, in front of the wrong caller.

This codec validates on the way in as well as the way out:

```
create({ settings: { ...good, notifications: { email: true, digestHour: 99 } } })
→ zod/json schema validation failed (encode) at `notifications.digestHour`: Too big
```

The row never reaches the database. Pass `zodJson(schema, { validateOnWrite: false })` if you have
measured a hot path and want the permissive behaviour.

### It refuses schemas that JSON Schema would quietly break

Zod throws for constructs it cannot represent: `bigint`, `date`, `.transform()`, `Map`, `Set`. It does
**not** throw for these, which serialise cleanly and then stop working:

| construct | what happens after a round-trip |
| --- | --- |
| `.refine(fn)` / `.superRefine(fn)` | check vanishes: `z.string().refine(s => s.startsWith('a'))` accepts `"zzz"` |
| object-level `.refine()` | `z.object({lo,hi}).refine(o => o.lo < o.hi)` accepts `{lo:5, hi:1}` |
| `.catch(v)` | fallback lost; the schema starts rejecting input it used to absorb |
| `.trim()` / `.toLowerCase()` / `.normalize()` | keeps accepting the value, silently stops rewriting it |

Neither `unrepresentable: 'throw'` nor the `io` option reports them. So this package walks the schema
itself and refuses at authoring time:

```
zodJson(schema): this schema cannot be represented in JSON Schema without losing behaviour.
  • user.slug: a refinement (.refine/.superRefine), which would silently stop being enforced
Zod does not report these: they serialise without error and stop being enforced.
Express the rule with a constraint that survives (min/max, regex, enum, multipleOf, and the string
formats all do), apply it outside the column, or pass { allowUnrepresentable: true } to accept the loss.
```

## What survives

Measured against zod 4.4.3. These keep their behaviour exactly:

`min` · `max` · `length` · `int` · `multipleOf` · `regex` · `startsWith` · `endsWith` · `email` · `uuid`
· `url` · `iso.datetime` · enums · literals · objects · nested objects · arrays and their bounds ·
tuples (with rest) · unions · discriminated unions · intersections · records · `optional` · `nullable` ·
`default` · `pipe`

## One deliberate difference

Zod's default object mode **strips** unknown keys. JSON Schema can say "forbid"
(`additionalProperties: false`) or "allow" (`additionalProperties: {}`), but has no way to say "allow in,
drop from output", so a round-tripped `z.object()` **rejects** unknown keys instead of stripping them.

That is kept rather than refused, because refusing the most common construct in the language would make
the package unusable, and because it fails in the safe direction: a loud error at the write boundary
instead of silent data loss. Use `z.strictObject()` or `z.looseObject()` and the behaviour round-trips
exactly.

## Emitted types

`renderOutputType` builds a TypeScript type from the stored JSON Schema, so a column reads as
`{ theme: "light" | "dark"; tags: Array<string> }` rather than `unknown`. Anything it cannot name renders
as `unknown`: a wrong type is worse than an honest one.

## Versioning and status

Versions mirror the Prisma release this package targets, the same convention Prisma's own extensions
use: installing `prisma-orm-extension-zod-json@8.0.0-rc.4` gets you the build for Prisma `8.0.0-rc.4`.
A fix released between Prisma versions appends a counter (`8.0.0-rc.4.1`), which semver orders after
its base and before the next Prisma release.

Early; tracks the Prisma v8 release-candidate line, which is still moving.
