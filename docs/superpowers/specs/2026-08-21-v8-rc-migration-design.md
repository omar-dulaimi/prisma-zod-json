# zod/json@1 on Prisma v8: the rc.4 migration

Design doc, written before implementation and kept as a record of the decisions and the measurements
behind them. Companion to
[`2026-07-27-zod-json-codec-design.md`](./2026-07-27-zod-json-codec-design.md), whose own Risks section
anticipated exactly this: "API churn... keep the surface thin, pin exact versions, expect to follow."

## What this is

`prisma-next-zod-json` and its consumer `prisma-next-zod-json-example` currently target
`@prisma-next/*@0.16.0`, a scope that stopped publishing at 0.17.0. This migrates both to the
`@prisma/*` v8 release-candidate line, landing on `8.0.0-rc.4` (current `latest`), the unified `prisma`
CLI, and `prisma.config.ts`.

## Why rc.4, not 0.17.0

0.17.0 is confirmed the last-ever 0.x release; all further development is on the `8.0.0-rc.N` line
toward v8 GA. Stopping at 0.17.0 would mean a second migration later for the CLI/config unification that
starts at rc.2. Going straight to rc.4 costs nothing extra on the codec side: measured below, the
codec-authoring interface is byte-identical between 0.17.0 and rc.4.

## Ground truth (confirmed, not inferred)

Everything below was measured against the real, currently-published packages — `npm view`, `npm pack`,
and reading compiled output plus source maps — not read off release-note prose. Release notes describe
intent; package contents are what actually ships.

- **The codec-authoring interface did not move.** `@prisma/orm-extension-arktype-json` (Prisma's own
  reference extension — "the template" this package already follows) is byte-identical between `0.17.0`
  and `8.0.0-rc.4` (`dist/` diff, zero changes). Its `package.json` exports six subpaths — `codec-types`,
  `codecs`, `column-types`, `control`, `pack`, `runtime` — the same six this package already has.
- **`nativeType: 'jsonb'`** is still the literal string a codec self-declares for its Postgres storage
  type. Unchanged.
- **The "lossless JSON form" the 0.17.0 notes describe is `encodeJson`/`decodeJson`** on the codec class.
  It is not a new interface: our `ZodJsonCodecClass` already implements both
  (`src/core/zod-json-codec.ts:158-165`), and both already thread `validateOnWrite` the same way
  `encode`/`decode` do. This significantly de-risks the migration: there is no new logic to write here,
  only imports to rename and a regression test to lock in that it stays correct.
- **The contract-plane key really is renamed.** `extensionPacks` → `extensions`, confirmed in
  `@prisma/orm-framework`'s contract types. Control-plane was already spelled `extensions` — only the
  contract-plane key changes.
- **`definePrismaConfig<T>(config: T): T & {$prismaConfig: number}`** — confirmed exact signature, from
  `@prisma/cli-engine@8.0.0-rc.2`. A passthrough wrapper; `defineConfig` is now a deprecated alias of it.
- **The extension-author peer dependency is `@prisma/orm-target-postgres`, not `@prisma/orm-postgres`** —
  the latter is the consumer-facing "one package per app" facade from 0.17.0's namespace release, a
  sibling package. This corrects a plausible misreading of the release notes' own generic example.
- **The whole multi-package peer surface collapses to one peer.** `@prisma/orm-extension-arktype-json@8.0.0-rc.4`'s
  actual manifest:

  ```json
  "peerDependencies": { "@prisma/orm-target-postgres": "8.0.0-rc.4", "typescript": ">=5.9" },
  "peerDependenciesMeta": { "typescript": { "optional": true } },
  "dependencies": {
    "@prisma/orm-family-sql": "8.0.0-rc.4",
    "@prisma/orm-framework": "8.0.0-rc.4",
    "@standard-schema/spec": "^1.1.0",
    "arktype": "~2.2.2"
  }
  ```

  Six separate `@prisma-next/*` peers today become one (`@prisma/orm-target-postgres`); several more
  peer packages (`contract`, `contract-authoring`, `sql-relational-core`, `sql-runtime`, `sql-contract`)
  are now transitive `dependencies` of `@prisma/orm-family-sql` and `@prisma/orm-framework`, not things a
  consumer installs separately. And **`arktype` is a regular `dependency`, not a peer** — the analogous
  move for us is `zod` out of `peerDependencies` and into `dependencies`.
- **Every import site's new location**, read directly from the reference extension's compiled output and
  source-mapped `.d.mts` files:

  | current (0.16.0) | file:line here | confirmed rc.4 replacement |
  |---|---|---|
  | `@prisma-next/sql-relational-core/codec-descriptor-registry` | `registry.ts:1` | `@prisma/orm-family-sql/relational-core/codec-descriptor-registry` |
  | `@prisma-next/sql-relational-core/query-lane-context` (type) | `registry.ts:2` | `@prisma/orm-family-sql/relational-core/query-lane-context` |
  | `@prisma-next/contract/types` (type) | `zod-json-codec.ts:8` | `@prisma/orm-framework/contract/types` |
  | `@prisma-next/framework-components/codec` | `zod-json-codec.ts:9-18` | `@prisma/orm-framework/components/codec` |
  | `@prisma-next/framework-components/runtime` | `zod-json-codec.ts:19` | `@prisma/orm-framework/components/runtime` |
  | `@prisma-next/family-sql/control` (type) | `control.ts:13` | `@prisma/orm-family-sql/family/control` (note the extra `/family` segment) |
  | `@prisma-next/sql-runtime` (type) | `runtime.ts:8` | `@prisma/orm-family-sql/runtime` |

  One import in the reference has no current analog in our code: the arktype codec module also imports
  `@prisma/orm-target-postgres/target/codec-descriptor`, which nothing in our 0.16.0 `zod-json-codec.ts`
  corresponds to. Flagged as an open item below rather than assumed away.

## Approach

Considered three; going with the first.

1. **Clean single-major cutover to rc.4 (chosen).** Mechanical port guided directly by the reference
   extension's confirmed source, one breaking release, both repos together.
2. **Dual-track compatibility** (support 0.16.0 and rc.4 at once). Rejected: the package is about four
   weeks old with one real consumer, the example app; two codepaths would serve nobody yet.
3. **Stepping-stone through 0.17.0 first.** Rejected: would have been the safer play if the codec
   interface still looked like it might move. Now that it's confirmed byte-identical across the whole
   0.17.0→rc.4 span, the extra release buys little.

Pin exact `8.0.0-rc.4` versions, not a caret or `next` dist-tag: the release notes warn a future respin
can still remove or rename APIs, and there is no promise rc.4 is the last one before GA.

## Scope

In scope: `prisma-next-zod-json` (all three registration planes, `package.json`, CI, README), and
`prisma-next-zod-json-example` (config, dependency, its own CI) — both shipped together.

Out of scope: anything not already out of scope in the original design doc (non-Postgres targets,
whole-model schema generation). Not attempting to auto-track rc.5+: a future respin is a follow-up when
it happens, not open-ended maintenance absorbed into this change.

## Design by plane

**Contract plane.** `extensionPacks: { zodJson: pack }` → `extensions: { zodJson: pack }`, in the
`defineContract` callback's return (currently `e2e/fixture/src/prisma/contract.ts:25`, and the analogous
line in the example app). Pack shape itself
(`kind/id/familyId/targetId/version/capabilities/types.codecTypes/types.storage`) is unchanged —
`pack-meta.ts` needs only its imports' transitive types to keep resolving, no shape change.

**Control plane.** Two independent changes that happen to land together:

- Import rename per the table above (`control.ts:13`).
- Config file: `prisma-next.config.ts` (flat `defineConfig` from `@prisma-next/postgres/config`) →
  `prisma.config.ts` using `definePrismaConfig({ orm: ormConfig({...}) })`, importing
  `definePrismaConfig` from `@prisma/cli-engine` and the postgres-specific `defineConfig` (aliased
  `ormConfig`) from whatever subpath `@prisma/orm-target-postgres` exposes for config (mirrors the old
  `@prisma-next/postgres/config` pattern; confirm the exact rc.4 subpath the same way the table above was
  built — the reference extension doesn't need this since it isn't itself an app, so this one needs its
  own lookup against `@prisma/orm-target-postgres`'s export map). Applies to both
  `e2e/fixture/prisma-next.config.ts` and the example app's root config.

**Runtime plane.** Import rename per the table above (`runtime.ts:8`). `zod-json-codec.ts`'s
`encodeJson`/`decodeJson` (confirmed already correct, see Ground truth) get a regression test, not new
logic.

**Native type.** Keep `nativeType: 'jsonb'` (confirmed unchanged). Add an e2e assertion that the physical
Postgres column type really is `jsonb` post-migration — this package's whole purpose is jsonb-backed
validation, and 0.17.0 changed what the bare `Json` scalar means; verify rather than assume.

## Package changes

`package.json` peerDependencies collapse from six `@prisma-next/*` entries to one:

```json
"peerDependencies": { "@prisma/orm-target-postgres": "8.0.0-rc.4", "typescript": ">=5.9" },
"peerDependenciesMeta": { "typescript": { "optional": true } },
"dependencies": {
  "@standard-schema/spec": "^1.1.0",
  "zod": "^4.1.0"
}
```

`zod` moves from peer to dependency, mirroring `arktype`'s treatment in the reference. `devDependencies`
gets `@prisma/orm-target-postgres` pinned to exact `8.0.0-rc.4` (matching the reference's own
`devDependencies` pattern) plus whatever `@prisma/cli-engine`-provided binary the e2e fixture's scripts
need — see CLI/CI below.

## CLI / CI / tooling

`e2e/fixture/package.json` scripts currently shell into the retired binary:

```json
"emit": "prisma-next contract emit",
"db:init": "prisma-next db init"
```

Move to the unified `prisma` CLI's equivalents (confirm exact subcommand spelling during implementation;
the release notes' own before/after examples suggest the subcommand names carry over unchanged, only the
binary name changes). `e2e/fixture/package.json`'s nine separate `@prisma-next/*` dependencies also
collapse — per 0.17.0, "an application depends on exactly one database facade" (`@prisma/orm-postgres`
for a consumer, not the extension-author-only `@prisma/orm-target-postgres`) plus whatever extension
packs it uses; the fixture is an application, so it gets the bigger simplification. Same treatment for
the example app's `package.json` and its `prisma-next@0.16.0` binary dependency.

`.github/workflows/ci.yml`: dependency versions follow from `package.json`; the e2e job's CLI invocations
follow from the fixture scripts above; `verify:package` (entrypoint resolution) is structural and
shouldn't need changes, but gets re-verified since the `exports` map itself is unchanged. `release.yml`
is unaffected mechanically — same semantic-release pipeline ships the breaking-change major.

## Testing

- Unit: existing coverage (42-construct representability sweep, round-trip fidelity, write-validation
  tests) preserved unchanged in behavior — this is zod/JSON-Schema logic, not Prisma-version-coupled, so
  the migration shouldn't touch it beyond import fixes in the test harness itself.
- New: round-trip unit tests for `encodeJson`/`decodeJson` specifically (JS value → `encodeJson` →
  `JsonValue` → `decodeJson` → JS value), including the same refine/catch/trim edge cases the
  representability detector already knows are dangerous. This locks in that the JSON path doesn't
  quietly diverge from the wire path now that it's exercised by the ORM's relation-loading, not just by
  our own tests.
- e2e: real Postgres, real `8.0.0-rc.4` install. Update the negative-control fixtures (wrong-plane
  placement still fails correctly) to the renamed `extensions` key. Add the physical-`jsonb`-column
  assertion (see Native type above).
- Example app: its own `test/columns.test.ts` and CI updated to match; sequenced after the library
  publishes (it consumes the published version, not a workspace link, matching how it already works).
- Full suite green, every test file, before considering this done, not just the curated `pnpm test` list.

## Versioning / release

Confirmed in `.releaserc.json`: `{ "scope": "breaking", "release": "major" }`. One commit scoped
`breaking` through the existing semantic-release pipeline takes the package from `0.1.1` to `1.0.0`.
Library releases first; the example app's follow-up PR bumps its `prisma-next-zod-json` dependency
against the newly *published* version, same pattern as the original 0.16.0 buildout.

## Open items for the implementation plan

Small and bounded; none of them block writing the plan itself:

- Exact `@prisma/orm-target-postgres` subpath for the postgres-specific config builder (the `ormConfig`
  half of `definePrismaConfig({ orm: ormConfig({...}) })`) — same kind of lookup as the import table
  above, just against a different package.
- What `@prisma/orm-target-postgres/target/codec-descriptor` is, and whether our codec needs it too or
  it's arktype-specific.
- Exact unified-CLI subcommand spelling for `contract emit` / `db init`.

## Risks

- **Another respin before GA.** The release notes explicitly don't promise rc.4 is the last one.
  Mitigation: exact-pinned versions (not ranges), and the fact that the codec-authoring interface has
  already proven stable across four RCs plus 0.17.0 is a real, if not absolute, signal it's settling.
- **The one unmapped import** (`@prisma/orm-target-postgres/target/codec-descriptor`). If it turns out to
  be required and not arktype-specific, it's a small addition, not a redesign — the codec class already
  has everything else it needs.
- **The e2e job needs real infrastructure** (Postgres plus a real rc.4 install) to prove any of this
  actually works, not just typechecks. Already true today of the existing e2e job; nothing new, just
  re-pointed at a different dependency set.
