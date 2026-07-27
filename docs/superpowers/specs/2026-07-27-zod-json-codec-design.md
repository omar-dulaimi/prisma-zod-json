# zod/json@1: a typed JSON column for Prisma Next, validated by zod

Design doc, written before implementation and kept as a record of the decisions and the measurements
behind them.

## What this is

A Prisma Next extension providing `zodJson(schema)`: a JSON column whose contents are described and
enforced by a zod schema. It is the zod counterpart to `@prisma-next/extension-arktype-json`.

Prisma named this slot themselves. From the arktype extension's README:

> "The unified CodecDescriptor model routes JSON-with-schema through per-library extension packages:
> arktype-json now, future **zod** / valibot extensions when each has a clean serialize / rehydrate
> story." … "parallel extensions (**`zod/json@1`**, `valibot/json@1`) when their serialize/rehydrate
> stories materialize."

The codec id is therefore `zod/json@1`, not a name of our choosing.

## Why it is buildable now

The stated prerequisite was a "clean serialize / rehydrate story". Zod 4.4.3 has both halves:
`z.toJSONSchema()` and `z.fromJSONSchema()`.

Measured on zod 4.4.3, across 41 constructs for serialisability and 28 for behaviour:

- **36/41 serialise.** The 5 that don't (`bigint`, `date`, `transform`, `map`, `set`) throw from
  `z.toJSONSchema()` with a clear message ("BigInt cannot be represented in JSON Schema").
- **24/28 keep their behaviour** through a full round-trip: `min`/`max`, `int`, `regex`, `email`,
  `uuid`, `url`, `iso.datetime`, `multipleOf`, enums, literals, tuples, records, intersections,
  discriminated unions, nested objects, defaults and `pipe` all survive intact.

That is a clean enough story to build on. The interesting part is the other four.

## Scope

In scope:

- `zodJson(schema)` column helper returning a `ColumnSpec`, used as `field.column(zodJson(S))`
- the `zod/json@1` codec descriptor: serialise to JSON Schema on author, rehydrate at runtime
- validation on **both** write and read (see below)
- pack + runtime exports so it registers like any other extension

Out of scope, deliberately:

- generating zod schemas for whole models from the contract: a different product, much larger
- non-Postgres targets: the native type is `jsonb`; other targets come later if wanted
- codec ids for other libraries

## The silent-drop problem: the reason this package is worth building

Four constructs round-trip **without throwing and without working**:

| construct | round-tripped result |
| --- | --- |
| `.refine(fn)` | check vanishes: `z.string().refine(s => s.startsWith('a'))` accepts `"zzz"` |
| `.superRefine(fn)` | same |
| object-level `.refine()` | `z.object({lo,hi}).refine(o => o.lo < o.hi)` accepts `{lo:5, hi:1}` |
| `.catch(v)` | fallback lost: the schema starts rejecting input it used to absorb |

`z.toJSONSchema()` emits a bare `{"type":"string"}` and reports nothing. Neither
`unrepresentable: 'throw'` nor `io: 'input' | 'output'` changes that, all three were tried and none
throws.

So the naive implementation of this package (serialise, rehydrate, validate) hands somebody a
column that enforces *nothing* of their refinement, and never says so. A validator that appears to
protect and does not is worse than no validator: it moves the error away from the code that caused it
and buys false confidence in between. Shipping that would be worse than shipping nothing.

**We detect it and refuse at authoring time.** Zod won't tell us, but its def tree will:
`_zod.def.checks[]._zod.def.check === 'custom'` marks a refinement, and `_zod.def.type === 'catch'`
marks a swallowed fallback. A recursive walk finds them wherever they are nested and reports the
path. `zodJson(z.object({ user: z.object({ slug: z.string().refine(isSlug) }) }))` fails on the spot
with `user.slug`, not silently at runtime.

Traversal follows these child keys, verified empirically rather than assumed: a missed branch is a
missed refinement, which is the whole bug:

`object.shape` · `array.element` · `union.options` · `intersection.{left,right}` ·
`tuple.{items,rest}` · `record.{keyType,valueType}` · `map.{keyType,valueType}` · `set.valueType` ·
`pipe.{in,out}` · `lazy.getter()` · and `innerType` for `optional`, `nullable`, `default`, `catch`,
`readonly`, `nonoptional`.

`lazy` makes the graph cyclic, so the walk carries a visited set.

Escape hatch: `zodJson(schema, { allowUnrepresentable: true })` for someone who knows a refinement is
belt-and-braces over a constraint that does survive. Explicit, per-column, and named so it cannot be
mistaken for a performance switch.

## The second place we deliberately differ from arktype-json

Its codec validates on read and not on write:

```ts
async encode(value, _ctx) { return serializeWire(value); }        // no validation
async decode(wire, _ctx)  { return decodeWireValue(schema, wire); } // validates
```

Its README concedes the consequence: "schema-invalid writes can commit before failing on read-back, a
footgun requiring TypeScript discipline or pre-validation".

TypeScript discipline does not survive `any`, a JSON body off an HTTP request, or a backfill script.
A validator that permits the bad write and fails the innocent read has put the error in the wrong
place, at the wrong time, for the wrong caller.

**We validate on encode as well as decode**, with `zodJson(schema, { validateOnWrite: false })` for
anyone who measures a hot path and wants the arktype behaviour. Default safe, opt out explicitly.

## Shape

```
src/
  core/
    representability.ts detector: walks the def tree for silently-dropped constraints
    zod-json-codec.ts   descriptor, codec class, zodJson() helper
    registry.ts         pack registration
    pack-meta.ts        id + version constants
  exports/
    column-types.ts     zodJson
    codecs.ts           descriptor
    codec-types.ts      type-level exports
    control.ts          control-plane pack
    pack.ts             default pack export
    runtime.ts          runtime descriptor
```

Mirrors the arktype extension's layout, because consumers register both the same way and matching
their structure keeps the wiring instructions identical.

## Data flow

**Authoring.** `zodJson(S)` runs `z.toJSONSchema(S)` and stores the result as `typeParams.jsonSchema`,
alongside `typeParams.version` for future migration. The params ride into `contract.json` with the
column.

**Runtime.** The descriptor's factory reads `typeParams.jsonSchema` and calls `z.fromJSONSchema()` to
rebuild a validator. The rehydrated schema is closure-captured by the codec instance.

**Write.** `encode(value)` validates unless disabled, then serialises to a JSON string for `jsonb`.

**Read.** `decode(wire)` parses if the wire value is a string, then validates.

## Errors

Validation failures raise the framework's runtime error with a stable code, carrying zod's issue list
flattened to a readable summary and the path of the first failure. Read and write failures are
distinguishable: a caller needs to know whether their input was bad or their stored data is.

## Testing

TDD throughout: a failing test before each behaviour.

- round-trip fidelity: schemas survive serialise → rehydrate with behaviour intact, across scalars,
  enums, optionals, nested objects, arrays, and refinements
- write validation rejects bad input, and does so *before* anything is serialised
- `validateOnWrite: false` restores the permissive behaviour, and is the only way to get it
- read validation rejects rows that no longer match the schema
- errors name the offending path
- the column helper produces a `ColumnSpec` satisfying `ColumnHelperFor`
- **every silently-dropped construct is caught**: top-level refine, nested refine, object-level
  refine, superRefine, catch: each reported with its path
- the walker reaches through every child-key branch listed above, one test per container type, so a
  refinement hidden in a tuple rest element or a `pipe` output is still found
- `lazy` recursion terminates
- constructs that zod itself rejects (`bigint`, `date`, `transform`, `map`, `set`) surface as our
  error with the path attached, not as a bare zod message
- `allowUnrepresentable: true` permits them, and is the only way to

An end-to-end test emits a contract from a real schema using the column and asserts the typeParams
land in `contract.json`.

## Risks

- **API churn.** `prisma-next` is 0.16.0 and ships upgrade codemods for every minor from 0.7 to 0.17.
  Mitigation: keep the surface thin, pin exact versions, expect to follow.
- **Silent drops**: measured and handled above; the detector is the mitigation, and the walker's
  completeness is what the tests must pin down. A construct zod adds later that we don't traverse is
  the way this regresses.
- **Codec id collision.** If Prisma ships their own `zod/json@1`, ours conflicts. Mitigation: it is the
  id they specified for this purpose; being early is the point, and the conversation with them is part
  of the plan.
