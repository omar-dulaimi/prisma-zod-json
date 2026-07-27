/**
 * zod-json pack metadata: the framework-composition entry point.
 *
 * Control-stack assembly reads `types.codecTypes.import` to thread the type-side import into the
 * emitted `contract.d.ts`, and `types.storage` declares that `zod/json@1` is backed by `jsonb` on
 * Postgres.
 */

import type { CodecTypes } from '../types/codec-types.js';
import { ZOD_JSON_CODEC_ID } from './zod-json-codec.js';
import { zodJsonCodecRegistry } from './registry.js';

const zodJsonPackMetaBase = {
  kind: 'extension',
  id: 'zod-json',
  familyId: 'sql',
  targetId: 'postgres',
  version: '0.1.0',
  capabilities: {},
  types: {
    codecTypes: {
      codecDescriptors: Array.from(zodJsonCodecRegistry.values()),
      import: {
        package: 'prisma-next-zod-json/codec-types',
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
