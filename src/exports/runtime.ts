/**
 * Runtime-plane extension descriptor for zod-json.
 *
 * Registers the `zod/json@1` descriptor through the SQL runtime's `codecs:` slot. Lives at the
 * runtime entrypoint so `src/core/**` stays free of runtime-plane imports.
 */

import type { SqlRuntimeExtensionDescriptor } from '@prisma-next/sql-runtime';
import { zodJsonPackMeta } from '../core/pack-meta.js';
import { zodJsonCodecRegistry } from '../core/registry.js';

export const zodJsonRuntimeDescriptor: SqlRuntimeExtensionDescriptor<'postgres'> = {
  kind: 'extension' as const,
  id: zodJsonPackMeta.id,
  version: zodJsonPackMeta.version,
  familyId: 'sql' as const,
  targetId: 'postgres' as const,
  types: {
    codecTypes: {
      codecDescriptors: Array.from(zodJsonCodecRegistry.values()),
    },
  },
  codecs: () => Array.from(zodJsonCodecRegistry.values()),
  create() {
    return {
      familyId: 'sql' as const,
      targetId: 'postgres' as const,
    };
  },
};

export default zodJsonRuntimeDescriptor;
