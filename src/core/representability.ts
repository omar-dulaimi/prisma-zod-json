/**
 * Detects constraints that `z.toJSONSchema()` drops without telling anyone.
 *
 * Zod throws for constructs it cannot represent at all (BigInt, Date, transforms, Map, Set). It does
 * not throw for `.refine()`, `.superRefine()` or `.catch()` — those are simply absent from the emitted
 * JSON Schema, so a rehydrated validator silently stops enforcing them. Neither
 * `unrepresentable: 'throw'` nor the `io` option changes that, so the def tree is the only source of
 * truth and this module walks it.
 */

/** A constraint that would be lost, and where in the schema it lives. */
export interface Unrepresentable {
  /**
   * Dotted path from the root schema; `''` for the root itself. Container steps are marked: `[]` for
   * array elements, `[n]` for tuple positions, `{}` for record values, `|n` for union options.
   */
  path: string;
  reason: 'refinement' | 'catch' | 'transform';
}

interface ZodDef {
  type: string;
  checks?: unknown[];
  shape?: Record<string, unknown>;
  element?: unknown;
  options?: unknown[];
  left?: unknown;
  right?: unknown;
  items?: unknown[];
  rest?: unknown;
  keyType?: unknown;
  valueType?: unknown;
  innerType?: unknown;
  in?: unknown;
  out?: unknown;
  getter?: () => unknown;
}

function defOf(schema: unknown): ZodDef | undefined {
  return (schema as { _zod?: { def?: ZodDef } } | null | undefined)?._zod?.def;
}

/** Reads a check's discriminator, e.g. `custom` for a refinement, `min_length` for `.min()`. */
function checkKind(check: unknown): string | undefined {
  return (check as { _zod?: { def?: { check?: string } } } | null)?._zod?.def?.check;
}

function join(parent: string, segment: string): string {
  return parent === '' ? segment : `${parent}.${segment}`;
}

export function findUnrepresentable(schema: unknown): Unrepresentable[] {
  const found: Unrepresentable[] = [];
  // Tracks the current descent only, so a cycle terminates while a schema reused across two sibling
  // fields is still reported at both paths.
  const onPath = new Set<unknown>();

  const walk = (node: unknown, path: string): void => {
    const def = defOf(node);
    if (!def || onPath.has(node)) return;
    onPath.add(node);

    for (const check of def.checks ?? []) {
      const kind = checkKind(check);
      if (kind === 'custom') found.push({ path, reason: 'refinement' });
      // `.trim()`, `.toLowerCase()`, `.normalize()` — value-rewriting checks. They keep accepting the
      // same input after a round-trip but stop rewriting it, so the unnormalised value reaches the
      // database. Silent and in the unsafe direction, unlike the object-strictness change.
      if (kind === 'overwrite') found.push({ path, reason: 'transform' });
    }
    if (def.type === 'catch') found.push({ path, reason: 'catch' });

    for (const [key, child] of Object.entries(def.shape ?? {})) walk(child, join(path, key));
    if (def.element !== undefined) walk(def.element, join(path, '[]'));
    def.options?.forEach((option, i) => walk(option, join(path, `|${i}`)));
    if (def.left !== undefined) walk(def.left, join(path, '&left'));
    if (def.right !== undefined) walk(def.right, join(path, '&right'));
    def.items?.forEach((item, i) => walk(item, join(path, `[${i}]`)));
    if (def.rest !== undefined) walk(def.rest, join(path, '[...]'));
    if (def.keyType !== undefined) walk(def.keyType, join(path, '{key}'));
    if (def.valueType !== undefined) walk(def.valueType, join(path, '{}'));
    // Wrappers — optional, nullable, default, catch, readonly, nonoptional — do not add a path step:
    // the constraint belongs to the field the author named, not to the wrapper.
    if (def.innerType !== undefined) walk(def.innerType, path);
    if (def.in !== undefined) walk(def.in, join(path, 'in'));
    if (def.out !== undefined) walk(def.out, join(path, 'out'));
    if (def.getter !== undefined) walk(def.getter(), path);

    onPath.delete(node);
  };

  walk(schema, '');
  return found;
}
