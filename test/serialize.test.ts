import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { rehydrate, toTypeParams } from '../src/core/serialize.js';

describe('toTypeParams', () => {
  test('serialises a representable schema to versioned type params', () => {
    const params = toTypeParams(z.object({ a: z.string().min(2) }));

    expect(params.version).toBe(1);
    expect(params.jsonSchema).toMatchObject({
      type: 'object',
      properties: { a: { type: 'string', minLength: 2 } },
    });
  });

  test('refuses a refinement, naming the path and the construct', () => {
    const schema = z.object({ user: z.object({ slug: z.string().refine(() => true) }) });

    expect(() => toTypeParams(schema)).toThrowError(/user\.slug/);
    expect(() => toTypeParams(schema)).toThrowError(/refinement/);
  });

  test('refuses a normalising transform', () => {
    expect(() => toTypeParams(z.object({ email: z.string().trim() }))).toThrowError(/email/);
  });

  test('explains why, so the message is actionable rather than just a rejection', () => {
    expect(() => toTypeParams(z.string().refine(() => true))).toThrowError(
      /cannot be represented in JSON Schema/i,
    );
  });

  test('reports every offending path at once, not one per attempt', () => {
    const schema = z.object({ a: z.string().refine(() => true), b: z.string().trim() });

    expect(() => toTypeParams(schema)).toThrowError(/a[\s\S]*b/);
  });

  test('allowUnrepresentable lets an author proceed knowing the constraint is dropped', () => {
    const params = toTypeParams(z.string().refine(() => true), { allowUnrepresentable: true });

    expect(params.jsonSchema).toMatchObject({ type: 'string' });
  });

  test('wraps the constructs zod itself rejects, rather than leaking a bare zod message', () => {
    expect(() => toTypeParams(z.object({ when: z.date() }))).toThrowError(/zodJson/);
  });

  test('still refuses a construct zod rejects even under allowUnrepresentable', () => {
    expect(() => toTypeParams(z.date(), { allowUnrepresentable: true })).toThrowError(/Date/);
  });
});

describe('rehydrate', () => {
  test('rebuilds a validator that enforces the original constraints', () => {
    const validator = rehydrate(toTypeParams(z.object({ a: z.string().min(2) })));

    expect(validator.safeParse({ a: 'ab' }).success).toBe(true);
    expect(validator.safeParse({ a: 'x' }).success).toBe(false);
  });

  test('survives a JSON round-trip, as it must to travel in the contract', () => {
    const params = toTypeParams(z.object({ tier: z.enum(['free', 'pro']) }));
    const throughContract = JSON.parse(JSON.stringify(params)) as typeof params;

    const validator = rehydrate(throughContract);

    expect(validator.safeParse({ tier: 'pro' }).success).toBe(true);
    expect(validator.safeParse({ tier: 'nope' }).success).toBe(false);
  });

  test('rejects type params from a future version rather than guessing', () => {
    const params = { ...toTypeParams(z.string()), version: 99 };

    expect(() => rehydrate(params as never)).toThrowError(/version/i);
  });
});
