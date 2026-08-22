/**
 * Codec type definitions for the zod-json extension.
 *
 * Type-only export consumed by the emitted `contract.d.ts` to resolve
 * `CodecTypes['zod/json@1']['output']`.
 *
 * `output` is `unknown` here on purpose. The precise type is column-site-local: `zodJson(schema)`
 * returns a codec carrying `z.output<S>`, which the no-emit resolver reads from the column descriptor.
 * The emit path renders the type from the stored JSON Schema instead (see `renderOutputType`). This
 * codec-id-keyed map is only the fallback for sites with neither in scope.
 */

export type CodecTypes = {
  readonly 'zod/json@1': {
    readonly input: unknown;
    readonly output: unknown;
    readonly traits: 'equality';
  };
  // SPIKE
  readonly 'typed/json@1': {
    readonly input: unknown;
    readonly output: unknown;
    readonly traits: 'equality';
  };
};
