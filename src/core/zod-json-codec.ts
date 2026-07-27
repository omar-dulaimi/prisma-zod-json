/**
 * The `zod/json@1` codec: a JSON column described and enforced by a zod schema.
 *
 * The schema is serialised to JSON Schema when the column is authored, rides into the contract as
 * type params, and is rebuilt into a validator at runtime. Values are validated on the way in as well
 * as on the way out — see {@link ZodJsonCodecClass.encode}.
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
import { rehydrate, type SerializeOptions, toTypeParams, type ZodJsonTypeParams } from './serialize.js';
import { renderOutputType } from './render-output-type.js';

/** Codec id for zod-backed JSON columns. Library-bound, not target-bound. */
export const ZOD_JSON_CODEC_ID = 'zod/json@1' as const;
const ZOD_JSON_NATIVE_TYPE = 'jsonb' as const;
const ZOD_JSON_META = { db: { sql: { postgres: { nativeType: ZOD_JSON_NATIVE_TYPE } } } } as const;

/** Type params as stored in the contract. Absent `validateOnWrite` reads as on. */
export type ZodJsonParams = ZodJsonTypeParams & {
  readonly validateOnWrite?: boolean | undefined;
};

function fail(phase: 'encode' | 'decode', error: z.ZodError): never {
  const first = error.issues[0];
  const at = first && first.path.length > 0 ? ` at \`${first.path.join('.')}\`` : '';
  throw runtimeError(
    'RUNTIME.JSON_SCHEMA_VALIDATION_FAILED',
    `zod/json schema validation failed (${phase})${at}: ${error.issues
      .map((i) => `${i.path.join('.') || '(root)'} — ${i.message}`)
      .join('; ')}`,
    { codecId: ZOD_JSON_CODEC_ID, phase, issues: error.issues },
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
  jsonSchema: z.record(z.string(), z.unknown()),
  validateOnWrite: z.boolean().optional(),
}) satisfies StandardSchemaV1<ZodJsonParams>;

export class ZodJsonDescriptor extends CodecDescriptorImpl<ZodJsonParams> {
  override readonly codecId = ZOD_JSON_CODEC_ID;
  override readonly traits = ['equality'] as const;
  override readonly targetTypes = [ZOD_JSON_NATIVE_TYPE] as const;
  override readonly meta = ZOD_JSON_META;
  override readonly paramsSchema: StandardSchemaV1<ZodJsonParams> = paramsSchema;

  override renderOutputType(params: ZodJsonParams): string {
    return renderOutputType(params.jsonSchema);
  }

  override factory(params: ZodJsonParams): (ctx: CodecInstanceContext) => ZodJsonCodecClass<unknown> {
    const schema = rehydrate(params);
    const validateOnWrite = params.validateOnWrite ?? true;
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
 * schema's inferred type at the column site — the runtime factory cannot, since it only ever sees the
 * serialised params.
 *
 * Validation runs against the *rehydrated* schema, not the one passed in, even though the original is
 * right here in scope. The runtime only ever has what the contract carried, so validating against the
 * original would make a column enforce more in development than in production — which under
 * `allowUnrepresentable` it silently would. One schema, one behaviour, both paths.
 *
 * @throws {Error} if the schema uses a construct JSON Schema cannot carry. See `representability.ts`.
 */
export function zodJson<S extends z.ZodType>(
  schema: S,
  options: ZodJsonColumnOptions = {},
): ColumnSpec<ZodJsonCodecClass<z.output<S>>, ZodJsonParams> {
  const { validateOnWrite = true, ...serializeOptions } = options;
  const params: ZodJsonParams = { ...toTypeParams(schema, serializeOptions), validateOnWrite };
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
