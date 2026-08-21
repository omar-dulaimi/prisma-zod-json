import { describe, expect, test } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };
import { zodJsonCodecRegistry } from '../src/core/registry.js';
import { zodJsonPackMeta } from '../src/core/pack-meta.js';
import { zodJsonRuntimeDescriptor } from '../src/exports/runtime.js';
import { zodJsonExtensionDescriptor } from '../src/exports/control.js';

describe('registry', () => {
  test('resolves the codec by id, so the runtime can dispatch to it', () => {
    expect(zodJsonCodecRegistry.descriptorFor('zod/json@1')?.codecId).toBe('zod/json@1');
  });

  test('lists exactly the codec this package ships', () => {
    expect(Array.from(zodJsonCodecRegistry.values()).map((d) => d.codecId)).toEqual(['zod/json@1']);
  });

  test('indexes it under jsonb, so a jsonb column can find it', () => {
    expect(zodJsonCodecRegistry.byTargetType('jsonb').map((d) => d.codecId)).toContain('zod/json@1');
  });
});

describe('pack metadata', () => {
  test('identifies the pack for framework composition', () => {
    expect(zodJsonPackMeta).toMatchObject({
      kind: 'extension',
      id: 'zod-json',
      familyId: 'sql',
      targetId: 'postgres',
    });
  });

  test('declares jsonb as the storage backing for the codec id', () => {
    expect(zodJsonPackMeta.types.storage).toEqual([
      { typeId: 'zod/json@1', familyId: 'sql', targetId: 'postgres', nativeType: 'jsonb' },
    ]);
  });

  test('points the emitter at a codec-types entrypoint that this package actually exports', () => {
    const { package: pkg } = zodJsonPackMeta.types.codecTypes.import;
    const subpath = `.${pkg.replace('prisma-zod-json', '')}`;

    expect(Object.keys((packageJson as { exports: Record<string, unknown> }).exports)).toContain(subpath);
  });
});

describe('runtime descriptor', () => {
  test('exposes the codec through the runtime codecs slot', () => {
    expect(zodJsonRuntimeDescriptor.codecs().map((c) => c.codecId)).toEqual(['zod/json@1']);
  });

  test('matches the pack identity, so the two planes describe one extension', () => {
    expect(zodJsonRuntimeDescriptor.id).toBe(zodJsonPackMeta.id);
    expect(zodJsonRuntimeDescriptor.version).toBe(zodJsonPackMeta.version);
  });
});

describe('control descriptor', () => {
  test('leaves the native type alone, since jsonb takes no parameters', () => {
    const hooks = zodJsonExtensionDescriptor.types?.codecTypes?.controlPlaneHooks?.['zod/json@1'] as
      | { expandNativeType?: (input: { nativeType: string }) => string }
      | undefined;

    expect(hooks?.expandNativeType?.({ nativeType: 'jsonb' })).toBe('jsonb');
  });
});
