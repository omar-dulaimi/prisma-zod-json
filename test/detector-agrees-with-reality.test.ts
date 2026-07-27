import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { findUnrepresentable } from '../src/core/representability.js';

/**
 * The detector's promise: if it stays silent, the round-trip is faithful. This checks that promise
 * against actual behaviour rather than against the detector's own idea of it, so a construct zod
 * starts dropping in a future version fails here instead of shipping.
 *
 * Fidelity means same verdict AND same parsed output — `.trim()` keeps accepting `"  x  "` after a
 * round-trip while quietly no longer trimming it.
 */
const probes: unknown[] = [
  'x',
  '  x  ',
  'XY',
  '',
  'a@b.co',
  'https://a.co',
  'prefix',
  'suffix',
  'ab',
  'abcd',
  '2020-01-01T00:00:00Z',
  0,
  1,
  1.5,
  -3,
  10,
  true,
  null,
  [],
  ['a'],
  ['a', 'b', 'c'],
  {},
  { a: 'x' },
  { a: 1 },
  { a: 'x', b: 2 },
  { lo: 1, hi: 5 },
  { lo: 5, hi: 1 },
];

const corpus: [name: string, schema: z.ZodType][] = [
  // Every entry here is a construct the README lists as surviving. Adding a claim there means adding
  // a case here.
  ['string', z.string()],
  ['string.min', z.string().min(2)],
  ['string.max', z.string().max(3)],
  ['string.length', z.string().length(2)],
  ['string.startsWith', z.string().startsWith('pre')],
  ['string.endsWith', z.string().endsWith('fix')],
  ['string.regex', z.string().regex(/^a+$/)],
  ['email', z.email()],
  ['url', z.url()],
  ['iso.datetime', z.iso.datetime()],
  ['number', z.number()],
  ['number.int', z.number().int()],
  ['number.range', z.number().min(1).max(10)],
  ['number.multipleOf', z.number().multipleOf(5)],
  ['boolean', z.boolean()],
  ['literal', z.literal('x')],
  ['enum', z.enum(['a', 'b'])],
  ['nullable', z.string().nullable()],
  // Strict objects, because plain `z.object()` strips unknown keys and JSON Schema cannot say
  // "strip" — see the unknown-keys suite below. Everything else about objects is faithful.
  ['optional in object', z.strictObject({ a: z.string().optional() })],
  ['default in object', z.strictObject({ a: z.string().default('d') })],
  ['strict object', z.strictObject({ a: z.string() })],
  ['loose object', z.looseObject({ a: z.string() })],
  ['nested object', z.strictObject({ a: z.strictObject({ b: z.number() }) })],
  ['array', z.array(z.string())],
  ['array bounds', z.array(z.string()).min(1).max(2)],
  ['tuple', z.tuple([z.string(), z.number()])],
  ['tuple with rest', z.tuple([z.string()], z.number())],
  ['union', z.union([z.string(), z.number()])],
  ['record', z.record(z.string(), z.number())],
  ['intersection', z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))],
  ['pipe', z.pipe(z.string(), z.string().min(3))],
];

describe('when the detector is silent, the round-trip is faithful', () => {
  test.each(corpus)('%s', (_name, schema) => {
    if (findUnrepresentable(schema).length > 0) return; // flagged: not a claim we make

    const rehydrated = z.fromJSONSchema(z.toJSONSchema(schema) as never) as z.ZodType;

    for (const probe of probes) {
      const before = schema.safeParse(probe);
      const after = rehydrated.safeParse(probe);

      expect(after.success, `verdict changed for ${JSON.stringify(probe)}`).toBe(before.success);
      if (before.success) {
        expect(after.data, `output changed for ${JSON.stringify(probe)}`).toEqual(before.data);
      }
    }
  });
});

/**
 * The one deliberate semantic difference, pinned here so it stays deliberate.
 *
 * Zod's default object mode strips unknown keys. JSON Schema has `additionalProperties: false`
 * (forbid) and `additionalProperties: {}` (allow) but no way to say "allow in, drop from output", so
 * a round-tripped plain object rejects what it used to strip.
 *
 * We accept that rather than refuse the most common construct in the language: it turns silent data
 * loss into a loud error at the write boundary, which is the safe direction. `.trim()` is the
 * opposite — silently keeping unnormalised data — and is refused.
 */
describe('unknown keys on a plain z.object become rejected rather than stripped', () => {
  const plain = z.object({ a: z.string() });

  test('the original strips the unknown key', () => {
    expect(plain.safeParse({ a: 'x', b: 2 })).toMatchObject({ success: true, data: { a: 'x' } });
  });

  test('the round-tripped schema rejects it instead', () => {
    const rehydrated = z.fromJSONSchema(z.toJSONSchema(plain) as never) as z.ZodType;

    expect(rehydrated.safeParse({ a: 'x', b: 2 }).success).toBe(false);
  });

  test('the detector stays silent, because this is a documented difference and not a drop', () => {
    expect(findUnrepresentable(plain)).toEqual([]);
  });

  test('z.strictObject round-trips faithfully, so authors who want it can be explicit', () => {
    const strict = z.strictObject({ a: z.string() });
    const rehydrated = z.fromJSONSchema(z.toJSONSchema(strict) as never) as z.ZodType;

    expect(rehydrated.safeParse({ a: 'x', b: 2 }).success).toBe(strict.safeParse({ a: 'x', b: 2 }).success);
  });

  test('z.looseObject round-trips faithfully too, keeping the unknown key', () => {
    const loose = z.looseObject({ a: z.string() });
    const rehydrated = z.fromJSONSchema(z.toJSONSchema(loose) as never) as z.ZodType;

    expect(rehydrated.safeParse({ a: 'x', b: 2 })).toMatchObject({ success: true, data: { a: 'x', b: 2 } });
  });
});
