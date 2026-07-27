import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { zodJson, zodJsonDescriptor } from '../src/core/zod-json-codec.js';

const ctx = {} as never;

describe('zodJson column spec', () => {
  const spec = zodJson(z.object({ a: z.string().min(2) }));

  test('declares the zod/json@1 codec on a jsonb column', () => {
    expect(spec).toMatchObject({ codecId: 'zod/json@1', nativeType: 'jsonb' });
  });

  test('carries the serialised schema in typeParams, so it reaches the contract', () => {
    expect(spec.typeParams).toMatchObject({
      version: 1,
      jsonSchema: { type: 'object', properties: { a: { type: 'string', minLength: 2 } } },
    });
  });

  test('survives JSON serialisation into the contract and back', () => {
    const throughContract = JSON.parse(JSON.stringify(spec.typeParams)) as typeof spec.typeParams;
    const codec = zodJsonDescriptor.factory(throughContract)(ctx);

    expect(() => codec.encodeJson({ a: 'x' } as never)).toThrow(/encode/);
  });
});

/**
 * The column site has the author's original schema in a closure; the runtime factory has only what
 * the contract carried. If the two disagree, the column enforces different rules depending on which
 * built it — passing in development and failing in production, or the reverse. They must not.
 */
describe('the column site and the runtime factory enforce identical rules', () => {
  const cases: [name: string, schema: z.ZodType, options: Parameters<typeof zodJson>[1], probe: unknown][] = [
    ['a dropped refinement', z.string().refine((s) => s.startsWith('a')), { allowUnrepresentable: true }, 'zzz'],
    ['a dropped catch', z.string().catch('fb'), { allowUnrepresentable: true }, 123],
    ['a dropped normaliser', z.string().trim(), { allowUnrepresentable: true }, '  x  '],
    ['a representable constraint', z.string().min(2), {}, 'x'],
    ['a valid value', z.string().min(2), {}, 'ok'],
  ];

  test.each(cases)('agree on %s', async (_name, schema, options, probe) => {
    const spec = zodJson(schema, options);
    const atColumnSite = spec.codecFactory(ctx);
    const atRuntime = zodJsonDescriptor.factory(spec.typeParams)(ctx);

    const columnResult = await atColumnSite.encode(probe as never, ctx).then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: undefined }),
    );
    const runtimeResult = await atRuntime.encode(probe as never, ctx).then(
      (v) => ({ ok: true, v }),
      () => ({ ok: false, v: undefined }),
    );

    expect(columnResult).toEqual(runtimeResult);
  });
});
