import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { rehydrate, toTypeParams } from '../src/core/serialize.js';
import { zodJson, zodJsonDescriptor } from '../src/core/zod-json-codec.js';

/**
 * `prisma-next contract emit` does not store type params verbatim: it walks them and **drops every
 * boolean `false`, recursively**. Measured against 0.16.0 by emitting probe values — `'off'`, `true`
 * and `0` all survived; only `false` disappeared.
 *
 * That matters twice over. `additionalProperties: false` is how JSON Schema says "reject unknown
 * keys", so a naively-stored schema comes back loose and quietly persists keys it never declared. And
 * an option stored as `false` reverts to its default.
 *
 * So nothing this package stores may depend on a `false` surviving. These tests put params through a
 * transport that behaves like the emitter.
 */
function throughContractEmit<T>(params: T): T {
  return JSON.parse(
    JSON.stringify(params, (_key, value: unknown) => (value === false ? undefined : value)),
  ) as T;
}

describe('the transport model matches what the emitter really does', () => {
  test('it drops a nested boolean false', () => {
    expect(throughContractEmit({ a: { b: false, c: 1 } })).toEqual({ a: { c: 1 } });
  });

  test('it keeps truthy values, zero, and strings', () => {
    expect(throughContractEmit({ s: 'off', t: true, z: 0 })).toEqual({ s: 'off', t: true, z: 0 });
  });
});

describe('a schema survives the contract with its strictness intact', () => {
  const Strict = z.strictObject({ a: z.string() });

  test('the rehydrated schema still rejects unknown keys', () => {
    const validator = rehydrate(throughContractEmit(toTypeParams(Strict)));

    expect(validator.safeParse({ a: 'x', b: 2 }).success).toBe(false);
  });

  test('a plain object still does not silently keep unknown keys', () => {
    const validator = rehydrate(throughContractEmit(toTypeParams(z.object({ a: z.string() }))));
    const result = validator.safeParse({ a: 'x', b: 2 });

    expect(result.success === false || !('b' in (result.data as object))).toBe(true);
  });

  test('nested objects keep their strictness too', () => {
    const nested = z.strictObject({ inner: z.strictObject({ a: z.string() }) });
    const validator = rehydrate(throughContractEmit(toTypeParams(nested)));

    expect(validator.safeParse({ inner: { a: 'x', b: 2 } }).success).toBe(false);
  });

  test('ordinary constraints are unaffected', () => {
    const validator = rehydrate(throughContractEmit(toTypeParams(z.object({ a: z.string().min(2) }))));

    expect(validator.safeParse({ a: 'x' }).success).toBe(false);
    expect(validator.safeParse({ a: 'ab' }).success).toBe(true);
  });
});

describe('validateOnWrite: false survives the contract', () => {
  test('a column authored with it disabled is still disabled at runtime', async () => {
    const spec = zodJson(z.object({ a: z.string() }), { validateOnWrite: false });
    const codec = zodJsonDescriptor.factory(throughContractEmit(spec.typeParams))({} as never);

    await expect(codec.encode({ a: 123 } as never, {} as never)).resolves.toBe('{"a":123}');
  });

  test('the default is still to validate, when nothing was stored', async () => {
    const spec = zodJson(z.object({ a: z.string() }));
    const codec = zodJsonDescriptor.factory(throughContractEmit(spec.typeParams))({} as never);

    await expect(codec.encode({ a: 123 } as never, {} as never)).rejects.toThrow(/encode/);
  });

  test('a dropped marker fails safe — validation on, never silently off', async () => {
    const spec = zodJson(z.object({ a: z.string() }), { validateOnWrite: false });
    const { jsonSchema, version } = spec.typeParams as { jsonSchema: unknown; version: number };
    const codec = zodJsonDescriptor.factory({ jsonSchema, version } as never)({} as never);

    await expect(codec.encode({ a: 123 } as never, {} as never)).rejects.toThrow(/encode/);
  });
});
