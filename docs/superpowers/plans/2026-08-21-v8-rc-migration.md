# v8 rc.4 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `prisma-next-zod-json` and `prisma-next-zod-json-example` from `@prisma-next/*@0.16.0` to the `@prisma/*@8.0.0-rc.4` line (plus the unified `prisma` CLI), landing both repos at a green, PR-ready state.

**Architecture:** Mechanical port guided by Prisma's own `@prisma/orm-extension-arktype-json` reference extension, whose rc.4 source was read directly (compiled output + `.d.mts`) rather than inferred. No new business logic — the codec's validation/encode/decode behavior is unchanged; what changes is import paths, one descriptor base class, one config file shape, and the CLI binary name.

**Tech Stack:** TypeScript, zod 4, vitest, tsdown, pnpm, `@prisma/orm-target-postgres` + `@prisma/orm-family-sql` + `@prisma/orm-framework` (library), `@prisma/orm-postgres` + `prisma` CLI (fixture/example app consumers), real Postgres for e2e.

**Spec:** `docs/superpowers/specs/2026-08-21-v8-rc-migration-design.md`

## Global Constraints

- Exact-pin every `@prisma/orm-*` package to `8.0.0-rc.4` (not a caret, not `next`) — confirmed current/latest for all of them, but a respin can still happen and ranges would silently pull it in.
- The `prisma` CLI dependency (fixture + example app only, never the library) pins to whatever exact version `next` resolves to at the time each task runs — re-check with `npm view prisma@next version`, don't assume it's still `8.0.0-rc.7`.
- `zod` moves from `peerDependencies` to `dependencies` in the library's `package.json`, mirroring how the reference extension treats `arktype`.
- No behavior change to validation/encode/decode logic anywhere in this plan. Every code change is either an import path, the descriptor's base class/shape, a config file's shape, or a CLI binary name.
- Full test suite green (unit + e2e against real Postgres) before any task is considered done — not typecheck alone.
- Commit messages that should trigger the eventual major release use `scope: breaking` (confirmed in `.releaserc.json`: `{ "scope": "breaking", "release": "major" }`) — put it on the final commit of the library's change set, not on intermediate WIP commits.

---

## File Structure

**Library (`prisma-next-zod-json`):**
- Modify: `package.json` — dependency shape
- Modify: `src/core/registry.ts` — import + `definePostgresCodecs` wrapper
- Modify: `src/core/zod-json-codec.ts` — imports + descriptor base class
- Modify: `src/exports/control.ts` — import only
- Modify: `src/exports/runtime.ts` — import only
- Modify: `test/codec.test.ts` — fill the `decodeJson`/round-trip gap
- Modify: `README.md` — registration examples, Install, Status
- Modify: `e2e/fixture/package.json` — dependency collapse, script rename
- Rename+modify: `e2e/fixture/prisma-next.config.ts` → `e2e/fixture/prisma.config.ts`
- Modify: `e2e/fixture/src/prisma/contract.ts` — import + `extensions` key
- Modify: `e2e/fixture/live-write-validation.mts` — import only

**Example app (`prisma-next-zod-json-example`, sibling repo at `~/projects/prisma-next-zod-json-example`):**
- Modify: `package.json` — dependency collapse, temporary local link for validation, then registry range
- Rename+modify: `prisma-next.config.ts` → `prisma.config.ts`
- Modify: whatever in `src/{db,seed,server,tour}.ts` imports the old packages (confirm exact lines in Task 9)
- Modify: `test/columns.test.ts` if it imports old packages (confirm in Task 9)

No files not listed above need to change: `pack-meta.ts`, `serialize.ts`, `render-output-type.ts`, `representability.ts`, and every `src/exports/*` file except `control.ts`/`runtime.ts` have zero `@prisma-next` imports (confirmed by exhaustive grep) and no shape dependency on the descriptor change.

---

### Task 1: Fill the `decodeJson` test gap

Pure test addition against the **current, unmigrated** code. No version dependency — this locks in behavior before anything else changes, so if the later migration breaks it, that's an unambiguous regression signal.

`test/codec.test.ts` currently tests `encode`/`decode` thoroughly and has exactly one `encodeJson` test (encode-side validation). `decodeJson` has zero coverage, and nothing proves `encodeJson`/`decodeJson` round-trip a value or that `validateOnWrite: false` affects `encodeJson` the same way it affects `encode`.

**Files:**
- Modify: `test/codec.test.ts`

**Interfaces:**
- Consumes: `zodJsonDescriptor.factory(params)(ctx)` (existing `codecFor` helper in the same file), `toTypeParams` from `../src/core/serialize.js`
- Produces: nothing new for later tasks — this is a leaf test file

- [ ] **Step 1: Write the failing-then-passing tests**

Add to `test/codec.test.ts`, inside the existing `describe('encode validates before writing', ...)` block is the wrong home (that block is encode-only) — add two new `describe` blocks instead, placed after the existing `describe('decode validates what comes back', ...)` block (after line 98):

```ts
describe('encodeJson / decodeJson round-trip (the lossless JSON path)', () => {
  test('a value survives encodeJson then decodeJson unchanged', () => {
    const codec = codecFor(Profile);

    const json = codec.encodeJson({ name: 'Ada', age: 36 });
    expect(codec.decodeJson(json)).toEqual({ name: 'Ada', age: 36 });
  });

  test('decodeJson rejects a value the schema forbids', () => {
    const codec = codecFor(Profile);

    expect(() => codec.decodeJson({ name: 'x', age: 36 })).toThrow(/decode/);
  });

  test('decodeJson names the offending path', () => {
    const codec = codecFor(Profile);

    expect(() => codec.decodeJson({ name: 'Ada', age: -1 })).toThrow(/age/);
  });
});

describe('encodeJson / decodeJson respect validateOnWrite: false the same way encode/decode do', () => {
  // Stored as a truthy 'off', not false: the contract emitter drops boolean false.
  const params = { ...toTypeParams(Profile), writeValidation: 'off' as const };

  test('encodeJson lets an invalid value through when write validation is off', () => {
    const codec = codecFor(Profile, params);

    expect(codec.encodeJson({ name: 'x', age: -1 } as never)).toEqual({ name: 'x', age: -1 });
  });

  test('decodeJson still validates, so the data is checked somewhere', () => {
    const codec = codecFor(Profile, params);

    expect(() => codec.decodeJson({ name: 'x', age: -1 })).toThrow(/decode/);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test`
Expected: PASS, all of them, including the five new ones — this is proving existing behavior, not building new behavior, so red-then-green doesn't apply here the way it would for new logic. If any of the five fail, that's a real bug in the *current* code, not a migration artifact — stop and investigate before proceeding to Task 2.

- [ ] **Step 3: Commit**

```bash
git add test/codec.test.ts
git commit -m "test: cover decodeJson and the encodeJson/decodeJson round-trip

encodeJson had one test (encode-side validation only); decodeJson had
none. Locks in the lossless-JSON-path behavior before the v8 rc.4
migration touches the descriptor's base class."
```

---

### Task 2: Migrate `package.json` to the rc.4 dependency shape

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: the dependency set every later task's imports resolve against.

- [ ] **Step 1: Edit the dependency blocks**

Replace `peerDependencies`, `dependencies`, and the `@prisma-next/*` entries in `devDependencies`:

```json
"dependencies": {
  "@prisma/orm-family-sql": "8.0.0-rc.4",
  "@prisma/orm-framework": "8.0.0-rc.4",
  "@standard-schema/spec": "^1.1.0",
  "zod": "^4.1.0"
},
"peerDependencies": {
  "@prisma/orm-target-postgres": "8.0.0-rc.4",
  "typescript": ">=5.9"
},
"peerDependenciesMeta": {
  "typescript": { "optional": true }
},
"devDependencies": {
  "@prisma/orm-target-postgres": "8.0.0-rc.4",
  "@semantic-release/changelog": "^6.0.3",
  "@semantic-release/commit-analyzer": "^13.0.1",
  "@semantic-release/git": "^10.0.1",
  "@semantic-release/github": "^12.0.9",
  "@semantic-release/npm": "^13.1.5",
  "@semantic-release/release-notes-generator": "^14.1.1",
  "@types/node": "22.19.0",
  "conventional-changelog-conventionalcommits": "^9.3.1",
  "semantic-release": "^25.0.8",
  "tsdown": "0.22.8",
  "typescript": "5.9.3",
  "vitest": "4.1.10",
  "zod": "4.4.3"
}
```

This drops `@prisma-next/contract`, `@prisma-next/contract-authoring`, `@prisma-next/family-sql`, `@prisma-next/framework-components`, `@prisma-next/sql-contract`, `@prisma-next/sql-relational-core`, `@prisma-next/sql-runtime` entirely — none of them are peers or deps of the reference extension at rc.4; what they provided is now reached transitively through `@prisma/orm-target-postgres`'s own dependency tree (`@prisma/orm-family-sql`, `@prisma/orm-framework`).

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: resolves cleanly, lockfile updates. If `@prisma/orm-target-postgres@8.0.0-rc.4` fails to resolve, re-check `npm view @prisma/orm-target-postgres versions` — the package may have moved; do not silently substitute a different version without updating the spec.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: move dependencies to the @prisma/* v8 rc.4 line

Six @prisma-next/* peers collapse to one (@prisma/orm-target-postgres);
zod moves from peerDependencies to dependencies, mirroring how the
reference arktype-json extension treats arktype. Source still imports
the old packages at this point - typecheck is expected to fail until
Task 3."
```

---

### Task 3: Migrate core source to rc.4 imports and the new descriptor base class

This is the task with real (if fully-determined) structural change: the descriptor no longer extends the generic `CodecDescriptorImpl` — it extends `PostgresCodecDescriptor`, loses its `meta` object in favor of a `nativeType()` method, and gains a `jsonProjection()` method. Every detail below is read directly from `@prisma/orm-extension-arktype-json@8.0.0-rc.4`'s compiled output and `.d.mts`, not inferred.

**Files:**
- Modify: `src/core/registry.ts`
- Modify: `src/core/zod-json-codec.ts`
- Modify: `src/exports/control.ts`
- Modify: `src/exports/runtime.ts`

**Interfaces:**
- Consumes: `ProjectionExpr` (type, new) from `@prisma/orm-family-sql/relational-core/ast`; `PostgresCodecDescriptor`, `definePostgresCodecs` (new) from `@prisma/orm-target-postgres/target/codec-descriptor`.
- Produces: `ZOD_JSON_CODEC_ID`, `zodJsonDescriptor`, `zodJson()`, `codecDescriptors` — same names, same call signatures as before (Task 1's tests and every other consumer depend on this not changing).

- [ ] **Step 1: `src/core/registry.ts` — full replacement**

```ts
import { buildCodecDescriptorRegistry } from '@prisma/orm-family-sql/relational-core/codec-descriptor-registry';
import type { CodecDescriptorRegistry } from '@prisma/orm-family-sql/relational-core/query-lane-context';
import { codecDescriptors } from './zod-json-codec.js';

/**
 * Every codec descriptor shipped by this package: currently just `zod/json@1`.
 *
 * Kept in the same registry shape the other codec-shipping packages use, so consumers do not have to
 * special-case extensions.
 */
export const zodJsonCodecRegistry: CodecDescriptorRegistry =
  buildCodecDescriptorRegistry(codecDescriptors);
```

Only the two import specifiers changed from the current file.

- [ ] **Step 2: `src/core/zod-json-codec.ts` — targeted edits**

Change the import block (current lines 8-19):

```ts
import type { JsonValue } from '@prisma/orm-framework/contract/types';
import type { ProjectionExpr } from '@prisma/orm-family-sql/relational-core/ast';
import {
  type AnyCodecDescriptor,
  type CodecCallContext,
  CodecImpl,
  type CodecInstanceContext,
  type ColumnHelperFor,
  type ColumnSpec,
  column,
} from '@prisma/orm-framework/components/codec';
import { PostgresCodecDescriptor, definePostgresCodecs } from '@prisma/orm-target-postgres/target/codec-descriptor';
import { runtimeError } from '@prisma/orm-framework/components/runtime';
```

Note `CodecDescriptorImpl` is dropped from this import (no longer used) and `PostgresCodecDescriptor` + `definePostgresCodecs` are added from the new package. `CodecImpl` stays — the codec **class** doesn't change base class, only the descriptor does.

Replace the `ZodJsonDescriptor` class (current lines 175-193):

```ts
export class ZodJsonDescriptor extends PostgresCodecDescriptor<ZodJsonParams> {
  protected override nativeType(): string {
    return ZOD_JSON_NATIVE_TYPE;
  }

  /** Both this codec and its arktype counterpart are already JSON-shaped, so projection is identity. */
  protected override jsonProjection(expression: ProjectionExpr): ProjectionExpr {
    return expression;
  }

  override readonly codecId = ZOD_JSON_CODEC_ID;
  override readonly traits = ['equality'] as const;
  override readonly targetTypes = [ZOD_JSON_NATIVE_TYPE] as const;
  override readonly paramsSchema: StandardSchemaV1<ZodJsonParams> = paramsSchema;

  override renderOutputType(params: ZodJsonParams): string {
    return renderOutputType(parseJsonSchema(params));
  }

  override factory(params: ZodJsonParams): (ctx: CodecInstanceContext) => ZodJsonCodecClass<unknown> {
    const schema = rehydrate(params);
    const validateOnWrite = params.writeValidation !== 'off';
    return () => new ZodJsonCodecClass<unknown>(this, schema, validateOnWrite);
  }
}
```

Removed entirely: the `override readonly meta = ZOD_JSON_META;` line, and (a few lines above the class, near the other top-level `const`s) the now-unused `const ZOD_JSON_META = { db: { sql: { postgres: { nativeType: ZOD_JSON_NATIVE_TYPE } } } } as const;` — delete that declaration too, it has no remaining reference.

Replace the final export line (current line 241):

```ts
export const codecDescriptors = definePostgresCodecs([zodJsonDescriptor]);
```

(Drops the `readonly AnyCodecDescriptor[]` type annotation — `AnyCodecDescriptor` becomes unused; remove it from the import list in Step 2 above if your editor doesn't flag it automatically. `definePostgresCodecs`'s return type is what downstream consumers see now, matching the reference exactly.)

- [ ] **Step 3: `src/exports/control.ts` — import only**

Change line 13's import source from `@prisma-next/family-sql/control` to `@prisma/orm-family-sql/family/control` (note the extra `/family` path segment — this is not `@prisma/orm-family-sql/control`). Nothing else in this file changes.

- [ ] **Step 4: `src/exports/runtime.ts` — import only**

Change line 8's import source from `@prisma-next/sql-runtime` to `@prisma/orm-family-sql/runtime`. Nothing else in this file changes.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If `jsonProjection`'s parameter type mismatches, double check `ProjectionExpr` is imported as a type-only import (it's used only in a type position) — a value-space import would fail differently and less clearly.

- [ ] **Step 6: Full unit suite**

Run: `pnpm test`
Expected: PASS, including Task 1's five new tests and every pre-existing test. `test/pack.test.ts` and the `targetTypes`/`codecId` assertions in `test/codec.test.ts` exercise the pack shape and descriptor identity respectively — both are confirmed unchanged in shape, so no test file besides `test/codec.test.ts` (Task 1) should need edits. If something else fails, it's telling you a shape assumption in this plan was wrong — stop and re-verify against the reference rather than patching the test to match.

- [ ] **Step 7: Build**

Run: `pnpm build`
Expected: PASS — this is the tsdown bundling step; a passing typecheck doesn't guarantee a passing bundle if an export got dropped.

- [ ] **Step 8: Commit**

```bash
git add src/core/registry.ts src/core/zod-json-codec.ts src/exports/control.ts src/exports/runtime.ts
git commit -m "feat(breaking): migrate the codec to the rc.4 descriptor shape

ZodJsonDescriptor now extends PostgresCodecDescriptor instead of the
generic CodecDescriptorImpl - the meta object is replaced by a
nativeType() method, and a new jsonProjection() method is required
(implemented as identity, matching the reference arktype-json
extension - both codecs are already JSON-shaped). registry.ts wraps
its descriptor array in definePostgresCodecs(). No behavior change:
encode/decode/encodeJson/decodeJson are untouched."
```

Note the `scope: breaking` — this is the commit that actually changes the package's peer contract; per Global Constraints, this triggers the major bump when it eventually reaches `main`.

---

### Task 4: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the registration examples**

In the "Registration" section, change the contract-plane example (current lines 42-49):

```ts
import zodJsonPack from 'prisma-next-zod-json/pack';

export const contract = defineContract({}, ({ field, model }) => ({
  extensions: { zodJson: zodJsonPack },
  models: { /* … */ },
}));
```

Change the control-plane example (current lines 53-61):

```ts
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-next-zod-json/control';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/contract.ts',
    extensions: [zodJsonExtensionDescriptor],
    db: { connection: process.env.DATABASE_URL! },
  }),
});
```

Runtime-plane example (current lines 65-69) is unchanged — `extensions: [zodJsonRuntimeDescriptor]` was already spelled correctly.

- [ ] **Step 2: Update Install and Status**

Current line 33 (`Requires zod@^4.1 (for z.fromJSONSchema) and prisma-next@0.16.`) becomes:

```
Requires `@prisma/orm-postgres@8.0.0-rc.4` (or another Prisma v8 RC Postgres target). `zod` is bundled
as a regular dependency, not something you install separately.
```

Current line 146 (`Early. prisma-next is 0.16 and still moving; this tracks it.`) becomes:

```
Early. Tracks the Prisma v8 release-candidate line (currently `8.0.0-rc.4`); still moving.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update registration examples for the rc.4 config shape"
```

---

### Task 5: Migrate the e2e fixture and prove it end to end against real Postgres

This is the task that actually proves the migration works, not just typechecks. Needs a real Postgres instance.

**Files:**
- Modify: `e2e/fixture/package.json`
- Rename+modify: `e2e/fixture/prisma-next.config.ts` → `e2e/fixture/prisma.config.ts`
- Modify: `e2e/fixture/src/prisma/contract.ts`
- Modify: `e2e/fixture/live-write-validation.mts`

**Interfaces:**
- Consumes: the library's own `dist/` build from Task 3 (fixture depends on it via `"prisma-next-zod-json": "link:../.."`, unchanged).

- [ ] **Step 1: `e2e/fixture/package.json`**

Check the exact current resolvable `prisma` CLI version first — it moves independently of the ORM packages:

```bash
npm view prisma@next version
```

Then replace the fixture's `dependencies` and `scripts` (the nine separate `@prisma-next/*` entries collapse to the one consumer facade plus the CLI, per 0.17.0's "one facade per app"):

```json
"scripts": {
  "emit": "prisma contract emit",
  "db:init": "prisma db init",
  "check": "tsx live-write-validation.mts"
},
"dependencies": {
  "@prisma/orm-postgres": "8.0.0-rc.4",
  "dotenv": "^17.0.0",
  "prisma": "<exact version from npm view above>",
  "prisma-next-zod-json": "link:../..",
  "tsx": "^4.20.0",
  "zod": "4.4.3"
}
```

- [ ] **Step 2: Rename and rewrite the config file**

```bash
git mv e2e/fixture/prisma-next.config.ts e2e/fixture/prisma.config.ts
```

New content:

```ts
import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { zodJsonExtensionDescriptor } from 'prisma-next-zod-json/control';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/contract.ts',
    // Registration 2 of 3: the control plane. Without it, `db init` fails with
    // "no expandNativeType hook is registered for codecId zod/json@1".
    extensions: [zodJsonExtensionDescriptor],
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
```

- [ ] **Step 3: `e2e/fixture/src/prisma/contract.ts`**

Change line 1's import from `@prisma-next/postgres/contract-builder` to `@prisma/orm-postgres/contract-builder`.

Change the `extensionPacks` key (current lines 24-27) to `extensions`:

```ts
    // Registration 1 of 3: the contract plane. Belongs in the object this callback returns;
    // `defineConfig` accepts an `extensions` key and silently ignores it.
    extensions: {
      zodJson: zodJsonPack,
    },
```

(The comment's claim about `defineConfig` silently ignoring the key in the wrong place is existing, verified behavior — only the key name in the comment needed updating, not the claim itself.)

- [ ] **Step 4: `e2e/fixture/live-write-validation.mts`**

Change line 9's import from `@prisma-next/postgres/runtime` to `@prisma/orm-postgres/runtime`. Nothing else in this file changes — the runtime-plane `extensions: [...]` key was already correctly named.

- [ ] **Step 5: Run the full e2e sequence locally**

This mirrors `.github/workflows/ci.yml`'s `e2e` job exactly — if this sequence passes locally, the workflow needs no edits.

Ensure a Postgres 16 instance is reachable (start one if this environment doesn't already have one, e.g. `docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=pnzj postgres:16-alpine`), then from the repo root:

```bash
pnpm build
cd e2e/fixture
pnpm install --no-frozen-lockfile
DATABASE_URL=postgresql://postgres:pg@localhost:5432/pnzj pnpm emit
node ../assert-contract.mjs
DATABASE_URL=postgresql://postgres:pg@localhost:5432/pnzj pnpm db:init
DATABASE_URL=postgresql://postgres:pg@localhost:5432/pnzj pnpm check
```

Expected: every step exits 0, and `assert-contract.mjs`'s own checks include `column?.nativeType === 'jsonb'` — this is the "physical column really is jsonb" proof the spec called for; it already exists, nothing new to add there.

Then the negative control, exactly as CI runs it:

```bash
sed -i 's/zodJson(Settings)/zodJson(Settings, { validateOnWrite: false })/' src/prisma/contract.ts
DATABASE_URL=postgresql://postgres:pg@localhost:5432/pnzj pnpm emit >/dev/null
DATABASE_URL=postgresql://postgres:pg@localhost:5432/pnzj pnpm db:init >/dev/null
DATABASE_URL=postgresql://postgres:pg@localhost:5432/pnzj pnpm check >/dev/null 2>&1 && echo "BUG: negative control did not fail" || echo "negative control correctly failed"
git checkout -- src/prisma/contract.ts
```

Expected: prints "negative control correctly failed".

- [ ] **Step 6: Commit**

```bash
cd ../..
git add e2e/fixture/package.json e2e/fixture/prisma.config.ts e2e/fixture/src/prisma/contract.ts e2e/fixture/live-write-validation.mts
git status  # confirm prisma-next.config.ts shows as deleted (captured by the git mv)
git commit -m "test(e2e): migrate the fixture to rc.4, the unified CLI, and prisma.config.ts

Proven against real Postgres: emit, both contract planes, db init,
write validation (positive and negative control) all pass on
@prisma/orm-postgres@8.0.0-rc.4."
```

---

### Task 6: Push the library branch and open a PR

**Files:** none (git/GitHub operations only)

- [ ] **Step 1: Push**

```bash
git push -u origin worktree-prisma-v8-rc-migration
```

(Already the branch this worktree is on — Tasks 1-5 committed onto it directly.)

- [ ] **Step 2: Open the PR**

```bash
gh-omar pr create --repo omar-dulaimi/prisma-next-zod-json \
  --title "Migrate to the Prisma v8 rc.4 line" \
  --body-file <(cat <<'EOF'
## Summary
- Moves off the retired `@prisma-next/*@0.16.0` scope onto `@prisma/*@8.0.0-rc.4`
- Descriptor now extends `PostgresCodecDescriptor` (was `CodecDescriptorImpl`) - see the design spec for why this is real, verified-not-inferred structural change
- `extensionPacks` -> `extensions` (contract-plane key rename)
- e2e fixture moved off the retired `prisma-next` binary onto the unified `prisma` CLI and `prisma.config.ts`
- No behavior change: encode/decode/encodeJson/decodeJson logic is untouched, proven by the full e2e suite against real Postgres

## Test plan
- [x] Unit suite green (`pnpm test`), including new decodeJson/round-trip coverage
- [x] Typecheck and build green
- [x] e2e suite green against real Postgres 16: emit, both contract planes assert correctly, jsonb column confirmed, positive + negative write-validation controls
- [ ] CI green on this PR (will self-report)

Ships as a major version bump (`scope: breaking` on the descriptor-migration commit) per the existing
semantic-release config.

Design spec: `docs/superpowers/specs/2026-08-21-v8-rc-migration-design.md`
EOF
)
```

Use whichever `gh-*` account wrapper this repo requires (check which one owns `omar-dulaimi/prisma-next-zod-json` — it's a personal repo, so `gh-omar`).

- [ ] **Step 3: Report the PR URL**

No further action on this repo until Task 11 confirms the example app is also ready — do not merge.

---

### Task 7: Set up the example app for local validation against the unmigrated-in-registry library

The library hasn't published yet (that requires a merge this plan doesn't perform), so the example app validates against a **local tarball** of the library, then switches to a registry range before its own PR opens.

**Files:**
- Modify: `~/projects/prisma-next-zod-json-example/package.json`

- [ ] **Step 1: Enter a worktree in the example app repo**

Use the `superpowers:using-git-worktrees` skill (or the `EnterWorktree` tool directly) from `~/projects/prisma-next-zod-json-example`, same as this plan's own library-side isolation.

- [ ] **Step 2: Build a tarball of the migrated library**

From the library worktree (this one):

```bash
pnpm pack --pack-destination /tmp
```

Note the resulting filename (e.g. `prisma-next-zod-json-0.1.1.tgz` — semantic-release hasn't bumped it yet, that's expected and fine for local validation).

- [ ] **Step 3: Point the example app at the tarball, temporarily**

In the example app's `package.json`, change:
```json
"prisma-next-zod-json": "^0.1.0"
```
to:
```json
"prisma-next-zod-json": "file:/tmp/prisma-next-zod-json-0.1.1.tgz"
```

This is a temporary state, corrected back to a registry range in Task 11 — do not let this line ship in the final PR.

- [ ] **Step 4: Commit as WIP (will be amended before the final PR)**

```bash
git add package.json
git commit -m "wip: point at a local tarball for migration validation"
```

---

### Task 8: Migrate the example app's dependencies and CLI/config

**Files:**
- Modify: `package.json` (continuing from Task 7)
- Rename+modify: `prisma-next.config.ts` → `prisma.config.ts`

- [ ] **Step 1: Collapse dependencies**

Check the exact current `prisma@next` version the same way Task 5 did (`npm view prisma@next version`) if it's been a while since Task 5 ran — it can move between tasks. Replace whatever `@prisma-next/*` entries and the `prisma-next` binary dependency exist in `package.json` with:

```json
"@prisma/orm-postgres": "8.0.0-rc.4",
"prisma": "<exact version from npm view>"
```

keeping every non-Prisma dependency (`dotenv`, etc.) as-is.

- [ ] **Step 2: Update scripts**

Any script invoking `prisma-next <command>` becomes `prisma <command>` (same subcommand names — confirmed in the spec via a real CLI install).

- [ ] **Step 3: Migrate the config file**

```bash
git mv prisma-next.config.ts prisma.config.ts
```

Rewrite using the same `definePrismaConfig({ orm: ormConfig({...}) })` shape as Task 5 Step 2, adjusted for whatever this app's actual config options are (read the current file's content before rewriting — don't assume it's identical to the fixture's, it's a separate real app).

- [ ] **Step 4: Grep for any other `@prisma-next` references**

```bash
grep -rn "@prisma-next" src/ test/ *.ts 2>/dev/null
```

Fix each one found the same way (import rename only — the example app doesn't implement a codec, so it should never need the descriptor-class change from Task 3).

- [ ] **Step 5: Install and typecheck**

```bash
pnpm install
pnpm typecheck   # or the equivalent script this app defines - check package.json scripts first
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: migrate to the @prisma/* v8 rc.4 line and the unified CLI"
```

---

### Task 9: Update and run the example app's own test suite against real Postgres

**Files:**
- Modify: `test/columns.test.ts` if it imports anything Prisma-package-specific (confirm by reading it first — don't assume its shape)

- [ ] **Step 1: Read the current test file and fix any stale imports**

Read `test/columns.test.ts` in full before editing — this plan doesn't have its current content in hand, unlike the library's files. Apply the same import-rename pattern as everywhere else in this plan.

- [ ] **Step 2: Run the app's full flow against real Postgres**

Using the same Postgres instance from Task 5 (or a fresh one), run whatever this app's own `emit`/`db:init`-equivalent scripts are, then its test suite. Confirm the webhook-receiver code path (`src/server.ts` or equivalent) actually exercises the codec, not just compiles against it.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: update example app tests for the rc.4 migration"
```

---

### Task 10: Switch back to a registry dependency range and finalize

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace the tarball reference**

Change:
```json
"prisma-next-zod-json": "file:/tmp/prisma-next-zod-json-0.1.1.tgz"
```
to:
```json
"prisma-next-zod-json": "^1.0.0"
```

(`^1.0.0` per the confirmed major bump from Task 3's `scope: breaking` commit — verify against the library's actual published version once Task 6's PR merges, rather than assuming `1.0.0` exactly if something else changed the bump in review.)

- [ ] **Step 2: Squash the WIP commit from Task 7**

```bash
git rebase -i <base-commit>
```
Fold the Task 7 "wip: point at a local tarball" commit into this one, or amend it directly — the tarball reference should not appear anywhere in the final commit history's tip state, only the registry range.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(breaking): depend on prisma-next-zod-json@^1.0.0

Cannot npm install successfully until the library's v1.0.0 actually
publishes - this PR should merge after that, not before."
```

---

### Task 11: Push the example app branch and open its PR

- [ ] **Step 1: Push**

```bash
git push -u origin <branch-name>
```

- [ ] **Step 2: Open the PR, explicit about sequencing**

```bash
gh-omar pr create --repo omar-dulaimi/prisma-next-zod-json-example \
  --title "Migrate to prisma-next-zod-json v1.0.0 (Prisma v8 rc.4)" \
  --body-file <(cat <<'EOF'
## Summary
Companion to omar-dulaimi/prisma-next-zod-json#<library-pr-number>. Validated locally against a tarball
build of that PR's branch (real Postgres, full app flow) before switching this diff to the registry
range shown here.

**Do not merge before the library PR merges and v1.0.0 is live on npm** - this app's `npm install` will
fail against an unpublished version until then.

## Test plan
- [x] Validated end-to-end against a local tarball of the migrated library (real Postgres)
- [ ] Re-verify `npm install` succeeds once v1.0.0 is actually published, before merging
EOF
)
```

- [ ] **Step 3: Report both PR URLs and stop**

Both repos are now green and PR-ready. Merging either PR (and the resulting `chore(release)` publish from the library's push to `main`) is a deliberate call for a human to make, not something this plan executes.

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec maps to a task — Approach (Task 3's commit message + Global Constraints' pinning rule), Design by plane (Tasks 3-5), Package changes (Task 2), CLI/CI (Task 5), Testing (Tasks 1, 5, 9), Versioning (Task 3's `scope: breaking`, Task 10's `^1.0.0`).
- **Placeholder scan:** the one intentionally-unresolved value is the exact `prisma` CLI version, and every place it appears says explicitly to re-check live rather than assume a number — that's a deliberate "don't hardcode a moving target" choice, not a placeholder.
- **Type consistency:** `ZodJsonDescriptor`, `ZodJsonCodecClass`, `zodJsonDescriptor`, `codecDescriptors`, `zodJsonCodecRegistry` are the same names end to end from Task 3 through every later task that touches them.
