import { buildCodecDescriptorRegistry } from '@prisma-next/sql-relational-core/codec-descriptor-registry';
import type { CodecDescriptorRegistry } from '@prisma-next/sql-relational-core/query-lane-context';
import { codecDescriptors } from './zod-json-codec.js';

/**
 * Every codec descriptor shipped by this package: currently just `zod/json@1`.
 *
 * Kept in the same registry shape the other codec-shipping packages use, so consumers do not have to
 * special-case extensions.
 */
export const zodJsonCodecRegistry: CodecDescriptorRegistry =
  buildCodecDescriptorRegistry(codecDescriptors);
