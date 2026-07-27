/**
 * Serialises a zod schema into type params that travel in the contract, and rebuilds a validator from
 * them at runtime.
 *
 * Serialisation happens once, while authoring the schema, so an unrepresentable constraint is a build
 * error rather than a surprise in production.
 */
import { z } from 'zod';
import { findUnrepresentable, type Unrepresentable } from './representability.js';

/** Bumped only if the stored shape changes in a way older readers cannot interpret. */
export const TYPE_PARAMS_VERSION = 1;

// A type alias rather than an interface: TypeScript gives aliases an implicit index signature, which
// `ColumnSpec`'s `Record<string, unknown>` constraint on type params requires.
export type ZodJsonTypeParams = {
  readonly version: number;
  /**
   * The JSON Schema, **serialised to a string**.
   *
   * It would be more natural to store the object. `prisma-next contract emit` walks nested type params
   * and drops every boolean `false`: measured on 0.16.0, and `additionalProperties: false` is how
   * JSON Schema says "reject unknown keys". Stored as an object, a strict schema comes back loose and
   * quietly persists keys it never declared. A string is opaque to that walk, and to any future
   * normalisation of key order or empty values.
   */
  readonly jsonSchema: string;
};

export interface SerializeOptions {
  /**
   * Proceed even though a constraint will be dropped. For an author who knows the refinement is
   * belt-and-braces over a constraint that does survive.
   */
  readonly allowUnrepresentable?: boolean;
}

const REASON_TEXT: Record<Unrepresentable['reason'], string> = {
  refinement: 'a refinement (.refine/.superRefine), which would silently stop being enforced',
  catch: 'a .catch() fallback, which would silently stop absorbing bad input',
  transform: 'a normalising check (.trim/.toLowerCase/.normalize), which would silently stop rewriting the value',
};

function describe(found: Unrepresentable[]): string {
  return found
    .map((f) => `  • ${f.path === '' ? '(root)' : f.path}: ${REASON_TEXT[f.reason]}`)
    .join('\n');
}

export function toTypeParams(schema: unknown, options: SerializeOptions = {}): ZodJsonTypeParams {
  if (!options.allowUnrepresentable) {
    const found = findUnrepresentable(schema);
    if (found.length > 0) {
      throw new Error(
        `zodJson(schema): this schema cannot be represented in JSON Schema without losing behaviour.\n` +
          `${describe(found)}\n` +
          `Zod does not report these: they serialise without error and stop being enforced.\n` +
          `Express the rule with a constraint that survives (min/max, regex, enum, multipleOf, and the ` +
          `string formats all do), apply it outside the column, or pass ` +
          `{ allowUnrepresentable: true } to accept the loss.`,
      );
    }
  }

  let jsonSchema: Record<string, unknown>;
  try {
    jsonSchema = z.toJSONSchema(schema as z.ZodType) as Record<string, unknown>;
  } catch (cause) {
    // Zod's own refusals, BigInt, Date, transforms, Map, Set. Its message names the construct but not
    // the caller, so say where it came from.
    throw new Error(
      `zodJson(schema): zod cannot serialise this schema, ${(cause as Error).message}`,
      { cause },
    );
  }

  return { version: TYPE_PARAMS_VERSION, jsonSchema: JSON.stringify(jsonSchema) };
}

/** The JSON Schema as an object, for callers that need to inspect it (the type renderer, tests). */
export function parseJsonSchema(params: ZodJsonTypeParams): Record<string, unknown> {
  try {
    return JSON.parse(params.jsonSchema) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `zod/json@1: the stored JSON Schema is not valid JSON. The contract was likely hand-edited; ` +
        `re-run \`prisma-next contract emit\`.`,
      { cause },
    );
  }
}

export function rehydrate(params: ZodJsonTypeParams): z.ZodType {
  if (params.version !== TYPE_PARAMS_VERSION) {
    throw new Error(
      `zod/json@1: unsupported type params version ${params.version} (this build reads ` +
        `${TYPE_PARAMS_VERSION}). The column was authored by a newer version of the extension.`,
    );
  }
  return z.fromJSONSchema(parseJsonSchema(params) as never) as z.ZodType;
}
