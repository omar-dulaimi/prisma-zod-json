/**
 * The `zod/json@1` codec: a JSON column described and enforced by a zod schema.
 *
 * The schema is serialised to JSON Schema when the column is authored, rides into the contract as
 * type params, and is rebuilt into a validator at runtime. Values are validated on the way in as well
 * as on the way out; see {@link ZodJsonCodecClass.encode}.
 */
import type { JsonValue } from '@prisma-next/contract/types';
import {
  type AnyCodecDescriptor,
  type CodecCallContext,
  CodecDescriptorImpl,
  CodecImpl,
  type CodecInstanceContext,
  type ColumnHelperFor,
  type ColumnSpec,
  column,
} from '@prisma-next/framework-components/codec';
import { runtimeError } from '@prisma-next/framework-components/runtime';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import {
  parseJsonSchema,
  rehydrate,
  type SerializeOptions,
  toTypeParams,
  type ZodJsonTypeParams,
} from './serialize.js';
import { renderOutputType } from './render-output-type.js';

/** Codec id for zod-backed JSON columns. Library-bound, not target-bound. */
export const ZOD_JSON_CODEC_ID = 'zod/json@1' as const;
const ZOD_JSON_NATIVE_TYPE = 'jsonb' as const;
const ZOD_JSON_META = { db: { sql: { postgres: { nativeType: ZOD_JSON_NATIVE_TYPE } } } } as const;

/**
 * Type params as stored in the contract.
 *
 * The opt-out is a present-and-truthy `'off'` rather than `validateOnWrite: false`, because the
 * contract emitter drops boolean `false` (see `serialize.ts`). Encoded this way, a marker lost in
 * transit means validation stays **on**: the safe direction.
 */
export type ZodJsonParams = ZodJsonTypeParams & {
  readonly writeValidation?: 'off' | undefined;
};

type Issue = z.core.$ZodIssue;
type UnionIssue = Issue & { errors: readonly (readonly Issue[])[] };

const isUnionIssue = (issue: Issue): issue is UnionIssue =>
  issue.code === 'invalid_union' && Array.isArray((issue as UnionIssue).errors);

/**
 * Replaces a union failure with the failures of the branch that came closest.
 *
 * `fromJSONSchema` rebuilds `oneOf` as a plain union, so a discriminated union loses its discriminator
 * and every branch is tried. The top-level issue is then a bare "Invalid input" naming nothing, while
 * the useful detail sits in `issue.errors`, one entry per branch.
 *
 * Fewest issues wins: the branch whose discriminator matched fails only on the field that was really
 * wrong, while the others fail on the discriminator as well. When nothing matched, every branch
 * reports its discriminator, which is still the right thing to show.
 */
function flattenIssues(issues: readonly Issue[]): readonly Issue[] {
  return issues.flatMap((issue) => {
    if (!isUnionIssue(issue)) return [issue];

    const branches = issue.errors.filter((branch) => branch.length > 0);
    if (branches.length === 0) return [issue];

    const closest = branches.reduce((best, branch) => (branch.length < best.length ? branch : best));
    // Union issues nest, so a union inside a branch resolves the same way.
    const resolved = flattenIssues(closest);
    // Keep the outer path: a union nested under a field must still report that field.
    return issue.path.length === 0
      ? resolved
      : resolved.map((inner) => ({ ...inner, path: [...issue.path, ...inner.path] }));
  });
}

function fail(phase: 'encode' | 'decode', error: z.ZodError): never {
  const issues = flattenIssues(error.issues);
  const first = issues[0];
  const single = issues.length === 1 ? first : undefined;

  // One issue: name the path once in the prefix and give the bare message, so it reads
  // "at `a.b`: Too big" rather than "at `a.b`: a.b: Too big". Several issues: drop the prefix, which
  // could only point at the first, and let the list carry every path.
  const at = single && single.path.length > 0 ? ` at \`${single.path.join('.')}\`` : '';
  const detail = single
    ? single.message
    : issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

  throw runtimeError(
    'RUNTIME.JSON_SCHEMA_VALIDATION_FAILED',
    `zod/json schema validation failed (${phase})${at}: ${detail}`,
    { codecId: ZOD_JSON_CODEC_ID, phase, issues },
  );
}

function validate<T>(schema: z.ZodType, value: unknown, phase: 'encode' | 'decode'): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(phase, result.error);
  return result.data as T;
}

function parseJsonText(wire: string): unknown {
  try {
    return JSON.parse(wire);
  } catch (cause) {
    throw runtimeError(
      'RUNTIME.JSON_SCHEMA_VALIDATION_FAILED',
      `zod/json could not parse the stored value as JSON (decode): ${(cause as Error).message}`,
      { codecId: ZOD_JSON_CODEC_ID, phase: 'decode' },
    );
  }
}

function toWire(value: unknown): string {
  const wire: string | undefined = JSON.stringify(value);
  if (typeof wire !== 'string') {
    throw runtimeError(
      'RUNTIME.JSON_SCHEMA_VALIDATION_FAILED',
      `zod/json value is not representable as JSON (encode) (codecId: ${ZOD_JSON_CODEC_ID})`,
      { codecId: ZOD_JSON_CODEC_ID, phase: 'encode' },
    );
  }
  return wire;
}

export class ZodJsonCodecClass<TInferred> extends CodecImpl<
  typeof ZOD_JSON_CODEC_ID,
  readonly ['equality'],
  string | JsonValue,
  TInferred
> {
  constructor(
    descriptor: ZodJsonDescriptor,
    private readonly schema: z.ZodType,
    private readonly validateOnWrite: boolean,
  ) {
    super(descriptor);
  }

  /**
   * Unlike `arktype/json@1`, this validates before serialising. A write that does not match the schema
   * fails at the write, naming the field, rather than committing and failing on some later read.
   */
  async encode(value: TInferred, _ctx: CodecCallContext): Promise<string> {
    return toWire(this.validateOnWrite ? validate(this.schema, value, 'encode') : value);
  }

  async decode(wire: string | JsonValue, _ctx: CodecCallContext): Promise<TInferred> {
    const parsed = typeof wire === 'string' ? parseJsonText(wire) : wire;
    return validate<TInferred>(this.schema, parsed, 'decode');
  }

  encodeJson(value: TInferred): JsonValue {
    const checked = this.validateOnWrite ? validate(this.schema, value, 'encode') : value;
    return checked as JsonValue;
  }

  decodeJson(json: JsonValue): TInferred {
    return validate<TInferred>(this.schema, json, 'decode');
  }
}

/** Structural check on the stored params; the JSON Schema itself is validated by rehydration. */
const paramsSchema = z.looseObject({
  version: z.number(),
  jsonSchema: z.string(),
  writeValidation: z.literal('off').optional(),
}) satisfies StandardSchemaV1<ZodJsonParams>;

export class ZodJsonDescriptor extends CodecDescriptorImpl<ZodJsonParams> {
  override readonly codecId = ZOD_JSON_CODEC_ID;
  override readonly traits = ['equality'] as const;
  override readonly targetTypes = [ZOD_JSON_NATIVE_TYPE] as const;
  override readonly meta = ZOD_JSON_META;
  override readonly paramsSchema: StandardSchemaV1<ZodJsonParams> = paramsSchema;

  override renderOutputType(params: ZodJsonParams): string {
    return renderOutputType(parseJsonSchema(params));
  }

  override factory(params: ZodJsonParams): (ctx: CodecInstanceContext) => ZodJsonCodecClass<unknown> {
    const schema = rehydrate(params);
    const validateOnWrite = params.writeValidation !== 'off';
    return () => new ZodJsonCodecClass<unknown>(this, schema, validateOnWrite);
  }
}

export const zodJsonDescriptor = new ZodJsonDescriptor();

export interface ZodJsonColumnOptions extends SerializeOptions {
  /**
   * Skip validation on write. Off by default: a column that only validates on read lets bad data
   * commit and blames the innocent reader.
   */
  readonly validateOnWrite?: boolean;
}

/**
 * Declares a JSON column whose contents are enforced by `schema`.
 *
 * Serialises eagerly so an unrepresentable constraint fails while authoring the schema, and keeps the
 * schema's inferred type at the column site: the runtime factory cannot, since it only ever sees the
 * serialised params.
 *
 * Validation runs against the *rehydrated* schema, not the one passed in, even though the original is
 * right here in scope. The runtime only ever has what the contract carried, so validating against the
 * original would make a column enforce more in development than in production, which under
 * `allowUnrepresentable` it silently would. One schema, one behaviour, both paths.
 *
 * @throws {Error} if the schema uses a construct JSON Schema cannot carry. See `representability.ts`.
 */
export function zodJson<S extends z.ZodType>(
  schema: S,
  options: ZodJsonColumnOptions = {},
): ColumnSpec<ZodJsonCodecClass<z.output<S>>, ZodJsonParams> {
  const { validateOnWrite = true, ...serializeOptions } = options;
  const params: ZodJsonParams = {
    ...toTypeParams(schema, serializeOptions),
    // Written only when disabled: absence is the default, and the default is to validate.
    ...(validateOnWrite ? {} : { writeValidation: 'off' as const }),
  };
  const effective = rehydrate(params);

  return column(
    (_ctx: CodecInstanceContext) =>
      new ZodJsonCodecClass<z.output<S>>(zodJsonDescriptor, effective, validateOnWrite),
    zodJsonDescriptor.codecId,
    params,
    ZOD_JSON_NATIVE_TYPE,
  );
}

zodJson satisfies ColumnHelperFor<ZodJsonDescriptor>;

/** Every codec descriptor this package ships. */
export const codecDescriptors: readonly AnyCodecDescriptor[] = [zodJsonDescriptor];
