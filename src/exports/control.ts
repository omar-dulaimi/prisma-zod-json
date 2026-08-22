/**
 * Control-plane extension descriptor for zod-json.
 *
 * There is nothing to install, `jsonb` is a built-in Postgres type, and the schema in typeParams
 * affects runtime validation only, never DDL. So the sole control hook is an identity
 * `expandNativeType`. Lives at the control entrypoint so `src/core/**` stays free of migration-plane
 * imports.
 */

import type {
  CodecControlHooks,
  SqlControlExtensionDescriptor,
} from '@prisma/orm-family-sql/family/control';
import { ZOD_JSON_CODEC_ID } from '../core/zod-json-codec.js';
import { TYPED_JSON_CODEC_ID } from '../core/typed-json-codec.js';
import { zodJsonPackMeta } from '../core/pack-meta.js';

const zodJsonControlPlaneHooks: CodecControlHooks = {
  expandNativeType: ({ nativeType }) => nativeType,
};

export const zodJsonExtensionDescriptor: SqlControlExtensionDescriptor<'postgres'> = {
  ...zodJsonPackMeta,
  types: {
    ...zodJsonPackMeta.types,
    codecTypes: {
      ...zodJsonPackMeta.types.codecTypes,
      controlPlaneHooks: {
        [ZOD_JSON_CODEC_ID]: zodJsonControlPlaneHooks,
        [TYPED_JSON_CODEC_ID]: zodJsonControlPlaneHooks,
      },
    },
  },
  create: () => ({
    familyId: 'sql' as const,
    targetId: 'postgres' as const,
  }),
};

export default zodJsonExtensionDescriptor;
