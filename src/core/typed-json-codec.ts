/**
 * SPIKE (throwaway): a typed JSON column with no validator.
 *
 * The PJTG idea on v8: the author names a TypeScript type by reference (e.g. a global
 * `PrismaJson.Settings` the project already declares), the emitter prints that reference verbatim
 * into `contract.d.ts`, and the runtime is a passthrough over `jsonb`. No schema, no validation, no
 * dependency on a validator library.
 */
import type { JsonValue } from '@prisma/orm-framework/contract/types';
import type { ProjectionExpr } from '@prisma/orm-family-sql/relational-core/ast';
import {
  type CodecCallContext,
  CodecImpl,
  type CodecInstanceContext,
  type ColumnSpec,
  column,
} from '@prisma/orm-framework/components/codec';
import { PostgresCodecDescriptor } from '@prisma/orm-target-postgres/target/codec-descriptor';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

export const TYPED_JSON_CODEC_ID = 'typed/json@1' as const;
const TYPED_JSON_NATIVE_TYPE = 'jsonb' as const;

export type TypedJsonParams = { readonly typeRef: string };

export class TypedJsonCodecClass<T> extends CodecImpl<
  typeof TYPED_JSON_CODEC_ID,
  readonly ['equality'],
  string | JsonValue,
  T
> {
  async encode(value: T, _ctx: CodecCallContext): Promise<string> {
    return JSON.stringify(value);
  }

  async decode(wire: string | JsonValue, _ctx: CodecCallContext): Promise<T> {
    return (typeof wire === 'string' ? JSON.parse(wire) : wire) as T;
  }

  encodeJson(value: T): JsonValue {
    return value as unknown as JsonValue;
  }

  decodeJson(json: JsonValue): T {
    return json as unknown as T;
  }
}

const paramsSchema = z.looseObject({ typeRef: z.string().min(1) }) satisfies StandardSchemaV1<TypedJsonParams>;

export class TypedJsonDescriptor extends PostgresCodecDescriptor<TypedJsonParams> {
  protected override nativeType(): string {
    return TYPED_JSON_NATIVE_TYPE;
  }

  protected override jsonProjection(expression: ProjectionExpr): ProjectionExpr {
    return expression;
  }

  override readonly codecId = TYPED_JSON_CODEC_ID;
  override readonly traits = ['equality'] as const;
  override readonly targetTypes = [TYPED_JSON_NATIVE_TYPE] as const;
  override readonly paramsSchema: StandardSchemaV1<TypedJsonParams> = paramsSchema;

  /** The whole trick: the reference is printed into contract.d.ts exactly as the author wrote it. */
  override renderOutputType(params: TypedJsonParams): string {
    return params.typeRef;
  }

  override factory(_params: TypedJsonParams): (ctx: CodecInstanceContext) => TypedJsonCodecClass<unknown> {
    return () => new TypedJsonCodecClass<unknown>(this);
  }
}

export const typedJsonDescriptor = new TypedJsonDescriptor();

export function typedJson<T>(typeRef: string): ColumnSpec<TypedJsonCodecClass<T>, TypedJsonParams> {
  return column(
    (_ctx: CodecInstanceContext) => new TypedJsonCodecClass<T>(typedJsonDescriptor),
    typedJsonDescriptor.codecId,
    { typeRef },
    TYPED_JSON_NATIVE_TYPE,
  );
}
