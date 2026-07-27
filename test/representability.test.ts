import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { findUnrepresentable } from '../src/core/representability.js';

describe('findUnrepresentable', () => {
  test('reports a top-level refinement, which JSON Schema silently drops', () => {
    const found = findUnrepresentable(z.string().refine((s) => s.startsWith('a')));

    expect(found).toEqual([{ path: '', reason: 'refinement' }]);
  });

  test('reports the path to a refinement nested inside objects', () => {
    const schema = z.object({
      user: z.object({ slug: z.string().refine((s) => s === s.toLowerCase()) }),
    });

    expect(findUnrepresentable(schema)).toEqual([{ path: 'user.slug', reason: 'refinement' }]);
  });

  test('finds nothing in a schema built only from representable constraints', () => {
    const schema = z.object({
      name: z.string().min(2).max(40),
      age: z.number().int().min(0),
      email: z.email(),
      tags: z.array(z.string()).max(5),
      tier: z.enum(['free', 'pro']),
    });

    expect(findUnrepresentable(schema)).toEqual([]);
  });
});

/**
 * A container the walker forgets to descend into is a refinement it silently misses — the exact bug
 * this module exists to prevent. One case per child-key branch.
 */
describe('findUnrepresentable traverses every container', () => {
  const refined = () => z.string().refine((s) => s.length > 1, 'nope');

  const cases: [name: string, schema: unknown, path: string][] = [
    ['object', z.object({ a: refined() }), 'a'],
    ['array element', z.array(refined()), '[]'],
    ['union option', z.union([z.number(), refined()]), '|1'],
    ['intersection left', z.intersection(z.object({ a: refined() }), z.object({ b: z.number() })), '&left.a'],
    ['intersection right', z.intersection(z.object({ a: z.string() }), z.object({ b: refined() })), '&right.b'],
    ['tuple item', z.tuple([z.number(), refined()]), '[1]'],
    ['tuple rest', z.tuple([z.number()], refined()), '[...]'],
    ['record value', z.record(z.string(), refined()), '{}'],
    ['optional inner', refined().optional(), ''],
    ['nullable inner', refined().nullable(), ''],
    ['default inner', refined().default('xx'), ''],
    ['readonly inner', refined().readonly(), ''],
    ['pipe in', z.pipe(refined(), z.string()), 'in'],
    ['pipe out', z.pipe(z.string(), refined()), 'out'],
    ['lazy', z.lazy(() => z.object({ a: refined() })), 'a'],
    ['deeply nested', z.object({ a: z.array(z.object({ b: refined() })) }), 'a.[].b'],
  ];

  test.each(cases)('finds a refinement through %s', (_name, schema, path) => {
    expect(findUnrepresentable(schema)).toEqual([{ path, reason: 'refinement' }]);
  });

  test('terminates on a self-referential lazy schema', () => {
    const Node: z.ZodType = z.lazy(() => z.object({ next: Node.optional(), tag: z.string() }));

    expect(findUnrepresentable(Node)).toEqual([]);
  });

  test('reports every refinement, not just the first', () => {
    const schema = z.object({ a: refined(), b: z.object({ c: refined() }) });

    expect(findUnrepresentable(schema)).toEqual([
      { path: 'a', reason: 'refinement' },
      { path: 'b.c', reason: 'refinement' },
    ]);
  });
});

describe('findUnrepresentable catches the other silent drops', () => {
  test('reports .catch(), whose fallback does not survive', () => {
    expect(findUnrepresentable(z.object({ a: z.string().catch('fb') }))).toEqual([
      { path: 'a', reason: 'catch' },
    ]);
  });

  test('reports an object-level refinement comparing two fields', () => {
    const schema = z.object({ lo: z.number(), hi: z.number() }).refine((o) => o.lo < o.hi);

    expect(findUnrepresentable(schema)).toEqual([{ path: '', reason: 'refinement' }]);
  });

  test.each([
    ['trim', z.string().trim()],
    ['toLowerCase', z.string().toLowerCase()],
    ['toUpperCase', z.string().toUpperCase()],
    ['normalize', z.string().normalize()],
  ])('reports .%s(), which stops mutating after a round-trip', (_name, schema) => {
    expect(findUnrepresentable(schema)).toEqual([{ path: '', reason: 'transform' }]);
  });

  test('reports a normalising transform nested in an object', () => {
    const schema = z.object({ email: z.string().trim().toLowerCase() });

    expect(findUnrepresentable(schema)).toEqual([
      { path: 'email', reason: 'transform' },
      { path: 'email', reason: 'transform' },
    ]);
  });

  test('reports superRefine the same as refine', () => {
    const schema = z.string().superRefine(() => {});

    expect(findUnrepresentable(schema)).toEqual([{ path: '', reason: 'refinement' }]);
  });
});
