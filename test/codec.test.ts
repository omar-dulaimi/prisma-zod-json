import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { zodJsonDescriptor } from '../src/core/zod-json-codec.js';
import { toTypeParams } from '../src/core/serialize.js';

const ctx = {} as never;

/** Builds a codec the way the runtime does: from type params alone, with no access to the original schema. */
function codecFor(schema: z.ZodType, params = toTypeParams(schema)) {
  return zodJsonDescriptor.factory(params)(ctx);
}

const Profile = z.object({ name: z.string().min(2), age: z.number().int().min(0) });

describe('encode validates before writing', () => {
  test('serialises a valid value to a JSON string', async () => {
    const codec = codecFor(Profile);

    await expect(codec.encode({ name: 'Ada', age: 36 }, ctx)).resolves.toBe(
      '{"name":"Ada","age":36}',
    );
  });

  test('rejects a value the schema forbids, instead of storing it', async () => {
    const codec = codecFor(Profile);

    await expect(codec.encode({ name: 'x', age: 36 } as never, ctx)).rejects.toThrow();
  });

  test('names the offending path, so the caller knows which field was wrong', async () => {
    const codec = codecFor(Profile);

    await expect(codec.encode({ name: 'Ada', age: -1 } as never, ctx)).rejects.toThrow(/age/);
  });

  test('says the failure was on write, not on read', async () => {
    const codec = codecFor(Profile);

    await expect(codec.encode({ name: 'x', age: 0 } as never, ctx)).rejects.toThrow(/encode/);
  });

  test('encodeJson validates too, since it is the same write path', () => {
    const codec = codecFor(Profile);

    expect(() => codec.encodeJson({ name: 'x', age: 0 } as never)).toThrow(/encode/);
  });
});

describe('validateOnWrite: false restores the permissive behaviour', () => {
  // Stored as a truthy `'off'`, not `false`: the contract emitter drops boolean false.
  const params = { ...toTypeParams(Profile), writeValidation: 'off' as const };

  test('lets an invalid value through to storage', async () => {
    const codec = codecFor(Profile, params);

    await expect(codec.encode({ name: 'x', age: -1 } as never, ctx)).resolves.toBe(
      '{"name":"x","age":-1}',
    );
  });

  test('still validates on read, so the data is checked somewhere', async () => {
    const codec = codecFor(Profile, params);

    await expect(codec.decode('{"name":"x","age":-1}', ctx)).rejects.toThrow(/decode/);
  });
});

describe('decode validates what comes back', () => {
  test('parses and returns a valid row', async () => {
    const codec = codecFor(Profile);

    await expect(codec.decode('{"name":"Ada","age":36}', ctx)).resolves.toEqual({
      name: 'Ada',
      age: 36,
    });
  });

  test('accepts an already-parsed value, as a jsonb driver may return', async () => {
    const codec = codecFor(Profile);

    await expect(codec.decode({ name: 'Ada', age: 36 }, ctx)).resolves.toEqual({
      name: 'Ada',
      age: 36,
    });
  });

  test('rejects a stored row that no longer matches the schema', async () => {
    const codec = codecFor(Profile);

    await expect(codec.decode('{"name":"x","age":36}', ctx)).rejects.toThrow(/decode/);
  });

  test('rejects malformed JSON rather than returning a string', async () => {
    const codec = codecFor(Profile);

    await expect(codec.decode('{not json', ctx)).rejects.toThrow();
  });
});

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

describe('the descriptor identifies itself as the codec Prisma specified', () => {
  test('uses the zod/json@1 codec id', () => {
    expect(zodJsonDescriptor.codecId).toBe('zod/json@1');
  });

  test('targets jsonb', () => {
    expect(zodJsonDescriptor.targetTypes).toContain('jsonb');
  });
});

/**
 * The message wording is the package's main output when something is wrong, so it is pinned. An earlier
 * version repeated the path, reading "at `a.b`: a.b: Too big".
 */
describe('the failure message reads cleanly', () => {
  const Nested = z.object({ notifications: z.object({ digestHour: z.number().int().max(23) }) });

  test('a single issue names the path once', async () => {
    const codec = codecFor(Nested);

    await expect(
      codec.encode({ notifications: { digestHour: 99 } } as never, ctx),
    ).rejects.toThrow(
      'zod/json schema validation failed (encode) at `notifications.digestHour`: Too big: expected number to be <=23',
    );
  });

  test('several issues list every path instead of a prefix pointing at one', async () => {
    const codec = codecFor(z.object({ a: z.string(), b: z.number() }));
    const error = await codec.encode({ a: 1, b: 'x' } as never, ctx).catch((e: Error) => e);

    expect((error as Error).message).toContain('a: Invalid input');
    expect((error as Error).message).toContain('b: Invalid input');
    expect((error as Error).message).not.toContain('at `a`');
  });
});
