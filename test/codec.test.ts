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
  const params = { ...toTypeParams(Profile), validateOnWrite: false };

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

describe('the descriptor identifies itself as the codec Prisma specified', () => {
  test('uses the zod/json@1 codec id', () => {
    expect(zodJsonDescriptor.codecId).toBe('zod/json@1');
  });

  test('targets jsonb', () => {
    expect(zodJsonDescriptor.targetTypes).toContain('jsonb');
  });
});
