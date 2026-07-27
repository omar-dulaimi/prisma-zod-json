import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { renderOutputType } from '../src/core/render-output-type.js';
import { parseJsonSchema, toTypeParams } from '../src/core/serialize.js';

/** Rendered from what zod actually emits, so the cases stay true as zod's output shifts. */
function render(schema: z.ZodType): string {
  return renderOutputType(parseJsonSchema(toTypeParams(schema)));
}

describe('renderOutputType', () => {
  test.each([
    ['string', z.string(), 'string'],
    ['number', z.number(), 'number'],
    ['integer', z.number().int(), 'number'],
    ['boolean', z.boolean(), 'boolean'],
    ['null', z.null(), 'null'],
    ['any', z.any(), 'unknown'],
    ['literal', z.literal('x'), '"x"'],
    ['numeric literal', z.literal(7), '7'],
    ['enum', z.enum(['free', 'pro']), '"free" | "pro"'],
    ['array', z.array(z.string()), 'Array<string>'],
    ['nested array', z.array(z.array(z.number())), 'Array<Array<number>>'],
    ['union', z.union([z.string(), z.number()]), 'string | number'],
    ['nullable', z.string().nullable(), 'string | null'],
    ['record', z.record(z.string(), z.number()), 'Record<string, number>'],
  ])('renders %s', (_name, schema, expected) => {
    expect(render(schema)).toBe(expected);
  });

  test('renders an object with required and optional properties', () => {
    const rendered = render(z.object({ name: z.string(), age: z.number().optional() }));

    expect(rendered).toBe('{ name: string; age?: number }');
  });

  test('renders a nested object', () => {
    const rendered = render(z.object({ user: z.object({ id: z.string() }) }));

    expect(rendered).toBe('{ user: { id: string } }');
  });

  test('quotes a property name that is not a valid identifier', () => {
    const rendered = render(z.object({ 'content-type': z.string() }));

    expect(rendered).toBe('{ "content-type": string }');
  });

  test('renders a tuple with its positions', () => {
    expect(render(z.tuple([z.string(), z.number()]))).toBe('[string, number]');
  });

  test('renders a discriminated union as a union of its branches', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), value: z.string() }),
      z.object({ kind: z.literal('b'), value: z.number() }),
    ]);

    expect(render(schema)).toBe('{ kind: "a"; value: string } | { kind: "b"; value: number }');
  });

  test('renders an intersection', () => {
    const schema = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }));

    expect(render(schema)).toBe('{ a: string } & { b: number }');
  });

  test('falls back to unknown for a shape it cannot name, rather than guessing wrong', () => {
    expect(renderOutputType({ $ref: '#/definitions/Thing' })).toBe('unknown');
  });

  test('renders an empty object schema without a stray separator', () => {
    expect(render(z.object({}))).toBe('{}');
  });

  test('does not recurse forever on a self-referential schema', () => {
    const Node: z.ZodType = z.lazy(() => z.object({ tag: z.string(), next: Node.optional() }));

    expect(() => render(Node)).not.toThrow();
  });
});
