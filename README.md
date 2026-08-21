# prisma-zod-json

[![CI](https://github.com/omar-dulaimi/prisma-zod-json/actions/workflows/ci.yml/badge.svg)](https://github.com/omar-dulaimi/prisma-zod-json/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/prisma-zod-json.svg)](https://www.npmjs.com/package/prisma-zod-json)

Typed JSON columns for [Prisma](https://github.com/prisma/prisma), described and enforced by
[zod](https://zod.dev). Implements the `zod/json@1` codec.

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
rebuilt into a validator at runtime.

## Install

```sh
npm install prisma-zod-json zod
```

Requires `@prisma/orm-postgres@8.0.0-rc.4` (or another Prisma v8 RC Postgres target). `zod` is bundled
as a regular dependency, not something you install separately.

## Registration

Three planes, three registrations. All three are needed: the contract plane to author the column, the
control plane to create the table, the runtime plane to read and write it.

**Contract**: in the object your `defineContract` callback returns, next to `models`:

```ts
import zodJsonPack from 'prisma-zod-json/pack';

export const contract = defineContract({}, ({ field, model }) => ({
  extensions: { zodJson: zodJsonPack },
  models: { /* … */ },
}));
```

**Control**: in `prisma.config.ts`, so `db init` and migrations know the column:

```ts
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-zod-json/control';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/contract.ts',
    extensions: [zodJsonExtensionDescriptor],
    db: { connection: process.env.DATABASE_URL! },
  }),
});
```

**Runtime**: where you construct the client:

```ts
import { zodJsonRuntimeDescriptor } from 'prisma-zod-json/runtime';

export const db = postgres({ contractJson, url, extensions: [zodJsonRuntimeDescriptor] });
```

Miss one and you get a clear error naming what is absent, not silent misbehaviour.

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

## Status

Early. Tracks the Prisma v8 release-candidate line (currently `8.0.0-rc.4`); still moving.
