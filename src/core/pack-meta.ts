/**
 * zod-json pack metadata: the framework-composition entry point.
 *
 * Control-stack assembly reads `types.codecTypes.import` to thread the type-side import into the
 * emitted `contract.d.ts`, and `types.storage` declares that `zod/json@1` is backed by `jsonb` on
 * Postgres.
 */

import type { CodecTypes } from '../types/codec-types.js';
import { ZOD_JSON_CODEC_ID } from './zod-json-codec.js';
import { TYPED_JSON_CODEC_ID } from './typed-json-codec.js';
import { zodJsonCodecRegistry } from './registry.js';

const zodJsonPackMetaBase = {
  kind: 'extension',
  id: 'zod-json',
  familyId: 'sql',
  targetId: 'postgres',
  version: '0.1.0',
  capabilities: {},
  // SPIKE: PSL door. `types { Prefs = typedJson.Of("PrismaJson.Prefs") }` -> typed/json@1 with typeRef.
  authoring: {
    type: {
      typedJson: {
        Of: {
          kind: 'typeConstructor' as const,
          args: [{ kind: 'string' as const, name: 'typeRef' }],
          output: {
            codecId: TYPED_JSON_CODEC_ID,
            nativeType: 'jsonb',
            typeParams: { typeRef: { kind: 'arg' as const, index: 0 } },
          },
        },
      },
    },
  },
  types: {
    codecTypes: {
      codecDescriptors: Array.from(zodJsonCodecRegistry.values()),
      import: {
        package: 'prisma-orm-extension-zod-json/codec-types',
        named: 'CodecTypes',
        alias: 'ZodJsonTypes',
      },
    },
    storage: [
      {
        typeId: ZOD_JSON_CODEC_ID,
        familyId: 'sql' as const,
        targetId: 'postgres' as const,
        nativeType: 'jsonb',
      },
      {
        typeId: TYPED_JSON_CODEC_ID,
        familyId: 'sql' as const,
        targetId: 'postgres' as const,
        nativeType: 'jsonb',
      },
    ],
  },
} as const;

/**
 * Public pack metadata. The phantom `__codecTypes` field threads the codec-types map's literal type
 * into the pack ref for contract-builder generics; it is never read at runtime.
 */
export const zodJsonPackMeta: typeof zodJsonPackMetaBase & {
  readonly __codecTypes?: CodecTypes;
} = zodJsonPackMetaBase;
