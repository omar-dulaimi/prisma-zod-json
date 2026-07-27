import { describe, expect, test } from 'vitest';
import ts from 'typescript';
import { z } from 'zod';
import { renderOutputType } from '../src/core/render-output-type.js';
import { parseJsonSchema, toTypeParams } from '../src/core/serialize.js';

/**
 * The rendered string lands in a generated `.d.ts`. If it does not parse, the consumer's build breaks
 * somewhere far from here, so every case goes through the real TypeScript parser.
 */
function syntaxErrorsIn(type: string): string[] {
  const source = ts.createSourceFile(
    'rendered.ts',
    `type Rendered = ${type};`,
    ts.ScriptTarget.ES2023,
    true,
  );
  return (source as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' '),
  );
}

const corpus: [name: string, schema: z.ZodType][] = [
  ['string', z.string()],
  ['enum', z.enum(['a', 'b'])],
  ['object', z.object({ a: z.string(), b: z.number().optional() })],
  ['deeply nested', z.object({ a: z.object({ b: z.object({ c: z.array(z.string()) }) }) })],
  ['awkward keys', z.object({ 'content-type': z.string(), '0abc': z.number(), ok: z.boolean() })],
  ['array of objects', z.array(z.object({ id: z.string() }))],
  ['array of unions', z.array(z.union([z.string(), z.number()]))],
  ['nullable array', z.array(z.string()).nullable()],
  ['array of nullables', z.array(z.string().nullable())],
  ['tuple', z.tuple([z.string(), z.number()])],
  ['tuple with rest', z.tuple([z.string()], z.number())],
  ['record of objects', z.record(z.string(), z.object({ a: z.string() }))],
  ['union of objects', z.union([z.object({ a: z.string() }), z.object({ b: z.number() })])],
  ['discriminated union', z.discriminatedUnion('k', [
    z.object({ k: z.literal('a'), v: z.string() }),
    z.object({ k: z.literal('b'), v: z.number() }),
  ])],
  ['intersection', z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))],
  ['intersection of unions', z.intersection(
    z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]),
    z.object({ c: z.boolean() }),
  )],
  ['empty object', z.object({})],
  ['literal with a quote', z.literal('say "hi"')],
  ['optional nested object', z.object({ a: z.object({ b: z.string() }).optional() })],
];

describe('every rendered type parses as TypeScript', () => {
  test.each(corpus)('%s', (_name, schema) => {
    const rendered = renderOutputType(parseJsonSchema(toTypeParams(schema)));

    expect(syntaxErrorsIn(rendered), `rendered: ${rendered}`).toEqual([]);
  });
});

describe('the parser check is real', () => {
  test('rejects a type it cannot parse', () => {
    expect(syntaxErrorsIn('{ a: }').length).toBeGreaterThan(0);
  });
});
