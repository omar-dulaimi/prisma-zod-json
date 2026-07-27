/**
 * Renders a TypeScript type from the stored JSON Schema.
 *
 * The emitted contract types are the reason to declare a column's shape at all, so a JSON column
 * should read as `{ name: string; age?: number }` and not as `unknown`. Anything this cannot name
 * falls back to `unknown` — a wrong type is worse than an honest one.
 */

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type Schema = Record<string, unknown>;

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null;
}

function renderLiteral(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/** Parenthesises a union or intersection so it composes correctly inside `Array<…>` and the like. */
function atomic(rendered: string): string {
  return / [|&] /.test(rendered) ? `(${rendered})` : rendered;
}

export function renderOutputType(jsonSchema: Record<string, unknown>): string {
  const seen = new Set<unknown>();

  const render = (schema: unknown): string => {
    if (!isSchema(schema)) return 'unknown';
    if (seen.has(schema)) return 'unknown';
    seen.add(schema);
    try {
      return renderNode(schema);
    } finally {
      seen.delete(schema);
    }
  };

  const renderNode = (schema: Schema): string => {
    if ('const' in schema) return renderLiteral(schema.const);

    if (Array.isArray(schema.enum)) {
      return schema.enum.length > 0 ? schema.enum.map(renderLiteral).join(' | ') : 'never';
    }

    for (const key of ['anyOf', 'oneOf'] as const) {
      const branches = schema[key];
      if (Array.isArray(branches)) return branches.map(render).join(' | ');
    }
    if (Array.isArray(schema.allOf)) return schema.allOf.map((s) => atomic(render(s))).join(' & ');

    switch (schema.type) {
      case 'string':
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'null':
        return 'null';
      case 'array':
        return renderArray(schema);
      case 'object':
        return renderObject(schema);
      default:
        return 'unknown';
    }
  };

  const renderArray = (schema: Schema): string => {
    if (Array.isArray(schema.prefixItems)) {
      const positions = schema.prefixItems.map(render);
      const rest = isSchema(schema.items) ? `, ...${atomic(render(schema.items))}[]` : '';
      return `[${positions.join(', ')}${rest}]`;
    }
    return `Array<${render(schema.items)}>`;
  };

  const renderObject = (schema: Schema): string => {
    const properties = isSchema(schema.properties) ? schema.properties : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const entries = Object.entries(properties);

    // No named properties but an open value shape: this is a record, not a struct.
    if (entries.length === 0 && isSchema(schema.additionalProperties)) {
      return `Record<string, ${render(schema.additionalProperties)}>`;
    }
    if (entries.length === 0) return '{}';

    const members = entries.map(
      ([name, value]) => `${propertyKey(name)}${required.has(name) ? '' : '?'}: ${render(value)}`,
    );
    return `{ ${members.join('; ')} }`;
  };

  return render(jsonSchema);
}
