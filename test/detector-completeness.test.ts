import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { findUnrepresentable } from '../src/core/representability.js';

/**
 * The completeness claim: across a broad sweep of zod constructs, every silent behaviour change is
 * either flagged by the detector or is the documented unknown-keys difference. Nothing drifts
 * unnoticed.
 *
 * This is the test that fails when a future zod version starts dropping something new, which is the
 * failure mode most likely to hurt and least likely to be noticed.
 */

/** The one sanctioned drift: a plain object stops stripping unknown keys and starts rejecting them. */
const EXTRA_KEYS = { a: 'x', b: 2 };

const probes: unknown[] = [
  'x', '  x  ', 'XY', '', 'a@b.co', 'prefix',
  0, 1, 1.5, -3, 10, true, false, null,
  [], ['a'], ['a', 'b', 'c'],
  {}, { a: 'x' }, { a: 1 }, EXTRA_KEYS,
  '2020-01-01T00:00:00Z', '00000000-0000-4000-8000-000000000000',
];

const corpus: [name: string, build: () => z.ZodType][] = [
  ['null', () => z.null()],
  ['any', () => z.any()],
  ['unknown', () => z.unknown()],
  ['never', () => z.never()],
  ['describe', () => z.string().describe('a note')],
  ['brand', () => z.string().brand<'X'>() as unknown as z.ZodType],
  ['readonly', () => z.string().readonly()],
  ['nonoptional', () => z.string().optional().nonoptional()],
  ['prefault', () => z.string().prefault('p')],
  ['nullish', () => z.string().nullish()],
  ['strictObject', () => z.strictObject({ a: z.string() })],
  ['looseObject', () => z.looseObject({ a: z.string() })],
  ['object.catchall', () => z.object({ a: z.string() }).catchall(z.number())],
  ['object.partial', () => z.object({ a: z.string() }).partial()],
  ['object.pick', () => z.object({ a: z.string(), b: z.number() }).pick({ a: true })],
  ['array.nonempty', () => z.array(z.string()).nonempty()],
  ['number.positive', () => z.number().positive()],
  ['number.nonnegative', () => z.number().nonnegative()],
  ['number.finite', () => z.number().finite()],
  ['number.safe', () => z.number().safe()],
  ['number.multipleOf', () => z.number().multipleOf(5)],
  ['string.base64', () => z.base64()],
  ['string.nanoid', () => z.nanoid()],
  ['string.cuid', () => z.cuid()],
  ['string.ulid', () => z.ulid()],
  ['string.ipv4', () => z.ipv4()],
  ['string.jwt', () => z.jwt()],
  ['string.emoji', () => z.string().emoji()],
  ['iso.date', () => z.iso.date()],
  ['iso.time', () => z.iso.time()],
  ['iso.duration', () => z.iso.duration()],
  ['iso.datetime', () => z.iso.datetime()],
  ['literal null', () => z.literal(null)],
  ['literal bool', () => z.literal(true)],
  ['union of literals', () => z.union([z.literal('a'), z.literal(1)])],
  ['deep default', () => z.strictObject({ a: z.strictObject({ b: z.string().default('d') }) })],
  ['optional with default', () => z.string().default('d').optional()],
  ['array of enum', () => z.array(z.enum(['a', 'b']))],
  ['record with enum key', () => z.record(z.enum(['a', 'b']), z.string())],
  ['nested union', () => z.strictObject({ a: z.union([z.string(), z.strictObject({ b: z.number() })]) })],
  ['tuple with rest', () => z.tuple([z.string()], z.number())],
  ['intersection', () => z.intersection(z.strictObject({ a: z.string() }), z.strictObject({ b: z.number() }))],
];

function driftsFor(schema: z.ZodType): unknown[] {
  const rehydrated = z.fromJSONSchema(z.toJSONSchema(schema) as never) as z.ZodType;

  return probes.filter((probe) => {
    const before = schema.safeParse(probe);
    const after = rehydrated.safeParse(probe);
    if (before.success !== after.success) return true;
    return before.success && JSON.stringify(before.data) !== JSON.stringify(after.data);
  });
}

describe('nothing drifts without the detector noticing', () => {
  test.each(corpus)('%s', (_name, build) => {
    const schema = build();
    if (findUnrepresentable(schema).length > 0) return; // flagged: no claim made

    // The extra-keys probe is the one sanctioned exception (see the unknown-keys suite). Everything
    // else must be identical before and after.
    const unexplained = driftsFor(schema).filter((probe) => probe !== EXTRA_KEYS);

    expect(unexplained).toEqual([]);
  });
});

describe('the sanctioned exception really is only about unknown keys', () => {
  test('it affects strip-mode objects and nothing else', () => {
    const stripMode = corpus
      .map(([name, build]) => [name, build()] as const)
      .filter(([, schema]) => findUnrepresentable(schema).length === 0)
      .filter(([, schema]) => driftsFor(schema).includes(EXTRA_KEYS))
      .map(([name]) => name);

    // Both reach a plain z.object() internally; a new name appearing here needs explaining.
    expect(stripMode).toEqual(['object.partial', 'object.pick']);
  });
});

describe('the sweep is sensitive enough to catch a real drop', () => {
  test('an unflagged refinement would be caught by driftsFor', () => {
    expect(driftsFor(z.string().refine((s) => s === 'x')).length).toBeGreaterThan(0);
  });

  test('constructs zod itself refuses throw rather than drifting quietly', () => {
    for (const build of [
      () => z.nan(),
      () => z.undefined(),
      () => z.void(),
      () => z.symbol(),
      () => z.custom<string>((v) => typeof v === 'string'),
      () => z.bigint(),
      () => z.date(),
      () => z.map(z.string(), z.number()),
      () => z.set(z.string()),
    ]) {
      expect(() => z.toJSONSchema(build() as z.ZodType)).toThrow();
    }
  });
});
