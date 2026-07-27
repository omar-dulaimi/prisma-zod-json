import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { toTypeParams } from '../src/core/serialize.js';
import { zodJsonDescriptor } from '../src/core/zod-json-codec.js';

/**
 * A discriminated union does not survive as one: `z.fromJSONSchema` rebuilds `oneOf` as a plain union,
 * so zod tries every branch, all fail, and the top-level issue is a bare `invalid_union` — "Invalid
 * input" at the root, naming nothing.
 *
 * That guts the promise this codec makes. The per-branch failures are there in `issue.errors`, so the
 * message is recoverable: report the branch that came closest, which for a discriminated union is the
 * one whose discriminator matched.
 */
const Event = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('payment'), amountCents: z.number().int().positive(), currency: z.enum(['gbp', 'usd']) }),
  z.object({ kind: z.literal('signup'), email: z.email() }),
]);

const codec = zodJsonDescriptor.factory(toTypeParams(Event))({} as never);
const encode = (value: unknown) => codec.encode(value as never, {} as never);

describe('a union failure names the field that was actually wrong', () => {
  test('reports the offending field of the branch that matched the discriminator', async () => {
    await expect(encode({ kind: 'payment', amountCents: -5, currency: 'gbp' })).rejects.toThrow(
      /amountCents/,
    );
  });

  test('carries the underlying reason, not just the path', async () => {
    await expect(encode({ kind: 'payment', amountCents: -5, currency: 'gbp' })).rejects.toThrow(
      /Too small/,
    );
  });

  test('does not blame an unrelated branch', async () => {
    await expect(encode({ kind: 'payment', amountCents: -5, currency: 'gbp' })).rejects.not.toThrow(
      /email/,
    );
  });

  test('names a bad enum member inside the matched branch', async () => {
    await expect(encode({ kind: 'payment', amountCents: 1, currency: 'yen' })).rejects.toThrow(
      /currency/,
    );
  });

  test('names the field for the other branch too', async () => {
    await expect(encode({ kind: 'signup', email: 'nope' })).rejects.toThrow(/email/);
  });

  test('still reports something useful when no branch matches the discriminator', async () => {
    await expect(encode({ kind: 'unheard-of' })).rejects.toThrow(/kind/);
  });

  test('a plain non-union failure is unaffected', async () => {
    const simple = zodJsonDescriptor.factory(toTypeParams(z.object({ a: z.string().min(2) })))({} as never);

    await expect(simple.encode({ a: 'x' } as never, {} as never)).rejects.toThrow(/a.*Too small/s);
  });
});
